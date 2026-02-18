// === Web Worker: WASM-backed 曲线生成 + 像素处理 (零拷贝 + OffscreenCanvas) ===

let wasmInstance = null;
let wasmMemory = null;
let cachedW = 0, cachedH = 0;
let curveOffset = 0;

// 初始化 WASM（从外部 .wasm 文件加载）
async function initWasm(wasmUrl) {
    const response = await fetch(wasmUrl);
    const wasmBytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(wasmBytes);
    wasmInstance = instance;
    wasmMemory = instance.exports.memory;
    if (instance.exports._initialize) instance.exports._initialize();
}

// 确保 WASM 线性内存足够大
function ensureMemory(neededBytes) {
    const currentBytes = wasmMemory.buffer.byteLength;
    if (neededBytes > currentBytes) {
        const pagesNeeded = Math.ceil((neededBytes - currentBytes) / 65536);
        try {
            wasmMemory.grow(pagesNeeded);
        } catch (e) {
            const mb = Math.round(neededBytes / 1048576);
            throw new Error(`图片过大，需要 ${mb}MB 内存，超出浏览器限制。请缩小图片后重试。`);
        }
    }
}

/*
 * 优化内存布局 — 用 src+dst 区域作为曲线的临时存储
 *
 * 布局: [64KB base] [idx: N*4] [src: N*4] [dst: N*4]
 * 总计: 64KB + N*12 字节 (之前 N*20)
 *
 * 生成曲线时:
 *   [64KB] [idx: N*4] [ curve 临时区: N*8 = src+dst ]
 * 然后 precompute_indices 写入 idx，之后 src+dst 被像素数据覆盖
 */
function prepareCurve(w, h) {
    const totalPixels = w * h;
    const baseOffset = 65536;
    const idxBytes   = totalPixels * 4;      // 预计算索引表
    const pixelBytes = totalPixels * 4;
    // idx + src + dst = N*4 + N*4 + N*4 = N*12
    // 曲线临时需要 N*8，src+dst = N*8，完美重叠
    const totalNeeded = baseOffset + idxBytes + pixelBytes * 2;

    ensureMemory(totalNeeded);

    const idxOffset = baseOffset;
    const srcOffset = idxOffset + idxBytes;
    const dstOffset = srcOffset + pixelBytes;
    // 曲线临时写入 src+dst 区域（N*8 字节）
    const curveScratch = srcOffset;

    if (w !== cachedW || h !== cachedH) {
        wasmInstance.exports.gilbert2d(w, h, curveScratch);
        wasmInstance.exports.precompute_indices(w, totalPixels, curveScratch, idxOffset);
        cachedW = w;
        cachedH = h;
    }

    return { idxOffset, srcOffset, dstOffset, totalPixels };
}

self.onmessage = async function(e) {
    if (e.data.type === 'init') {
        await initWasm(e.data.wasmUrl);
        self.postMessage({ type: 'ready' });
        return;
    }

    try {
    const { imageBitmap, width, height, isEncrypt, outputFormat } = e.data;
    const { idxOffset: iOff, srcOffset: sOff, dstOffset: dOff, totalPixels } =
        prepareCurve(width, height);

    // 使用 OffscreenCanvas 在 Worker 线程内完成所有 canvas 操作
    const cvs = new OffscreenCanvas(width, height);
    const ctx = cvs.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close();

    const srcData = ctx.getImageData(0, 0, width, height).data;

    // 零拷贝写入 WASM 线性内存
    new Uint8Array(wasmMemory.buffer, sOff, srcData.byteLength).set(srcData);

    // 调用 C pixel_shuffle（使用预计算索引表）
    wasmInstance.exports.pixel_shuffle(
        totalPixels,
        isEncrypt ? 1 : 0,
        iOff, sOff, dOff
    );

    // 从 WASM 内存读取结果，写入 OffscreenCanvas
    const dstPixels = new Uint8ClampedArray(
        wasmMemory.buffer, dOff, totalPixels * 4
    );
    const imgData = new ImageData(
        new Uint8ClampedArray(dstPixels), width, height
    );
    ctx.putImageData(imgData, 0, 0);

    // 图片编码在 Worker 线程完成，不阻塞主线程
    const blobOpts = outputFormat === 'image/jpeg'
        ? { type: 'image/jpeg', quality: 0.95 }
        : { type: 'image/png' };
    const blob = await cvs.convertToBlob(blobOpts);

    self.postMessage({ type: 'result', blob });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message || '处理失败' });
    }
};

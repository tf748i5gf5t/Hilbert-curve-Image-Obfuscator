// DOM 元素获取
const img = document.getElementById("display-img");
const placeholder = document.getElementById("placeholder");
const loader = document.getElementById("loader");
const ipt = document.getElementById("ipt");
const btn_enc = document.getElementById("enc");
const btn_dec = document.getElementById("dec");
const btn_del = document.getElementById("del");
const btn_revert = document.getElementById("revert");
const imageContainer = document.getElementById("image-container");
const urlInput = document.getElementById("url-ipt");
const urlUploadBtn = document.getElementById("url-upload-btn");
const urlError = document.getElementById("url-error");
const clearUrlBtn = document.getElementById("clear-url-btn");

// 存储原始图片的对象URL
let originalImageSrc = null;

// --- 创建 Web Worker 并初始化 WASM ---
const worker = new Worker('worker.js');
let wasmReady = false;

// 发送 WASM 文件路径给 Worker 进行初始化
worker.postMessage({ type: 'init', wasmUrl: 'pixel_shuffle.wasm' });
worker.addEventListener('message', function onReady(e) {
    if (e.data.type === 'ready') {
        wasmReady = true;
        worker.removeEventListener('message', onReady);
    }
});


// 更新按钮状态的函数
function updateButtonStates(isEnabled) {
    const buttonsToToggle = [btn_enc, btn_dec, btn_revert, btn_del];
    buttonsToToggle.forEach(button => {
        button.disabled = !isEnabled;
        if (isEnabled) {
            button.classList.remove('opacity-[0.38]', 'cursor-not-allowed', 'pointer-events-none');
        } else {
            button.classList.add('opacity-[0.38]', 'cursor-not-allowed', 'pointer-events-none');
        }
    });
}

// 显示/隐藏加载动画
function showLoader(isLoading) {
    if (isLoading) {
        loader.classList.remove('hidden');
        img.classList.add('hidden');
        placeholder.classList.add('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

// 回收当前显示图片的 Blob URL（公共辅助函数）
function revokeCurrentBlobURL() {
    if (img.src && img.src !== originalImageSrc && img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
    }
}

// 设置图片源，并管理内存
function setsrc(newSrc) {
    revokeCurrentBlobURL();
    img.src = newSrc;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
    showLoader(false);
}

// 重置UI到初始状态，并清理所有对象URL
function resetUI() {
    revokeCurrentBlobURL();
    if (originalImageSrc) {
        URL.revokeObjectURL(originalImageSrc);
        originalImageSrc = null;
    }

    img.src = '';
    ipt.value = '';

    img.classList.add('hidden');
    loader.classList.add('hidden');
    placeholder.classList.remove('hidden');

    updateButtonStates(false); // 禁用按钮
}

// 核心处理函数（通过 WASM Worker 异步执行，所有 canvas 操作在 Worker 内完成）
async function processImage(imageElement, isEncrypt) {
    if (!wasmReady) {
        console.warn('WASM 尚未初始化完成，请稍候…');
        return;
    }
    showLoader(true);
    updateButtonStates(false);

    const width = imageElement.naturalWidth;
    const height = imageElement.naturalHeight;

    // 创建 ImageBitmap（可 transfer 给 Worker，零拷贝）
    const imageBitmap = await createImageBitmap(imageElement);

    // Transfer ImageBitmap 给 Worker，主线程不再做任何 canvas 操作
    // 读取用户选择的输出格式
    const outputFormat = document.querySelector('input[name="fmt"]:checked').value;

    worker.postMessage(
        { imageBitmap, width, height, isEncrypt, outputFormat },
        [imageBitmap]
    );

    worker.onmessage = (e) => {
        if (e.data.type === 'result') {
            // Worker 返回 Blob，直接显示
            setsrc(URL.createObjectURL(e.data.blob));
            updateButtonStates(true);
        } else if (e.data.type === 'error') {
            // Worker 报告错误（如内存不足）
            showLoader(false);
            img.classList.remove('hidden');
            updateButtonStates(true);
            urlError.innerHTML = '<span class="material-symbols-outlined text-sm">error</span> ' + e.data.message;
            urlError.classList.remove('hidden');
            setTimeout(() => urlError.classList.add('hidden'), 5000);
        }
    };
}

// --- 处理新图片（来自文件或URL） ---
function handleNewImage(imageBlob) {
    resetUI();
    originalImageSrc = URL.createObjectURL(imageBlob);
    setsrc(originalImageSrc);
    updateButtonStates(true);
}

// --- 事件监听 ---

// 文件输入框变化 (上传新文件)
ipt.addEventListener('change', () => {
    if (ipt.files && ipt.files.length > 0) {
        handleNewImage(ipt.files[0]);
    }
});

// URL输入框内容变化时，显示/隐藏清空按钮
urlInput.addEventListener('input', () => {
    if (urlInput.value.trim() !== '') {
        clearUrlBtn.classList.remove('hidden');
    } else {
        clearUrlBtn.classList.add('hidden');
    }
});

// 点击清空按钮
clearUrlBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearUrlBtn.classList.add('hidden');
    urlInput.focus();
});

// 从URL加载按钮
urlUploadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
        urlError.innerHTML = '<span class="material-symbols-outlined text-sm">error</span> 请输入图片URL。';
        urlError.classList.remove('hidden');
        return;
    }
    urlError.classList.add('hidden');
    showLoader(true);

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`网络响应错误: ${response.statusText}`);
            }
            return response.blob();
        })
        .then(blob => {
            if (!blob.type.startsWith('image/')) {
                throw new Error('URL指向的不是一个有效的图片文件。');
            }
            handleNewImage(blob);
        })
        .catch(error => {
            console.error('加载URL图片失败:', error);
            urlError.innerHTML = `<span class="material-symbols-outlined text-sm">error</span> 加载失败: ${error.message}`;
            urlError.classList.remove('hidden');
            showLoader(false);
            placeholder.classList.remove('hidden'); // 确保提示文本可见
        });
});

// 混淆按钮
btn_enc.addEventListener('click', () => {
    if (img.src) {
        processImage(img, true);
    }
});

// 解混淆按钮
btn_dec.addEventListener('click', () => {
    if (img.src) {
        processImage(img, false);
    }
});

// 还原按钮
btn_revert.addEventListener('click', () => {
    if (originalImageSrc && img.src !== originalImageSrc) {
        setsrc(originalImageSrc);
    }
});

// 删除按钮
btn_del.addEventListener('click', resetUI);

// --- 点击和拖拽上传功能 ---

imageContainer.addEventListener('click', () => {
    ipt.click();
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    imageContainer.addEventListener(eventName, preventDefaults, false);
});

['dragenter', 'dragover'].forEach(eventName => {
    imageContainer.addEventListener(eventName, () => imageContainer.classList.add('drag-over'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    imageContainer.addEventListener(eventName, () => imageContainer.classList.remove('drag-over'), false);
});

imageContainer.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
        if (files[0].type.startsWith('image/')) {
            ipt.files = files;
            const event = new Event('change', { bubbles: true });
            ipt.dispatchEvent(event);
        } else {
            // 拖放了非图片文件，给用户提示
            urlError.innerHTML = '<span class="material-symbols-outlined text-sm">error</span> 请拖放图片文件（如 JPG、PNG 等）。';
            urlError.classList.remove('hidden');
            setTimeout(() => urlError.classList.add('hidden'), 3000);
        }
    }
}, false);

// --- 初始化 ---
updateButtonStates(false); // 页面加载时禁用所有操作按钮

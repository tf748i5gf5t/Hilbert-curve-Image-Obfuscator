# Image Obfuscator

基于 **Hilbert 曲线**的图片像素混淆工具，使用 WebAssembly 加速处理。

🔗 [**在线体验**](https://tf748i5gf5t.github.io/Hilbert-curve-Image-Obfuscator/web/)

![demo](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![license](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)


## 🚀 快速开始

### 在线使用

直接访问 [GitHub Pages](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white) 即可使用，无需安装。

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/tf748i5gf5t/Hilbert-curve-Image-Obfuscator.git
cd Hilbert-curve-Image-Obfuscator/web

# 启动本地服务器（任选一种）
python -m http.server 8080
# 或
npx serve .
```

浏览器打开 `http://localhost:8080` 即可。

> ⚠️ 直接双击 `index.html` 无法运行，因为 Web Worker 和 WASM 需要 HTTP 服务。

## 📂 项目结构

```
├── web
    ├── index.html           # 主页面（HTML 结构）
    ├── style.css            # 样式（MD3 暗色主题）
    ├── app.js               # 主线程逻辑（DOM 交互、Worker 通信）
    ├── worker.js            # Web Worker（WASM 加载、曲线生成、像素处理）
    └── pixel_shuffle.wasm   # WebAssembly 二进制模块
├── pixel_shuffle.c      # WASM 源码（C 语言）
└── README.md
```

## 🔧 技术栈

| 层级 | 技术 |
|------|------|
| UI | HTML + Tailwind CSS + Material Symbols |
| 样式 | Material Design 3 暗色主题 |
| 逻辑 | Vanilla JavaScript |
| 计算 | C → WebAssembly (Emscripten) |
| 并行 | Web Worker + OffscreenCanvas |

## 📐 工作原理

1. **Hilbert 曲线生成** — 根据图片尺寸生成 [Hilbert 空间填充曲线](https://en.wikipedia.org/wiki/Hilbert_curve)坐标序列
2. **像素索引预计算** — 将 (x, y) 坐标转换为一维像素索引表
3. **像素重排** — 沿曲线路径以黄金比例偏移量交换像素位置
4. **可逆性** — 混淆和解混淆使用相同的曲线和偏移量，操作互逆

## 🛠️ 编译 WASM（可选）

如需修改 C 源码并重新编译：

```bash
# 安装 Emscripten SDK
# https://emscripten.org/docs/getting_started/downloads.html

emcc pixel_shuffle.c -O3 -o pixel_shuffle.wasm --no-entry \
  -s STANDALONE_WASM=1 \
  -s INITIAL_MEMORY=256MB \
  -s MAXIMUM_MEMORY=1GB \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s TOTAL_STACK=65536
```

## 📄 License

[MIT](LICENSE)

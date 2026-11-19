文字识别程序（工作台“校历 → 上传校历”用，2026-10-28）：
  tesseract.min.js、worker.min.js —— Tesseract.js 7.0.0（npm tesseract.js，Apache-2.0）
  tesseract-core-simd-lstm.wasm.js、tesseract-core-lstm.wasm.js —— tesseract.js-core 7.0.0（Apache-2.0）
  tesseract.min.js.LICENSE.txt、worker.min.js.LICENSE.txt —— 上面两个打包文件里所含第三方组件的许可说明（regenerator-runtime、buffer、ieee754、zlib.js），
    取自 npm tesseract.js 7.0.0 的 dist/（2026-11-19 补；tesseract.min.js 开头注明“许可见 tesseract.min.js.LICENSE.txt”）
  lang/chi_sim.traineddata.gz —— 简体中文字库（npm @tesseract.js-data/chi_sim 1.0.0 的 4.0.0_best_int，Apache-2.0）
放在本站，不从第三方网站下载；只在老师点“上传校历”时才加载。

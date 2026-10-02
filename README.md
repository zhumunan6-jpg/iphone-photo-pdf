# 照片成册

为 iPhone 做的照片转 PDF 网页应用。从相册一次选多张照片，一张一页，合成后通过系统分享菜单存储到“文件”。无需账户、服务器上传或订阅。

## 使用

1. 用 iPhone Safari 打开部署网址，选择“从相册选择照片”，可多选。
2. 按需要前后移动、旋转或删除照片。
3. 输入文件名，点击“生成 PDF”。默认 A4，横竖方向随照片自动调整，完整显示照片，不裁切；也可选“与照片比例一致”。
4. 点击“保存到文件 / 分享”，在 iOS 系统菜单中选择“存储到‘文件’”，选目录并确认。网站不能直接写入 iPhone 的指定目录，保存由系统菜单和用户操作完成。
5. Safari 分享菜单 → 添加到主屏幕，即可像 App 一样打开。

首次联网加载完毕后，应用资源由 Service Worker 缓存，可离线使用。关闭或刷新页面会清空照片与尚未保存的 PDF。未将照片或 PDF 写入浏览器持久存储，也不发送到服务器。请在离开前保存。

## 格式与兼容性

- 支持浏览器可解码的 JPEG、PNG、WebP 等图片。透明图片以白色背景处理。
- iPhone HEIC/HEIF 依赖 Safari 原生解码，建议 iOS 17 或更新版本；无法解码时会列出失败文件，绝不会悄悄把失败图片算作 PDF 页面。
- 读取时遵循浏览器的 EXIF 方向；另可手动旋转。
- 为控制 iPhone 内存和 PDF 大小，照片长边最多 2800 像素，以 JPEG 质量 0.92 转换。正常 A4 阅读和作业提交保持清晰，输出并非原图无损封装。
- 逐张读取和合成，避免同时解码多张高分辨率照片。大量照片仍可能超过设备内存；失败时应减少单次张数。
- 系统文件分享不可用时提供下载和 PDF 预览作为替代路径。真实 iPhone 相册和“文件”保存流程需在手机上完成验收。

## 本地运行

需要 Node.js 18 或更新版本，无须 npm install，无构建步骤，运行：

```sh
npm run dev
```

打开 http://127.0.0.1:4173 。所有运行库已经放在 `public/vendor`，没有 CDN、分析脚本或外部字体。

## GitHub Pages

将代码放到公开仓库，在 Settings → Pages 将 Source 设为 GitHub Actions。推送 `main` 后，`.github/workflows/pages.yml` 仅发布 `public/`。

网址形式：`https://用户名.github.io/仓库名/`。所有资源使用相对路径，可部署到子目录。示例 PDF、测试图片、下载文件等在 `.gitignore` 中排除，且不在发布目录内。

## 验证

`npm run check` 检查 JavaScript。先安装开发验证依赖 `npm install --no-save playwright sharp` 和浏览器 `npx playwright install chromium webkit`，再执行 `npm test`。可通过 `PLAYWRIGHT_MODULE` 和 `SHARP_MODULE` 指定已有模块，通过 `TEST_BROWSER=webkit` 选择 WebKit。验证移动浏览器视口、多图合成、排序、旋转、删除、文件名、保存取消与错误处理，以及离线重新加载。验证用生成图，不向公开仓库放个人照片。

WebKit 离线测试关闭源站，绕过 [Playwright 离线模拟问题 #42775](https://github.com/microsoft/playwright/issues/42775)，验证真实网络不可达时的缓存回退。系统分享用测试替身核对新点击触发、PDF 文件和取消路径，不等于 iPhone 实机验收。

支持时附带两个可选的页面代理工具（读取数量与输出状态、生成已选择照片的 PDF），与可见界面共享状态；不自动分享。已用注册接口测试替身验证名称、输入校验和同一转换结果，当前桌面浏览器没有原生 `document.modelContext`，原生注册验收暂不可用。

## 借鉴与依赖

- [Hopding/pdf-lib](https://github.com/Hopding/pdf-lib)，实际采用 PDF 生成库，固定版本 1.17.1，MIT 许可证保留于 `public/vendor/pdf-lib.LICENSE.txt`。
- [snowieedev/image-to-pdf-converter](https://github.com/snowieedev/image-to-pdf-converter)，调研并参考“多图、排序、按比例放入每页”的流程；界面与业务代码另行实现，未复制其代码。
- [imxade/kitsy](https://github.com/imxade/kitsy)，调研本地文件处理、离线 PWA 的可行性，未引入其多工具业务代码。
- [WebKit Safari 17.0 HEIC 支持](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)。
- [WebKit 用户激活机制](https://webkit.org/blog/13862/the-user-activation-api/)。生成后单独点击保存，避免生成时间过长使 iOS 分享授权失效。

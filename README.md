# CENTERLINE 卡牌居中测量与图片校正

无后端、无账号的响应式 Web 工具。用户上传或粘贴图片后，可先裁剪、拉直并校正拍摄透视，再通过 8 条手动参考线测量左右与上下边框比例和 PSA 居中等级上限；图片只在浏览器本地处理。

## 本地运行

```bash
npm run dev
```

打开 `http://127.0.0.1:4173`。

## 测试

```bash
npm test
```

生成 GitHub Pages 使用的纯静态目录：

```bash
npm run build
```

产物位于 `dist/`。如需本地预览发布产物，可先停止开发服务，再运行 `npm run preview`。

## GitHub Pages 部署

仓库包含 `.github/workflows/deploy-pages.yml`：推送到 `main` 后会先执行完整测试，再把 `dist/` 部署到 GitHub Pages；也可以在 Actions 页面手动触发。

首次部署前，在 GitHub 仓库的 `Settings → Pages → Build and deployment` 中把 Source 设为 `GitHub Actions`。构建会使用 Pages 返回的实际站点地址生成 canonical、Open Graph 图片和 Twitter 分享图地址，因此同时兼容项目子路径与后续自定义域名。

本项目没有 npm 运行时依赖，也不需要服务器、数据库或环境密钥。HEIC / TIFF 的浏览器兼容转换首次使用时需要访问 jsDelivr 下载固定版本且带 SRI 校验的解码器代码；图片内容始终留在浏览器本地。

品牌资产统一使用页面左上角的 CENTERLINE 四角定位框，包括 SVG / ICO favicon、iOS 触摸图标、Safari pinned tab 和 Web App Manifest 安装图标；这些文件都会随 `dist/` 一起发布。

## SEO 与分享呈现

正式构建会使用 `SITE_URL` 生成自引用 canonical、Open Graph / Twitter 绝对图片地址、WebSite + WebPage + Person JSON-LD、`sitemap.xml` 和 `robots.txt`。GitHub Pages workflow 会自动传入真实 `base_url`，因此仓库子路径和后续自定义域名不需要维护两套 URL。

本地 `npm run build` 没有公开地址时不会生成 canonical、JSON-LD、sitemap 或 robots，避免把 localhost 或占位域名发布成搜索引擎真相。需要手动模拟正式构建时可运行：

```bash
SITE_URL=https://example.com/ npm run build
```

`robots.txt` 只有放在主机根目录时才会被搜索引擎识别。若使用 `https://用户名.github.io/仓库名/` 形式的 GitHub Pages 项目站，项目自身不能控制该主机的根目录；`sitemap.xml` 仍可在部署后通过 Google Search Console 提交。Google 的搜索结果站点名称与 favicon 也按 hostname 识别，若要让 CENTERLINE 拥有独立、稳定的搜索品牌，优先使用根路径自定义域名。使用自定义域名后，生成的 robots 文件可直接生效。

部署后仍需人工完成 Search Console 站点验证、提交 sitemap，并用 Rich Results Test / URL Inspection 检查线上响应；仓库不会预置或伪造站点验证码、评分和评论数据。Google 的 SoftwareApplication 富结果要求真实评分或评论，当前没有可信数据，因此刻意不声明该富结果类型。

公开 title、description、分享卡片和页面文案只描述 CENTERLINE 自身功能；PSA 只用于解释确定性的居中规则，不做竞品比较。

## 架构

项目保持零运行时依赖，浏览器端按职责拆成五层：

| 模块 | 唯一职责 |
|---|---|
| `src/image.js` | 文件类型、体积校验、HEIC / TIFF 兼容解码和最长边 4096px 工作图生成 |
| `src/perspective.js` | 四边形合法性、拍摄几何提示、单应矩阵和 WebGL 透视渲染 |
| `src/measurement.js` | 参考线约束、居中比例和 PSA 居中等级上限的确定性规则 |
| `src/viewport.js` | contain 尺寸、独立观察窗、缩放焦点和平移边界 |
| `src/app.js` | DOM 事件、页面状态和上述模块的单向编排，不保存第二份图片真相源 |

图片 Blob 和一份编辑配方是唯一状态源。裁剪页拖动四角或滑杆时只更新轻量几何层；用户按住预览或应用校正时才进行 WebGL 渲染。预览画布缓存 shader、buffer 和纹理，同一图片不会因重复比较而反复编译或上传纹理；最终结果只编码一次。缩放和平移只改变视图变换，不改参考线归一化坐标和测量结果。

## 当前范围

- JPG / JPEG / JFIF、PNG / APNG、WebP、AVIF、GIF、BMP、HEIC / HEIF、TIFF / TIF。
- 文件选择、拖放、相机、Command / Ctrl + V 和显式剪贴板读取使用同一条校验与解码管线；替换图片前可取消且不丢失当前工作。
- GIF 固定为单帧用于测量；多页 TIFF 选取像素尺寸最大的一页。
- HEIC 与 TIFF 优先使用浏览器原生解码，不支持时在本地执行兼容转换；图片内容不会上传。
- 可拖动四个角点进行自由、原图或 5:7 裁剪；拖动时显示自动避开手指和画面边缘的 2.6× 局部放大镜，并提供拉直、上下透视、左右透视、辅助网格和原图 / 校正效果对比。
- 根据用户对齐后的四角几何给出“可直接测 / 建议校正 / 建议重拍”三级拍摄角度提示；它不判断卡片物理平整度。
- 编辑区支持 100%–600% 缩放：按钮、滚轮 / 触控板和手机双指均可控制；放大后可拖动图片查看边角。
- 手机编辑态使用 `100dvh` / `100svh` 与安全区变量，隐藏非必要页头，让独立观察窗占满工具栏之间的可用空间。
- 图片与参考线共享缩放和位移坐标，已对齐位置不会漂移；手柄保持固定触控尺寸，虚线放大后会收细。
- 居中比例实时映射为 PSA 正面 / 背面的居中等级上限，并标明由左右或上下哪一轴决定；不冒充最终评级。
- 鼠标、触摸、触控笔和键盘均可调整参考线。
- 不接收 SVG、PDF、PSD、相机 RAW；不做自动边框识别、最终评级预测、卡片物理平整度判断、毫米换算、图片上传或历史记录。

产品口径见 [PRD.md](./PRD.md)，实施边界见 [PLAN.md](./PLAN.md)。

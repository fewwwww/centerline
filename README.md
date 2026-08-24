# 卡牌居中测量器

无后端、无账号的响应式 Web 工具。用户上传图片后，通过 8 条手动参考线测量左右与上下边框比例；图片只在浏览器本地处理。

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

对外比较口径统一为“Edge Grading-style · No ads”或“Edge Grading 的无广告替代”，表达的是相似的手动参考线测量任务，不宣称 CENTERLINE 与 Edge Grading 存在隶属、授权或官方关系。

## 当前范围

- JPG / JPEG / JFIF、PNG / APNG、WebP、AVIF、GIF、BMP、HEIC / HEIF、TIFF / TIF。
- GIF 固定为单帧用于测量；多页 TIFF 选取像素尺寸最大的一页。
- HEIC 与 TIFF 优先使用浏览器原生解码，不支持时在本地执行兼容转换；图片内容不会上传。
- 鼠标、触摸、触控笔和键盘均可调整参考线。
- 不接收 SVG、PDF、PSD、相机 RAW；不做自动边框识别、评级预测、毫米换算、图片上传或历史记录。

产品口径见 [PRD.md](./PRD.md)，实施边界见 [PLAN.md](./PLAN.md)。

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const projectUrl = new URL("../", import.meta.url);
const distUrl = new URL("../dist/", import.meta.url);
const execFileAsync = promisify(execFile);

test("static build contains only deployable browser assets", async () => {
  const expectedFiles = [
    "index.html",
    ".nojekyll",
    "styles.css",
    "site.webmanifest",
    "assets/app-icon.svg",
    "assets/apple-touch-icon.png",
    "assets/favicon-32x32.png",
    "assets/favicon.ico",
    "assets/favicon.svg",
    "assets/icon-192.png",
    "assets/icon-512.png",
    "assets/measurement-example-mantle.jpg",
    "assets/og-card-centering.png",
    "assets/safari-pinned-tab.svg",
    "src/app.js",
    "src/frame-scheduler.js",
    "src/image.js",
    "src/measurement.js",
    "src/perspective.js",
    "src/viewport.js",
    "src/viewport-controller.js",
  ];

  await Promise.all(expectedFiles.map((relativePath) => access(new URL(relativePath, distUrl))));
  await assert.rejects(access(new URL("server/index.js", distUrl)));
  await assert.rejects(access(new URL("robots.txt", distUrl)));
  await assert.rejects(access(new URL("sitemap.xml", distUrl)));

  const html = await readFile(new URL("index.html", distUrl), "utf8");
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /href="\.\/assets\/favicon\.svg"/);
  assert.match(html, /href="\.\/site\.webmanifest"/);
  assert.match(
    html,
    /<span class="brand-credit">by <a href="https:\/\/sny\.is" rel="author">msfew<\/a><\/span>/,
  );
  assert.doesNotMatch(html, /build:site-metadata/);
});

test("static metadata and GitHub Pages subpath-safe links stay explicit", async () => {
  const [html, socialImage, measurementExample, styles] = await Promise.all([
    readFile(new URL("index.html", projectUrl), "utf8"),
    readFile(new URL("assets/og-card-centering.png", projectUrl)),
    readFile(new URL("assets/measurement-example-mantle.jpg", projectUrl)),
    readFile(new URL("styles.css", projectUrl), "utf8"),
  ]);

  assert.match(html, /<title>卡牌居中测量与图片校正 - CENTERLINE<\/title>/);
  assert.match(
    html,
    /name="description"[\s\S]*CENTERLINE 可在浏览器本地裁剪和拉正卡牌图片/,
  );
  assert.match(html, /name="robots"[\s\S]*max-image-preview:large/);
  assert.match(html, /name="author" content="msfew"/);
  assert.match(html, /property="og:title" content="CENTERLINE｜卡牌居中测量与图片校正"/);
  assert.match(
    html,
    /property="og:description"[\s\S]*上传或粘贴卡牌图片，本地拖动四角裁剪并校正拍摄透视/,
  );
  assert.match(html, /property="og:site_name" content="CENTERLINE"/);
  assert.match(html, /property="og:locale" content="zh_CN"/);
  assert.match(html, /property="og:image:width" content="1731"/);
  assert.match(html, /property="og:image:height" content="909"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /name="twitter:title" content="CENTERLINE｜卡牌居中测量与图片校正"/);
  assert.match(html, /name="twitter:image:alt"/);
  assert.match(html, /<!-- build:site-metadata -->/);
  assert.match(html, /rel="author" href="https:\/\/sny\.is"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /卡牌居中比例/);
  assert.match(html, /卡牌居中 · 手动测量/);
  assert.match(html, /左右 \/ 上下比例/);
  assert.match(html, /id="measurement-example-title">PSA 10 ≈ 四边接近均匀<\/h2>/);
  assert.match(html, /<span>左右<\/span><strong>50 \/ 50<\/strong>/);
  assert.match(html, /<span>上下<\/span><strong>46 \/ 54<\/strong>/);
  assert.doesNotMatch(html, /为什么它显示|最终评级还取决于|class="example-explanation"/);
  assert.equal((html.match(/class="example-guide /g) || []).length, 8);
  assert.ok(measurementExample.length < 160 * 1024, "homepage example image must stay lightweight");
  assert.equal(
    measurementExample.includes(Buffer.from("Exif\0\0", "binary")),
    false,
    "homepage example image must not ship EXIF metadata",
  );
  assert.match(html, /measurement-example-mantle\.jpg[\s\S]*fetchpriority="high"/);
  assert.match(html, /id="correction-loupe"[\s\S]*id="correction-loupe-canvas"/);
  assert.doesNotMatch(html, /裁剪比例|data-aspect|straighten-control|vertical-perspective-control|horizontal-perspective-control/);
  assert.doesNotMatch(styles, /\.aspect-controls|\.correction-sliders/);
  assert.ok(
    html.indexOf('id="correction-compare-button"') > html.indexOf('<aside class="correction-panel"'),
    "correction compare button must stay in the control panel instead of covering a corner handle",
  );
  assert.doesNotMatch(html, /无广告|简洁替代|比较定位/);
  assert.doesNotMatch(html, /name="keywords"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/);
  assert.equal(socialImage.readUInt32BE(16), 1731);
  assert.equal(socialImage.readUInt32BE(20), 909);
});

test("web app manifest keeps icons inside the GitHub Pages subpath", async () => {
  const manifest = JSON.parse(await readFile(new URL("site.webmanifest", distUrl), "utf8"));

  assert.equal(manifest.name, "CENTERLINE 卡牌居中测量与图片校正");
  assert.equal(manifest.short_name, "CENTERLINE");
  assert.equal(manifest.lang, "zh-CN");
  assert.equal(
    manifest.description,
    "本地裁剪和拉正卡牌图片，用八条参考线测量左右与上下居中比例及 PSA 居中等级上限。",
  );
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })),
    [
      { src: "./assets/app-icon.svg", sizes: "any", purpose: "any maskable" },
      { src: "./assets/icon-192.png", sizes: "192x192", purpose: "any maskable" },
      { src: "./assets/icon-512.png", sizes: "512x512", purpose: "any maskable" },
    ],
  );
});

test("production build injects the exact GitHub Pages base URL", async () => {
  const siteUrl = "https://example.github.io/card-centering-tool/";
  const options = { cwd: fileURLToPath(projectUrl) };

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/build.mjs"],
      {
        ...options,
        env: { ...process.env, SITE_URL: `${siteUrl.slice(0, -1)}?source=test#ignored` },
      },
    );
    const [html, robots, sitemap] = await Promise.all([
      readFile(new URL("index.html", distUrl), "utf8"),
      readFile(new URL("robots.txt", distUrl), "utf8"),
      readFile(new URL("sitemap.xml", distUrl), "utf8"),
    ]);

    assert.ok(stdout.includes(`Built 23 static files into dist for ${siteUrl}`));
    assert.ok(html.includes(`<link rel="canonical" href="${siteUrl}"`));
    assert.ok(html.includes(`<meta property="og:url" content="${siteUrl}"`));
    assert.ok(html.includes(
      `<meta property="og:image" content="${siteUrl}assets/og-card-centering.png"`,
    ));
    assert.ok(html.includes(
      `<meta property="og:image:secure_url" content="${siteUrl}assets/og-card-centering.png"`,
    ));
    assert.ok(html.includes(
      `<meta name="twitter:image" content="${siteUrl}assets/og-card-centering.png"`,
    ));

    const structuredDataMatch = html.match(
      /<script type="application\/ld\+json" id="seo-structured-data">\s*([\s\S]*?)\s*<\/script>/,
    );
    assert.ok(structuredDataMatch, "production HTML should contain JSON-LD");
    const structuredData = JSON.parse(structuredDataMatch[1]);
    const website = structuredData["@graph"].find((item) => item["@type"] === "WebSite");
    const webPage = structuredData["@graph"].find(
      (item) => item["@type"] === "WebPage",
    );
    const author = structuredData["@graph"].find((item) => item["@type"] === "Person");

    assert.equal(website.url, siteUrl);
    assert.equal(website.name, "CENTERLINE");
    assert.equal(webPage.url, siteUrl);
    assert.equal(
      webPage.primaryImageOfPage.url,
      `${siteUrl}assets/og-card-centering.png`,
    );
    assert.equal(webPage.isPartOf["@id"], `${siteUrl}#website`);
    assert.deepEqual(webPage.keywords, [
      "卡牌居中测量",
      "球星卡居中",
      "收藏卡居中比例",
      "卡牌边框测量",
      "Edgegrading without ads",
    ]);
    assert.equal(author.name, "msfew");
    assert.equal(author.url, "https://sny.is/");
    assert.ok(!html.includes("aggregateRating"));
    assert.ok(!html.includes('"review"'));

    assert.equal(
      robots,
      `User-agent: *\nAllow: /\nSitemap: ${siteUrl}sitemap.xml\n`,
    );
    assert.ok(sitemap.includes(`<loc>${siteUrl}</loc>`));
    assert.ok(sitemap.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
    assert.doesNotMatch(html, /build:site-metadata/);
  } finally {
    await execFileAsync(process.execPath, ["scripts/build.mjs"], {
      ...options,
      env: { ...process.env, SITE_URL: "" },
    });
  }
});

test("HTTP preview metadata never claims a secure Open Graph image", async () => {
  const siteUrl = "http://127.0.0.1:4174/card-centering-tool/";
  const options = { cwd: fileURLToPath(projectUrl) };

  try {
    await execFileAsync(process.execPath, ["scripts/build.mjs"], {
      ...options,
      env: { ...process.env, SITE_URL: siteUrl },
    });
    const html = await readFile(new URL("index.html", distUrl), "utf8");

    assert.ok(html.includes(`<link rel="canonical" href="${siteUrl}"`));
    assert.ok(html.includes(
      `<meta property="og:image" content="${siteUrl}assets/og-card-centering.png"`,
    ));
    assert.doesNotMatch(html, /property="og:image:secure_url"/);
  } finally {
    await execFileAsync(process.execPath, ["scripts/build.mjs"], {
      ...options,
      env: { ...process.env, SITE_URL: "" },
    });
  }
});

test("viewport and guide style contracts stay explicit", async () => {
  const [styles, html, perspective] = await Promise.all([
    readFile(new URL("styles.css", projectUrl), "utf8"),
    readFile(new URL("index.html", projectUrl), "utf8"),
    readFile(new URL("src/perspective.js", projectUrl), "utf8"),
  ]);

  assert.match(styles, /height:\s*100dvh/);
  assert.match(styles, /height:\s*-webkit-fill-available/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /border-left:\s*var\(--guide-line-width\) dashed var\(--guide-color\)/);
  assert.match(styles, /border-top:\s*var\(--guide-line-width\) dashed var\(--guide-color\)/);
  assert.match(styles, /scale\(var\(--canvas-zoom\)\)/);
  assert.match(styles, /translate\(-50%, -50%\) scale\(var\(--guide-inverse-zoom\)\)/);
  assert.match(html, /id="zoom-out-button"/);
  assert.match(html, /id="zoom-reset-button"/);
  assert.match(html, /id="zoom-in-button"/);
  assert.match(html, /滚轮或双指缩放，拖动图片定位/);
  assert.match(styles, /\.brand-credit a\s*\{[\s\S]*?text-decoration:\s*underline/);
  assert.match(perspective, /UNPACK_FLIP_Y_WEBGL, false/);
  assert.doesNotMatch(html, /实线/);
});

test("editor actions omit the redundant guide reset flow", async () => {
  const [html, app, styles] = await Promise.all([
    readFile(new URL("index.html", projectUrl), "utf8"),
    readFile(new URL("src/app.js", projectUrl), "utf8"),
    readFile(new URL("styles.css", projectUrl), "utf8"),
  ]);

  assert.doesNotMatch(html, /reset-guides-button|重置参考线/);
  assert.doesNotMatch(app, /resetGuidesButton|function resetGuides/);
  assert.match(
    styles,
    /\.editor-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /body\[data-view="editor-view"\] \.editor-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.doesNotMatch(
    styles,
    /(?:body\[data-view="editor-view"\] )?\.editor-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,/,
  );
});

test("correction view has independent zoom and pan without covering crop corners", async () => {
  const [html, app, controller, styles] = await Promise.all([
    readFile(new URL("index.html", projectUrl), "utf8"),
    readFile(new URL("src/app.js", projectUrl), "utf8"),
    readFile(new URL("src/viewport-controller.js", projectUrl), "utf8"),
    readFile(new URL("styles.css", projectUrl), "utf8"),
  ]);

  assert.match(html, /id="correction-zoom-out-button"/);
  assert.match(html, /id="correction-zoom-reset-button"/);
  assert.match(html, /id="correction-zoom-in-button"/);
  assert.match(html, /id="correction-frame"[\s\S]*?tabindex="0"/);
  assert.ok(
    html.indexOf('class="zoom-controls zoom-controls-panel"')
      > html.indexOf('<aside class="correction-panel"'),
    "correction zoom controls must live in the side panel instead of covering corner handles",
  );
  assert.match(
    styles,
    /\.zoom-controls\.zoom-controls-panel\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*100%/,
  );
  assert.match(
    styles,
    /:is\(\.measurement-frame, \.correction-frame\)\.is-zoomed\s*\{/,
  );
  assert.doesNotMatch(styles, /\.(?:measurement|correction)-frame\.is-zoomed\s*\{/);
  assert.match(app, /correctionViewport = createViewportController\(\{/);
  assert.match(app, /ignoreSelector: "\.corner-handle"/);
  assert.match(app, /canInteract: \(\) => elements\.correctionResultCanvas\.hidden/);
  assert.match(
    controller,
    /frame\.addEventListener\("wheel", handleWheel, \{ passive: false \}\)/,
  );
  assert.match(
    app,
    /const layout = computeZoomedContainRect\([\s\S]*?correctionViewport\?\.getState\(\)[\s\S]*?correctionPreviewRect = \{[\s\S]*?left: layout\.left/,
  );
});

test("homepage measurement example keeps the full card inside its responsive row", async () => {
  const styles = await readFile(new URL("styles.css", projectUrl), "utf8");

  assert.match(
    styles,
    /\.measurement-example\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\)/,
  );
  assert.match(
    styles,
    /\.example-photo\s*\{[\s\S]*?justify-self:\s*start/,
  );
  assert.match(
    styles,
    /\.example-photo img\s*\{[\s\S]*?object-fit:\s*contain/,
  );
});

test("initial application path defers image decoding and correction code until needed", async () => {
  const app = await readFile(new URL("src/app.js", projectUrl), "utf8");

  assert.match(app, /import\("\.\/image\.js"\)/);
  assert.match(app, /import\("\.\/perspective\.js"\)/);
  assert.doesNotMatch(app, /from "\.\/image\.js"/);
  assert.doesNotMatch(app, /from "\.\/perspective\.js"/);
  assert.match(app, /createFrameScheduler/);
  assert.match(app, /from "\.\/viewport-controller\.js"/);
});

test("stacked editor keeps a usable image row at browser zoom widths", async () => {
  const styles = await readFile(new URL("styles.css", projectUrl), "utf8");

  assert.match(
    styles,
    /@media \(min-width: 641px\) and \(max-width: 980px\)[\s\S]*?\.measurement-workspace\s*\{[\s\S]*?grid-template-rows:\s*clamp\(96px, 18dvh, 112px\) minmax\(0, 1fr\)/,
  );
  assert.match(
    styles,
    /@media \(min-width: 641px\) and \(max-width: 980px\)[\s\S]*?\.results-panel\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(min-width: 641px\) and \(max-width: 980px\) and \(max-height: 720px\)[\s\S]*?\.editor-heading \.eyebrow,[\s\S]*?\.editor-heading > div:first-child > p:last-child\s*\{\s*display:\s*none/,
  );
});

test("pointer interactions have page-wide and capture-loss release fallbacks", async () => {
  const [app, controller] = await Promise.all([
    readFile(new URL("src/app.js", projectUrl), "utf8"),
    readFile(new URL("src/viewport-controller.js", projectUrl), "utf8"),
  ]);

  assert.match(app, /button\.addEventListener\("lostpointercapture", endGuideDrag\)/);
  assert.match(app, /button\.addEventListener\("lostpointercapture", endCornerDrag\)/);
  assert.match(
    controller,
    /frame\.addEventListener\("lostpointercapture", endPointer\)/,
  );
  assert.match(app, /measurementViewport\?\.endPointer\(event\)/);
  assert.match(app, /correctionViewport\?\.endPointer\(event\)/);
  assert.match(
    app,
    /window\.addEventListener\("pointerup", endActivePointerInteractions, true\)/,
  );
  assert.match(
    app,
    /window\.addEventListener\("pointercancel", endActivePointerInteractions, true\)/,
  );
  assert.match(app, /window\.addEventListener\("blur", cancelActivePointerInteractions\)/);
  assert.match(app, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
});

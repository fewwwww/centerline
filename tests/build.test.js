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
    "assets/og-card-centering.png",
    "assets/safari-pinned-tab.svg",
    "src/app.js",
    "src/image.js",
    "src/measurement.js",
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
  const [html, socialImage] = await Promise.all([
    readFile(new URL("index.html", projectUrl), "utf8"),
    readFile(new URL("assets/og-card-centering.png", projectUrl)),
  ]);

  assert.match(html, /<title>无广告卡牌居中测量器｜Edge Grading 替代 - CENTERLINE<\/title>/);
  assert.match(html, /name="description"[\s\S]*Edge Grading Centering Tool 的简洁替代/);
  assert.match(html, /name="robots"[\s\S]*max-image-preview:large/);
  assert.match(html, /name="author" content="msfew"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:site_name" content="CENTERLINE"/);
  assert.match(html, /property="og:locale" content="zh_CN"/);
  assert.match(html, /property="og:image:width" content="1731"/);
  assert.match(html, /property="og:image:height" content="909"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /name="twitter:image:alt"/);
  assert.match(html, /<!-- build:site-metadata -->/);
  assert.match(html, /rel="author" href="https:\/\/sny\.is"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /卡牌居中比例/);
  assert.match(html, /卡牌居中 · 手动测量/);
  assert.match(html, /左右 \/ 上下比例/);
  const body = html.match(/<body[\s\S]*<\/body>/)?.[0] || "";
  assert.doesNotMatch(body, /Edge Grading|EDGE GRADING|NO ADS|无广告/);
  assert.doesNotMatch(html, /name="keywords"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/);
  assert.equal(socialImage.readUInt32BE(16), 1731);
  assert.equal(socialImage.readUInt32BE(20), 909);
});

test("web app manifest keeps icons inside the GitHub Pages subpath", async () => {
  const manifest = JSON.parse(await readFile(new URL("site.webmanifest", distUrl), "utf8"));

  assert.equal(manifest.name, "CENTERLINE 卡牌居中测量器");
  assert.equal(manifest.short_name, "CENTERLINE");
  assert.equal(manifest.lang, "zh-CN");
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

    assert.ok(stdout.includes(`Built 18 static files into dist for ${siteUrl}`));
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
    assert.ok(webPage.keywords.includes("Edge Grading 无广告替代"));
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
  const [styles, html] = await Promise.all([
    readFile(new URL("styles.css", projectUrl), "utf8"),
    readFile(new URL("index.html", projectUrl), "utf8"),
  ]);

  assert.match(styles, /height:\s*100dvh/);
  assert.match(styles, /height:\s*-webkit-fill-available/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /border-left:\s*2px dashed var\(--guide-color\)/);
  assert.match(styles, /border-top:\s*2px dashed var\(--guide-color\)/);
  assert.match(styles, /\.brand-credit a\s*\{[\s\S]*?text-decoration:\s*underline/);
  assert.doesNotMatch(html, /实线/);
});

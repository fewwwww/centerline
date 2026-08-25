import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, "dist");
const metadataMarker = "    <!-- build:site-metadata -->";
const siteDescription =
  "CENTERLINE 可在浏览器本地裁剪和拉正卡牌图片，用八条参考线测量左右与上下居中比例，并实时给出 PSA 居中等级上限。";
const authorUrl = "https://sny.is/";
const publicFiles = [
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
  "src/perspective.js",
  "src/viewport.js",
];
const siteUrl = normalizeSiteUrl(process.env.SITE_URL);

function normalizeSiteUrl(value) {
  if (!value) return null;

  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("SITE_URL must use http or https");
  }

  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
}

function createStructuredData(siteUrl, imageUrl) {
  const siteId = new URL("#website", siteUrl).href;
  const pageId = new URL("#webpage", siteUrl).href;
  const authorId = new URL("#person", authorUrl).href;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": siteId,
        url: siteUrl.href,
        name: "CENTERLINE",
        alternateName: "卡牌居中测量器",
        description: siteDescription,
        inLanguage: "zh-CN",
        creator: { "@id": authorId },
      },
      {
        "@type": "WebPage",
        "@id": pageId,
        url: siteUrl.href,
        name: "CENTERLINE 卡牌居中测量与图片校正",
        description: siteDescription,
        inLanguage: "zh-CN",
        isPartOf: { "@id": siteId },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: imageUrl,
          width: 1731,
          height: 909,
        },
        author: { "@id": authorId },
        genre: "在线工具",
        keywords: [
          "卡牌居中测量",
          "球星卡居中",
          "收藏卡居中比例",
          "卡牌边框测量",
          "Edgegrading without ads",
        ],
      },
      {
        "@type": "Person",
        "@id": authorId,
        name: "msfew",
        url: authorUrl,
      },
    ],
  };
}

function createSiteMetadata(siteUrl) {
  if (!siteUrl) return "";

  const canonicalUrl = escapeAttribute(siteUrl.href);
  const rawImageUrl = new URL("assets/og-card-centering.png", siteUrl).href;
  const imageUrl = escapeAttribute(rawImageUrl);
  const structuredData = escapeJsonForHtml(createStructuredData(siteUrl, rawImageUrl))
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
  const socialMetadata = [
    `    <link rel="canonical" href="${canonicalUrl}" />`,
    `    <meta property="og:url" content="${canonicalUrl}" />`,
    `    <meta property="og:image" content="${imageUrl}" />`,
    `    <meta name="twitter:image" content="${imageUrl}" />`,
  ];
  if (siteUrl.protocol === "https:") {
    socialMetadata.splice(
      3,
      0,
      `    <meta property="og:image:secure_url" content="${imageUrl}" />`,
    );
  }

  return [
    ...socialMetadata,
    `    <script type="application/ld+json" id="seo-structured-data">`,
    structuredData,
    `    </script>`,
  ].join("\n");
}

function createSitemap(siteUrl) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <url>`,
    `    <loc>${escapeAttribute(siteUrl.href)}</loc>`,
    `  </url>`,
    `</urlset>`,
    "",
  ].join("\n");
}

function createRobots(siteUrl) {
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${new URL("sitemap.xml", siteUrl).href}`,
    "",
  ].join("\n");
}

await rm(outputDirectory, { recursive: true, force: true });

await Promise.all(publicFiles.map(async (relativePath) => {
  const targetPath = join(outputDirectory, relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(join(projectRoot, relativePath), targetPath);
}));

const sourceHtml = await readFile(join(projectRoot, "index.html"), "utf8");
if (!sourceHtml.includes(metadataMarker)) {
  throw new Error(`index.html is missing ${metadataMarker}`);
}

const outputHtml = sourceHtml.replace(metadataMarker, createSiteMetadata(siteUrl));
await writeFile(join(outputDirectory, "index.html"), outputHtml);
await writeFile(join(outputDirectory, ".nojekyll"), "");

if (siteUrl) {
  await writeFile(join(outputDirectory, "sitemap.xml"), createSitemap(siteUrl));
  await writeFile(join(outputDirectory, "robots.txt"), createRobots(siteUrl));
}

const generatedFileCount = siteUrl ? 4 : 2;
console.log(`Built ${publicFiles.length + generatedFileCount} static files into dist${siteUrl ? ` for ${siteUrl.href}` : ""}`);

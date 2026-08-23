import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputFile = join(projectRoot, "dist/server/index.js");

const textAssets = [
  ["/", "index.html", "text/html; charset=utf-8"],
  ["/index.html", "index.html", "text/html; charset=utf-8"],
  ["/styles.css", "styles.css", "text/css; charset=utf-8"],
  ["/src/app.js", "src/app.js", "text/javascript; charset=utf-8"],
  ["/src/measurement.js", "src/measurement.js", "text/javascript; charset=utf-8"],
];

const binaryAssets = [
  ["/assets/og-card-centering.png", "assets/og-card-centering.png", "image/png"],
];

const textEntries = await Promise.all(
  textAssets.map(async ([route, filePath, contentType]) => [
    route,
    { body: await readFile(join(projectRoot, filePath), "utf8"), contentType },
  ]),
);

const binaryEntries = await Promise.all(
  binaryAssets.map(async ([route, filePath, contentType]) => [
    route,
    { body: (await readFile(join(projectRoot, filePath))).toString("base64"), contentType },
  ]),
);

const workerSource = `const TEXT_ASSETS = new Map(${JSON.stringify(textEntries)});
const BINARY_ASSETS = new Map(${JSON.stringify(binaryEntries)});

function addSocialMetadata(html, requestUrl) {
  const origin = new URL(requestUrl).origin;
  const tags = [
    '<meta property="og:type" content="website" />',
    '<meta property="og:title" content="卡牌居中测量器" />',
    '<meta property="og:description" content="上传卡牌图片，拖动八条参考线，实时测量左右与上下居中比例。" />',
    '<meta property="og:image" content="' + origin + '/assets/og-card-centering.png" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="卡牌居中测量器" />',
    '<meta name="twitter:description" content="拖动八条参考线，测量卡牌左右与上下居中比例。" />',
    '<meta name="twitter:image" content="' + origin + '/assets/og-card-centering.png" />',
  ].join('');
  return html.replace('</head>', tags + '</head>');
}

function decodeBase64(value) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function responseHeaders(contentType) {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Permissions-Policy': 'camera=(self)',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const textAsset = TEXT_ASSETS.get(url.pathname);
    if (textAsset) {
      const body = textAsset.contentType.startsWith('text/html')
        ? addSocialMetadata(textAsset.body, request.url)
        : textAsset.body;
      return new Response(request.method === 'HEAD' ? null : body, {
        status: 200,
        headers: responseHeaders(textAsset.contentType),
      });
    }

    const binaryAsset = BINARY_ASSETS.get(url.pathname);
    if (binaryAsset) {
      return new Response(request.method === 'HEAD' ? null : decodeBase64(binaryAsset.body), {
        status: 200,
        headers: responseHeaders(binaryAsset.contentType),
      });
    }

    return new Response(request.method === 'HEAD' ? null : 'Not found', {
      status: 404,
      headers: responseHeaders('text/plain; charset=utf-8'),
    });
  },
};
`;

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, workerSource);
console.log(`Built ${textEntries.length + binaryEntries.length} local assets into dist/server/index.js`);

export const HEIC_CONVERTER_URL =
  "https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js";
export const HEIC_CONVERTER_INTEGRITY =
  "sha384-cVm8gaWQ5+URpoh6ACKXpm8TuyoHkfIDDBkxvDoUdIZ18w8nV5en0lVQvWMwO/6S";
export const PAKO_INFLATE_URL =
  "https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako_inflate.min.js";
export const PAKO_INFLATE_INTEGRITY =
  "sha384-eVEAceNXm4nXk77ToJFE5Yyd50iOqdwXwefI35sH/rqeSTw99+DhTt4CzWZU+xBz";
export const TIFF_CONVERTER_URL = "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js";
export const TIFF_CONVERTER_INTEGRITY =
  "sha384-RyBmXHdfZ/Uon+ud+/AqSyWpUWnKYt2tkRG/P4gWoRUGDU+qIAV3tGBPNlYTBZEF";

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const TIFF_TYPES = new Set(["image/tiff", "image/x-tiff"]);
const TIFF_EXTENSIONS = new Set(["tif", "tiff"]);
const GIF_TYPES = new Set(["image/gif"]);
const GIF_EXTENSIONS = new Set(["gif"]);
const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/apng",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/tiff",
  "image/x-tiff",
  "image/heic",
  "image/heif",
]);
const SUPPORTED_EXTENSIONS = new Set([
  "jpg", "jpeg", "jpe", "jfif", "pjpeg", "pjp",
  "png", "apng", "webp", "avif", "avifs", "gif", "bmp", "dib",
  "heic", "heif", "tif", "tiff",
]);
const BLOCKED_TYPES = new Set(["image/svg+xml", "application/pdf"]);
const BLOCKED_EXTENSIONS = new Set([
  "svg", "svgz", "pdf", "eps", "ai", "psd", "psb",
  "dng", "cr2", "cr3", "nef", "nrw", "arw", "srw", "orf", "rw2", "raf", "pef",
]);
// UTIF expands the whole frame into RGBA memory before it can be downscaled.
// Keep the fallback below a standard mobile browser's practical memory ceiling.
const MAX_TIFF_PIXELS = 16 * 1024 * 1024;
export const MAX_WORKING_EDGE = 4096;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const scriptLoads = new WeakMap();

function getExtension(fileName = "") {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

export function isHeicFile(file) {
  const type = (file?.type || "").toLowerCase();
  return HEIC_TYPES.has(type) || HEIC_EXTENSIONS.has(getExtension(file?.name));
}

export function isTiffFile(file) {
  const type = (file?.type || "").toLowerCase();
  return TIFF_TYPES.has(type) || TIFF_EXTENSIONS.has(getExtension(file?.name));
}

export function isGifFile(file) {
  const type = (file?.type || "").toLowerCase();
  return GIF_TYPES.has(type) || GIF_EXTENSIONS.has(getExtension(file?.name));
}

export function isSupportedImageFile(file) {
  const type = (file?.type || "").toLowerCase();
  const extension = getExtension(file?.name);

  if (BLOCKED_TYPES.has(type) || BLOCKED_EXTENSIONS.has(extension)) return false;
  return SUPPORTED_TYPES.has(type) || SUPPORTED_EXTENSIONS.has(extension);
}

export function validateImageFile(file, maximumBytes = MAX_IMAGE_BYTES) {
  if (!isSupportedImageFile(file)) {
    return {
      title: "暂不支持这个文件",
      detail: "请选择 JPG、PNG、WebP、HEIC、AVIF、GIF、BMP 或 TIFF 图片。",
    };
  }
  if (file.size > maximumBytes) {
    return {
      title: "图片超过 25MB",
      detail: "请压缩图片后重试，或选择一张更小的图片。",
    };
  }
  return null;
}

function loadGlobalScript({ documentRef, globalRef, url, integrity, resolveGlobal, errorMessage }) {
  const readyGlobal = resolveGlobal(globalRef);
  if (readyGlobal) return Promise.resolve(readyGlobal);
  if (!documentRef?.createElement || !documentRef?.head?.append) {
    return Promise.reject(new Error(errorMessage));
  }

  let documentLoads = scriptLoads.get(documentRef);
  if (!documentLoads) {
    documentLoads = new Map();
    scriptLoads.set(documentRef, documentLoads);
  }
  const existingLoad = documentLoads.get(url);
  if (existingLoad) return existingLoad;

  const load = new Promise((resolve, reject) => {
    const script = documentRef.createElement("script");
    script.src = url;
    script.integrity = integrity;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.async = true;
    script.onload = () => {
      const loadedGlobal = resolveGlobal(globalRef);
      loadedGlobal ? resolve(loadedGlobal) : reject(new Error(errorMessage));
    };
    script.onerror = () => reject(new Error(errorMessage));
    documentRef.head.append(script);
  });

  documentLoads.set(url, load);
  load.catch(() => documentLoads.delete(url));
  return load;
}

function browserEnvironment(environment = {}) {
  return {
    documentRef: environment.documentRef || globalThis.document,
    globalRef: environment.globalRef || globalThis,
  };
}

async function loadHeicConverter(environment) {
  const { documentRef, globalRef } = browserEnvironment(environment);
  return loadGlobalScript({
    documentRef,
    globalRef,
    url: HEIC_CONVERTER_URL,
    integrity: HEIC_CONVERTER_INTEGRITY,
    resolveGlobal: (scope) => typeof scope?.HeicTo === "function" ? scope.HeicTo : null,
    errorMessage: "HEIC converter could not be loaded",
  });
}

async function loadTiffConverter(environment) {
  const { documentRef, globalRef } = browserEnvironment(environment);
  await loadGlobalScript({
    documentRef,
    globalRef,
    url: PAKO_INFLATE_URL,
    integrity: PAKO_INFLATE_INTEGRITY,
    resolveGlobal: (scope) => scope?.pako || null,
    errorMessage: "TIFF compression support could not be loaded",
  });
  return loadGlobalScript({
    documentRef,
    globalRef,
    url: TIFF_CONVERTER_URL,
    integrity: TIFF_CONVERTER_INTEGRITY,
    resolveGlobal: (scope) => scope?.UTIF || null,
    errorMessage: "TIFF converter could not be loaded",
  });
}

export async function convertHeicToJpeg(file, environment) {
  const converter = await loadHeicConverter(environment);
  const result = await converter({
    blob: file,
    type: "image/jpeg",
    quality: 0.92,
  });

  if (!result || typeof result.arrayBuffer !== "function" || result.type !== "image/jpeg") {
    throw new Error("HEIC converter returned an invalid image");
  }
  return result;
}

function tiffDimensions(ifd) {
  const width = Number(ifd?.t256?.[0]);
  const height = Number(ifd?.t257?.[0]);
  return { width, height, pixels: width * height };
}

export async function decodeTiffToRgba(file, environment) {
  const decoder = await loadTiffConverter(environment);
  const buffer = await file.arrayBuffer();
  const ifds = decoder.decode(buffer);
  const candidates = ifds
    .map((ifd) => ({ ifd, ...tiffDimensions(ifd) }))
    .filter(({ width, height, pixels }) => (
      Number.isSafeInteger(width)
      && Number.isSafeInteger(height)
      && width > 0
      && height > 0
      && Number.isSafeInteger(pixels)
    ))
    .sort((first, second) => second.pixels - first.pixels);
  const primary = candidates[0];

  if (!primary) throw new Error("TIFF image has no readable frame");
  if (primary.pixels > MAX_TIFF_PIXELS) throw new Error("TIFF image dimensions are too large");

  decoder.decodeImage(buffer, primary.ifd);
  const rgba = decoder.toRGBA8(primary.ifd);
  if (!rgba || rgba.byteLength !== primary.pixels * 4) {
    throw new Error("TIFF converter returned invalid pixels");
  }

  return {
    width: primary.width,
    height: primary.height,
    data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
  };
}

async function loadImageElement(blob) {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function decodeSource(file) {
  if ("createImageBitmap" in globalThis) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari and optional codecs can still decode through HTMLImageElement.
    }
  }
  const { image, objectUrl } = await loadImageElement(file);
  image.releaseObjectUrl = () => URL.revokeObjectURL(objectUrl);
  return image;
}

function sourceDimensions(source) {
  return {
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
  };
}

function releaseDecodedSource(source) {
  if (typeof source.close === "function") source.close();
  if (typeof source.releaseObjectUrl === "function") source.releaseObjectUrl();
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create working image"));
    }, type, quality);
  });
}

async function decodedSourceToBlob(source, outputType, quality, maximumEdge) {
  const { width, height } = sourceDimensions(source);
  if (!width || !height) {
    releaseDecodedSource(source);
    throw new Error("Image has no dimensions");
  }
  const scale = maximumEdge / Math.max(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * Math.min(1, scale));
  canvas.height = Math.round(height * Math.min(1, scale));
  const context = canvas.getContext("2d", { alpha: outputType === "image/png" });
  if (!context) {
    releaseDecodedSource(source);
    throw new Error("Canvas is unavailable");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas, outputType, quality);
  } finally {
    releaseDecodedSource(source);
  }
}

async function normalizeWorkingImage(file, maximumEdge) {
  const source = await decodeSource(file);
  const { width, height } = sourceDimensions(source);
  if (!width || !height) {
    releaseDecodedSource(source);
    throw new Error("Image has no dimensions");
  }
  if (Math.max(width, height) <= maximumEdge) {
    releaseDecodedSource(source);
    return file;
  }
  return decodedSourceToBlob(
    source,
    file.type === "image/png" ? "image/png" : "image/jpeg",
    0.92,
    maximumEdge,
  );
}

async function tryDecodeSource(file) {
  try {
    return await decodeSource(file);
  } catch {
    return null;
  }
}

async function tiffToPngBlob(file, maximumEdge) {
  const { width, height, data } = await decodeTiffToRgba(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.putImageData(new ImageData(data, width, height), 0, 0);
  if (Math.max(width, height) <= maximumEdge) return canvasToBlob(canvas, "image/png", 1);
  return decodedSourceToBlob(canvas, "image/png", 1, maximumEdge);
}

export async function prepareWorkingImage(file, maximumEdge = MAX_WORKING_EDGE) {
  if (isHeicFile(file)) {
    const nativeSource = await tryDecodeSource(file);
    if (nativeSource) return decodedSourceToBlob(nativeSource, "image/jpeg", 0.92, maximumEdge);
    return normalizeWorkingImage(await convertHeicToJpeg(file), maximumEdge);
  }
  if (isTiffFile(file)) {
    const nativeSource = await tryDecodeSource(file);
    if (nativeSource) return decodedSourceToBlob(nativeSource, "image/png", 1, maximumEdge);
    return tiffToPngBlob(file, maximumEdge);
  }
  if (isGifFile(file)) {
    return decodedSourceToBlob(await decodeSource(file), "image/png", 1, maximumEdge);
  }
  return normalizeWorkingImage(file, maximumEdge);
}

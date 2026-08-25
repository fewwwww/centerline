import assert from "node:assert/strict";
import test from "node:test";

import {
  HEIC_CONVERTER_INTEGRITY,
  HEIC_CONVERTER_URL,
  PAKO_INFLATE_INTEGRITY,
  PAKO_INFLATE_URL,
  TIFF_CONVERTER_INTEGRITY,
  TIFF_CONVERTER_URL,
  convertHeicToJpeg,
  decodeTiffToRgba,
  isGifFile,
  isHeicFile,
  isSupportedImageFile,
  validateImageFile,
  isTiffFile,
} from "../src/image.js";

test("HEIC detection accepts MIME types and filename extensions", () => {
  assert.equal(isHeicFile({ name: "card.jpg", type: "image/heic" }), true);
  assert.equal(isHeicFile({ name: "CARD.HEIF", type: "" }), true);
  assert.equal(isHeicFile({ name: "card.jpeg", type: "image/jpeg" }), false);
});

test("common raster formats are accepted while documents, vectors, and RAW files are rejected", () => {
  for (const [name, type] of [
    ["card.avif", "image/avif"],
    ["card.gif", "image/gif"],
    ["card.bmp", "image/bmp"],
    ["card.tiff", ""],
    ["card.jfif", "image/jpeg"],
  ]) {
    assert.equal(isSupportedImageFile({ name, type }), true, name);
  }
  for (const [name, type] of [
    ["art.svg", "image/svg+xml"],
    ["document.pdf", "application/pdf"],
    ["camera.dng", "image/x-adobe-dng"],
    ["design.psd", "image/vnd.adobe.photoshop"],
    ["future.jxl", "image/jxl"],
  ]) {
    assert.equal(isSupportedImageFile({ name, type }), false, name);
  }
  assert.equal(isTiffFile({ name: "CARD.TIF", type: "" }), true);
  assert.equal(isGifFile({ name: "card.bin", type: "image/gif" }), true);
});

test("file validation rejects unsupported and oversized files before decoding", () => {
  assert.equal(validateImageFile({ name: "card.webp", type: "image/webp", size: 1024 }), null);
  assert.equal(
    validateImageFile({ name: "card.webp", type: "image/webp", size: 26 * 1024 * 1024 }).title,
    "图片超过 25MB",
  );
  assert.equal(
    validateImageFile({ name: "card.pdf", type: "application/pdf", size: 1024 }).title,
    "暂不支持这个文件",
  );
});

test("HEIC conversion lazy-loads the pinned converter and returns JPEG", async () => {
  const globalRef = {};
  const appendedScripts = [];
  const documentRef = {
    createElement(tagName) {
      assert.equal(tagName, "script");
      return {};
    },
    head: {
      append(script) {
        appendedScripts.push(script);
        globalRef.HeicTo = async (options) => {
          assert.equal(options.blob.name, "card.heic");
          assert.equal(options.type, "image/jpeg");
          assert.equal(options.quality, 0.92);
          return new Blob(["jpeg"], { type: "image/jpeg" });
        };
        queueMicrotask(() => script.onload());
      },
    },
  };

  const result = await convertHeicToJpeg(
    { name: "card.heic", type: "image/heic" },
    { documentRef, globalRef },
  );

  assert.equal(result.type, "image/jpeg");
  assert.equal(appendedScripts.length, 1);
  assert.equal(appendedScripts[0].src, HEIC_CONVERTER_URL);
  assert.equal(appendedScripts[0].integrity, HEIC_CONVERTER_INTEGRITY);
  assert.equal(appendedScripts[0].crossOrigin, "anonymous");
  assert.equal(appendedScripts[0].referrerPolicy, "no-referrer");
});

test("HEIC conversion rejects a failed decoder download and can retry", async () => {
  const globalRef = {};
  let attempts = 0;
  const documentRef = {
    createElement() {
      return {};
    },
    head: {
      append(script) {
        attempts += 1;
        queueMicrotask(() => script.onerror());
      },
    },
  };
  const environment = { documentRef, globalRef };

  await assert.rejects(
    convertHeicToJpeg({ name: "card.heic", type: "image/heic" }, environment),
    /HEIC converter could not be loaded/,
  );
  await assert.rejects(
    convertHeicToJpeg({ name: "card.heic", type: "image/heic" }, environment),
    /HEIC converter could not be loaded/,
  );
  assert.equal(attempts, 2);
});

test("TIFF conversion loads compression support, chooses the largest frame, and returns RGBA pixels", async () => {
  const globalRef = {};
  const appendedScripts = [];
  const smallFrame = { t256: [1], t257: [1] };
  const largeFrame = { t256: [2], t257: [1] };
  const documentRef = {
    createElement() {
      return {};
    },
    head: {
      append(script) {
        appendedScripts.push(script);
        if (script.src === PAKO_INFLATE_URL) globalRef.pako = { inflate() {} };
        if (script.src === TIFF_CONVERTER_URL) {
          globalRef.UTIF = {
            decode: () => [smallFrame, largeFrame],
            decodeImage: (_buffer, frame) => {
              frame.decoded = true;
            },
            toRGBA8: (frame) => {
              assert.equal(frame, largeFrame);
              assert.equal(frame.decoded, true);
              return new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
            },
          };
        }
        queueMicrotask(() => script.onload());
      },
    },
  };

  const result = await decodeTiffToRgba(
    { arrayBuffer: async () => new ArrayBuffer(8) },
    { documentRef, globalRef },
  );

  assert.deepEqual({ width: result.width, height: result.height }, { width: 2, height: 1 });
  assert.equal(result.data.byteLength, 8);
  assert.deepEqual(appendedScripts.map((script) => script.src), [PAKO_INFLATE_URL, TIFF_CONVERTER_URL]);
  assert.deepEqual(appendedScripts.map((script) => script.integrity), [
    PAKO_INFLATE_INTEGRITY,
    TIFF_CONVERTER_INTEGRITY,
  ]);
});

test("TIFF conversion rejects oversized decoded dimensions before allocating RGBA", async () => {
  const globalRef = {
    pako: {},
    UTIF: {
      decode: () => [{ t256: [100_000], t257: [100_000] }],
      decodeImage: () => assert.fail("oversized TIFF should not be decoded"),
    },
  };

  await assert.rejects(
    decodeTiffToRgba(
      { arrayBuffer: async () => new ArrayBuffer(8) },
      { documentRef: {}, globalRef },
    ),
    /dimensions are too large/,
  );
});

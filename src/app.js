import {
  DEFAULT_GUIDES,
  GUIDE_AXIS,
  calculateMeasurements,
  formatRatio,
  moveGuide,
} from "./measurement.js";
import {
  convertHeicToJpeg,
  decodeTiffToRgba,
  isGifFile,
  isHeicFile,
  isSupportedImageFile,
  isTiffFile,
} from "./image.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_WORKING_EDGE = 4096;

const GUIDE_META = [
  { key: "outerLeft", label: "左外沿", short: "外", direction: "left", kind: "outer", axis: "vertical", handle: "42%" },
  { key: "innerLeft", label: "左内沿", short: "内", direction: "left", kind: "inner", axis: "vertical", handle: "58%" },
  { key: "innerRight", label: "右内沿", short: "内", direction: "right", kind: "inner", axis: "vertical", handle: "58%" },
  { key: "outerRight", label: "右外沿", short: "外", direction: "right", kind: "outer", axis: "vertical", handle: "42%" },
  { key: "outerTop", label: "上外沿", short: "外", direction: "top", kind: "outer", axis: "horizontal", handle: "42%" },
  { key: "innerTop", label: "上内沿", short: "内", direction: "top", kind: "inner", axis: "horizontal", handle: "58%" },
  { key: "innerBottom", label: "下内沿", short: "内", direction: "bottom", kind: "inner", axis: "horizontal", handle: "58%" },
  { key: "outerBottom", label: "下外沿", short: "外", direction: "bottom", kind: "outer", axis: "horizontal", handle: "42%" },
];

const elements = {
  uploadView: document.querySelector("#upload-view"),
  processingView: document.querySelector("#processing-view"),
  editorView: document.querySelector("#editor-view"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  cameraInput: document.querySelector("#camera-input"),
  chooseImageButton: document.querySelector("#choose-image-button"),
  takePhotoButton: document.querySelector("#take-photo-button"),
  processingMessage: document.querySelector("#processing-message"),
  processingChangeButton: document.querySelector("#processing-change-button"),
  uploadError: document.querySelector("#upload-error"),
  uploadErrorTitle: document.querySelector("#upload-error-title"),
  uploadErrorDetail: document.querySelector("#upload-error-detail"),
  resetGuidesButton: document.querySelector("#reset-guides-button"),
  changeImageButton: document.querySelector("#change-image-button"),
  measurementFrame: document.querySelector("#measurement-frame"),
  guideLayer: document.querySelector("#guide-layer"),
  sourceImage: document.querySelector("#source-image"),
  horizontalOutput: document.querySelector("#horizontal-output"),
  verticalOutput: document.querySelector("#vertical-output"),
  horizontalResult: document.querySelector("#horizontal-result"),
  verticalResult: document.querySelector("#vertical-result"),
  horizontalBarFirst: document.querySelector("#horizontal-bar-first"),
  verticalBarFirst: document.querySelector("#vertical-bar-first"),
  measurementStatus: document.querySelector("#measurement-status"),
  measurementStatusText: document.querySelector("#measurement-status-text"),
  resultAnnouncer: document.querySelector("#result-announcer"),
};

let guides = { ...DEFAULT_GUIDES };
let guideButtons = new Map();
let activeDrag = null;
let currentImageUrl = null;
let processingTimers = [];
let announceTimer = null;
let imageLoadSequence = 0;

function showView(view) {
  [elements.uploadView, elements.processingView, elements.editorView].forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
  document.body.dataset.view = view.id;
}

function clearProcessingTimers() {
  processingTimers.forEach((timer) => window.clearTimeout(timer));
  processingTimers = [];
}

function clearUploadError() {
  elements.uploadError.hidden = true;
  elements.uploadErrorTitle.textContent = "";
  elements.uploadErrorDetail.textContent = "";
}

function showUploadError(title, detail) {
  elements.uploadErrorTitle.textContent = title;
  elements.uploadErrorDetail.textContent = detail;
  elements.uploadError.hidden = false;
  showView(elements.uploadView);
}

function validateFile(file) {
  if (!isSupportedImageFile(file)) {
    return {
      title: "暂不支持这个文件",
      detail: "请选择 JPG、PNG、WebP、HEIC、AVIF、GIF、BMP 或 TIFF 图片。",
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      title: "图片超过 25MB",
      detail: "请压缩图片后重试，或选择一张更小的图片。",
    };
  }

  return null;
}

function startProcessingState() {
  clearProcessingTimers();
  elements.processingMessage.textContent = "图片只在当前浏览器中解码，不会上传。";
  elements.processingChangeButton.hidden = true;
  showView(elements.processingView);

  processingTimers.push(
    window.setTimeout(() => {
      elements.processingMessage.textContent = "图片较大，仍在本地处理中…";
    }, 2000),
  );

  processingTimers.push(
    window.setTimeout(() => {
      elements.processingMessage.textContent = "处理时间比预期更长，你可以继续等待或换一张图。";
      elements.processingChangeButton.hidden = false;
    }, 5000),
  );
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
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari and some image codecs need the HTMLImageElement fallback.
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
  if (typeof source.close === "function") {
    source.close();
  }
  if (typeof source.releaseObjectUrl === "function") {
    source.releaseObjectUrl();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create working image"));
      }
    }, type, quality);
  });
}

async function prepareWorkingImage(file) {
  if (isHeicFile(file)) {
    const nativeSource = await tryDecodeSource(file);
    if (nativeSource) {
      return await decodedSourceToBlob(nativeSource, "image/jpeg", 0.92);
    }
    return normalizeWorkingImage(await convertHeicToJpeg(file));
  }

  if (isTiffFile(file)) {
    const nativeSource = await tryDecodeSource(file);
    if (nativeSource) {
      return await decodedSourceToBlob(nativeSource, "image/png", 1);
    }
    return tiffToPngBlob(file);
  }

  if (isGifFile(file)) {
    const source = await decodeSource(file);
    return decodedSourceToBlob(source, "image/png", 1);
  }

  return normalizeWorkingImage(file);
}

async function tryDecodeSource(file) {
  try {
    return await decodeSource(file);
  } catch {
    return null;
  }
}

async function normalizeWorkingImage(file) {
  const source = await decodeSource(file);
  const { width, height } = sourceDimensions(source);

  if (!width || !height) {
    releaseDecodedSource(source);
    throw new Error("Image has no dimensions");
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= MAX_WORKING_EDGE) {
    releaseDecodedSource(source);
    return file;
  }

  return decodedSourceToBlob(source, file.type === "image/png" ? "image/png" : "image/jpeg", 0.92);
}

async function tiffToPngBlob(file) {
  const { width, height, data } = await decodeTiffToRgba(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.putImageData(new ImageData(data, width, height), 0, 0);

  if (Math.max(width, height) <= MAX_WORKING_EDGE) {
    return canvasToBlob(canvas, "image/png", 1);
  }
  return decodedSourceToBlob(canvas, "image/png", 1);
}

async function decodedSourceToBlob(source, outputType, quality) {
  const { width, height } = sourceDimensions(source);
  if (!width || !height) {
    releaseDecodedSource(source);
    throw new Error("Image has no dimensions");
  }

  const longestEdge = Math.max(width, height);
  const scale = MAX_WORKING_EDGE / longestEdge;
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

function replaceCurrentImageUrl(blob) {
  if (currentImageUrl) {
    URL.revokeObjectURL(currentImageUrl);
  }
  currentImageUrl = URL.createObjectURL(blob);
  return currentImageUrl;
}

async function displayWorkingImage(blob) {
  elements.sourceImage.src = replaceCurrentImageUrl(blob);
  await elements.sourceImage.decode();
}

async function handleFile(file) {
  if (!file) return;

  const loadId = ++imageLoadSequence;
  clearUploadError();
  const validationError = validateFile(file);
  if (validationError) {
    clearProcessingTimers();
    showUploadError(validationError.title, validationError.detail);
    return;
  }

  startProcessingState();

  try {
    const workingImage = await prepareWorkingImage(file);
    if (loadId !== imageLoadSequence) return;

    await displayWorkingImage(workingImage);
    if (loadId !== imageLoadSequence) return;

    clearProcessingTimers();
    guides = { ...DEFAULT_GUIDES };
    renderGuides();
    updateResults();
    showView(elements.editorView);
    window.requestAnimationFrame(() => renderGuides());
  } catch {
    if (loadId !== imageLoadSequence) return;

    clearProcessingTimers();
    if (isHeicFile(file)) {
      showUploadError("HEIC 图片无法读取", "请确认文件没有损坏；如果图片来自 iCloud，请先下载原图后重试。");
    } else if (isTiffFile(file)) {
      showUploadError("TIFF 图片无法读取", "请确认文件没有损坏，或把多页 TIFF 导出为单张 PNG 后重试。");
    } else {
      showUploadError("图片无法读取", "当前浏览器无法解码该格式，或文件可能已经损坏。");
    }
  }
}

function createGuideButton(meta) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `guide guide-${meta.axis} guide-${meta.direction} guide-${meta.kind}`;
  button.dataset.guide = meta.key;
  button.setAttribute("role", "slider");
  button.setAttribute("aria-label", `${meta.label}参考线`);
  button.setAttribute("aria-orientation", GUIDE_AXIS[meta.key] === "x" ? "horizontal" : "vertical");
  button.setAttribute("aria-valuemin", "0");
  button.setAttribute("aria-valuemax", "100");
  button.style.setProperty("--handle-position", meta.handle);
  button.innerHTML = `<span class="guide-stroke" aria-hidden="true"></span><span class="guide-handle" aria-hidden="true"><b>${meta.short}</b></span>`;

  button.addEventListener("pointerdown", beginGuideDrag);
  button.addEventListener("pointermove", moveActiveGuide);
  button.addEventListener("pointerup", endGuideDrag);
  button.addEventListener("pointercancel", endGuideDrag);
  button.addEventListener("keydown", handleGuideKeydown);
  return button;
}

function mountGuides() {
  elements.guideLayer.replaceChildren();
  guideButtons = new Map();

  GUIDE_META.forEach((meta) => {
    const button = createGuideButton(meta);
    guideButtons.set(meta.key, button);
    elements.guideLayer.append(button);
  });
}

function renderGuides() {
  guideButtons.forEach((button, key) => {
    const percentage = guides[key] * 100;
    if (GUIDE_AXIS[key] === "x") {
      button.style.left = `${percentage}%`;
    } else {
      button.style.top = `${percentage}%`;
    }
    button.setAttribute("aria-valuenow", percentage.toFixed(1));
    button.setAttribute("aria-valuetext", `${percentage.toFixed(1)}%`);
  });
}

function applyGuideValue(key, value) {
  guides = moveGuide(guides, key, value);
  renderGuides();
  updateResults();
}

function beginGuideDrag(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;

  const button = event.currentTarget;
  const key = button.dataset.guide;
  activeDrag = { key, pointerId: event.pointerId, button };
  button.setPointerCapture(event.pointerId);
  button.classList.add("is-dragging");
  document.body.classList.add("is-dragging-guide");
  updateGuideFromPointer(event, key);
  event.preventDefault();
}

function updateGuideFromPointer(event, key) {
  const rect = elements.measurementFrame.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const value = GUIDE_AXIS[key] === "x"
    ? (event.clientX - rect.left) / rect.width
    : (event.clientY - rect.top) / rect.height;
  applyGuideValue(key, value);
}

function moveActiveGuide(event) {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
  updateGuideFromPointer(event, activeDrag.key);
  event.preventDefault();
}

function endGuideDrag(event) {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;

  activeDrag.button.classList.remove("is-dragging");
  if (activeDrag.button.hasPointerCapture(event.pointerId)) {
    activeDrag.button.releasePointerCapture(event.pointerId);
  }
  activeDrag = null;
  document.body.classList.remove("is-dragging-guide");
  announceResults();
}

function handleGuideKeydown(event) {
  const button = event.currentTarget;
  const key = button.dataset.guide;
  const axis = GUIDE_AXIS[key];
  const rect = elements.measurementFrame.getBoundingClientRect();
  const stepPixels = event.shiftKey ? 5 : 1;
  let direction = 0;

  if (axis === "x" && event.key === "ArrowLeft") direction = -1;
  if (axis === "x" && event.key === "ArrowRight") direction = 1;
  if (axis === "y" && event.key === "ArrowUp") direction = -1;
  if (axis === "y" && event.key === "ArrowDown") direction = 1;
  if (!direction) return;

  const dimension = axis === "x" ? rect.width : rect.height;
  if (!dimension) return;
  applyGuideValue(key, guides[key] + (direction * stepPixels) / dimension);
  scheduleAnnouncement();
  event.preventDefault();
}

function renderAxis(result, output, container, bar) {
  const ratio = formatRatio(result);
  output.value = ratio;
  output.textContent = ratio;
  container.classList.toggle("is-invalid", !result.valid);
  bar.style.width = result.valid ? `${result.first}%` : "0%";
}

function updateResults() {
  const results = calculateMeasurements(guides);
  renderAxis(results.horizontal, elements.horizontalOutput, elements.horizontalResult, elements.horizontalBarFirst);
  renderAxis(results.vertical, elements.verticalOutput, elements.verticalResult, elements.verticalBarFirst);

  const valid = results.horizontal.valid && results.vertical.valid;
  elements.measurementStatus.classList.toggle("is-invalid", !valid);
  elements.measurementStatusText.textContent = valid
    ? "参考线已形成有效边框"
    : "当前没有形成可测量的边框，请调整参考线";
}

function currentResultAnnouncement() {
  const results = calculateMeasurements(guides);
  if (!results.horizontal.valid || !results.vertical.valid) {
    return "当前没有形成可测量的边框";
  }
  return `左右居中 ${formatRatio(results.horizontal)}，上下居中 ${formatRatio(results.vertical)}`;
}

function announceResults() {
  elements.resultAnnouncer.textContent = "";
  window.requestAnimationFrame(() => {
    elements.resultAnnouncer.textContent = currentResultAnnouncement();
  });
}

function scheduleAnnouncement() {
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(announceResults, 250);
}

function resetGuides() {
  guides = { ...DEFAULT_GUIDES };
  renderGuides();
  updateResults();
  announceResults();
}

function requestImage() {
  elements.fileInput.click();
}

function handleFileInput(event) {
  const [file] = event.target.files || [];
  event.target.value = "";
  handleFile(file);
}

function setDropZoneActive(active) {
  elements.dropZone.classList.toggle("is-drop-target", active);
}

elements.chooseImageButton.addEventListener("click", requestImage);
elements.changeImageButton.addEventListener("click", requestImage);
elements.processingChangeButton.addEventListener("click", requestImage);
elements.takePhotoButton.addEventListener("click", () => elements.cameraInput.click());
elements.fileInput.addEventListener("change", handleFileInput);
elements.cameraInput.addEventListener("change", handleFileInput);
elements.resetGuidesButton.addEventListener("click", resetGuides);

elements.dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  setDropZoneActive(true);
});
elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  setDropZoneActive(true);
});
elements.dropZone.addEventListener("dragleave", (event) => {
  if (!elements.dropZone.contains(event.relatedTarget)) {
    setDropZoneActive(false);
  }
});
elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  setDropZoneActive(false);
  const [file] = event.dataTransfer.files || [];
  handleFile(file);
});

window.addEventListener("beforeunload", () => {
  clearProcessingTimers();
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
});

mountGuides();
renderGuides();
updateResults();

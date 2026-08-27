import {
  DEFAULT_GUIDES,
  GUIDE_AXIS,
  calculateMeasurements,
  estimatePsaCentering,
  formatRatio,
  moveGuide,
} from "./measurement.js";
import {
  createFrameScheduler,
  createKeyedFrameScheduler,
} from "./frame-scheduler.js";
import {
  CORRECTION_LOUPE_MAGNIFICATION,
  CORRECTION_LOUPE_SIZE,
  computeContainSize,
  computeMeasurementImageSize,
  computeZoomedContainRect,
  correctionLoupeGuideSegments,
  correctionLoupeSourceRect,
  guideLoupePoint,
  guideLoupeSegment,
  guideScreenWidth,
  pointerButtonsAreReleased,
  positionCorrectionLoupe,
} from "./viewport.js";
import { createViewportController } from "./viewport-controller.js";
const GUIDE_META = [
  { key: "outerLeft", label: "左外沿", short: "外", direction: "left", kind: "outer", axis: "vertical", handle: 0.42 },
  { key: "innerLeft", label: "左内沿", short: "内", direction: "left", kind: "inner", axis: "vertical", handle: 0.58 },
  { key: "innerRight", label: "右内沿", short: "内", direction: "right", kind: "inner", axis: "vertical", handle: 0.58 },
  { key: "outerRight", label: "右外沿", short: "外", direction: "right", kind: "outer", axis: "vertical", handle: 0.42 },
  { key: "outerTop", label: "上外沿", short: "外", direction: "top", kind: "outer", axis: "horizontal", handle: 0.42 },
  { key: "innerTop", label: "上内沿", short: "内", direction: "top", kind: "inner", axis: "horizontal", handle: 0.58 },
  { key: "innerBottom", label: "下内沿", short: "内", direction: "bottom", kind: "inner", axis: "horizontal", handle: 0.58 },
  { key: "outerBottom", label: "下外沿", short: "外", direction: "bottom", kind: "outer", axis: "horizontal", handle: 0.42 },
];
const GUIDE_META_BY_KEY = new Map(GUIDE_META.map((meta) => [meta.key, meta]));
const GUIDE_COLOR_PROPERTY = Object.freeze({
  left: "--left",
  right: "--right",
  top: "--top",
  bottom: "--bottom",
});
const ORIGINAL_RESTORE_QUAD = [
  { x: 0.005, y: 0.005 },
  { x: 0.995, y: 0.005 },
  { x: 0.995, y: 0.995 },
  { x: 0.005, y: 0.995 },
];

const elements = {
  uploadView: document.querySelector("#upload-view"),
  processingView: document.querySelector("#processing-view"),
  editorView: document.querySelector("#editor-view"),
  correctionView: document.querySelector("#correction-view"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  cameraInput: document.querySelector("#camera-input"),
  chooseImageButton: document.querySelector("#choose-image-button"),
  takePhotoButton: document.querySelector("#take-photo-button"),
  pasteImageButton: document.querySelector("#paste-image-button"),
  processingMessage: document.querySelector("#processing-message"),
  processingChangeButton: document.querySelector("#processing-change-button"),
  uploadError: document.querySelector("#upload-error"),
  uploadErrorTitle: document.querySelector("#upload-error-title"),
  uploadErrorDetail: document.querySelector("#upload-error-detail"),
  changeImageButton: document.querySelector("#change-image-button"),
  correctImageButton: document.querySelector("#correct-image-button"),
  measurementFrame: document.querySelector("#measurement-frame"),
  imageCanvas: document.querySelector("#image-canvas"),
  guideLayer: document.querySelector("#guide-layer"),
  guideLoupe: document.querySelector("#guide-loupe"),
  guideLoupeCanvas: document.querySelector("#guide-loupe-canvas"),
  guideLoupeLabel: document.querySelector("#guide-loupe-label"),
  sourceImage: document.querySelector("#source-image"),
  zoomOutButton: document.querySelector("#zoom-out-button"),
  zoomResetButton: document.querySelector("#zoom-reset-button"),
  zoomInButton: document.querySelector("#zoom-in-button"),
  zoomValue: document.querySelector("#zoom-value"),
  horizontalOutput: document.querySelector("#horizontal-output"),
  verticalOutput: document.querySelector("#vertical-output"),
  horizontalResult: document.querySelector("#horizontal-result"),
  verticalResult: document.querySelector("#vertical-result"),
  horizontalBarFirst: document.querySelector("#horizontal-bar-first"),
  verticalBarFirst: document.querySelector("#vertical-bar-first"),
  measurementStatus: document.querySelector("#measurement-status"),
  measurementStatusText: document.querySelector("#measurement-status-text"),
  psaOutput: document.querySelector("#psa-output"),
  psaDetail: document.querySelector("#psa-detail"),
  psaFrontButton: document.querySelector("#psa-front-button"),
  psaBackButton: document.querySelector("#psa-back-button"),
  correctionFrame: document.querySelector("#correction-frame"),
  correctionCanvas: document.querySelector("#correction-canvas"),
  correctionResultCanvas: document.querySelector("#correction-result-canvas"),
  correctionHandles: document.querySelector("#correction-handles"),
  correctionLoupe: document.querySelector("#correction-loupe"),
  correctionLoupeCanvas: document.querySelector("#correction-loupe-canvas"),
  correctionLoupeLabel: document.querySelector("#correction-loupe-label"),
  correctionCompareButton: document.querySelector("#correction-compare-button"),
  correctionZoomOutButton: document.querySelector("#correction-zoom-out-button"),
  correctionZoomResetButton: document.querySelector("#correction-zoom-reset-button"),
  correctionZoomInButton: document.querySelector("#correction-zoom-in-button"),
  correctionZoomValue: document.querySelector("#correction-zoom-value"),
  correctionResetButton: document.querySelector("#correction-reset-button"),
  correctionResetButtonBottom: document.querySelector("#correction-reset-button-bottom"),
  correctionCancelButton: document.querySelector("#correction-cancel-button"),
  correctionCancelButtonBottom: document.querySelector("#correction-cancel-button-bottom"),
  correctionApplyButton: document.querySelector("#correction-apply-button"),
  correctionApplyButtonBottom: document.querySelector("#correction-apply-button-bottom"),
  geometryAdvice: document.querySelector("#geometry-advice"),
  geometryAdviceTitle: document.querySelector("#geometry-advice-title"),
  correctionRendererNote: document.querySelector("#correction-renderer-note"),
  resultAnnouncer: document.querySelector("#result-announcer"),
};

let guides = { ...DEFAULT_GUIDES };
let guideButtons = new Map();
let guideColors = new Map();
let activeDrag = null;
let currentImageUrl = null;
let imageSession = null;
let processingTimers = [];
let announceTimer = null;
let imageLoadSequence = 0;
let measurementViewport = null;
let psaSide = "front";
let correctionRecipe = null;
let correctionPreviewRect = { left: 0, top: 0, width: 0, height: 0 };
let correctionViewport = null;
let activeCornerDrag = null;
let imageToolsPromise = null;
let correctionToolsPromise = null;
let imageTools = null;
let correctionTools = null;

async function loadImageTools() {
  if (imageTools) return imageTools;
  imageToolsPromise ||= import("./image.js");
  try {
    imageTools = await imageToolsPromise;
    return imageTools;
  } catch (error) {
    imageToolsPromise = null;
    throw error;
  }
}

async function loadCorrectionTools() {
  if (correctionTools) return correctionTools;
  correctionToolsPromise ||= import("./perspective.js");
  try {
    correctionTools = await correctionToolsPromise;
    return correctionTools;
  } catch (error) {
    correctionToolsPromise = null;
    throw error;
  }
}

function showView(view) {
  [elements.uploadView, elements.processingView, elements.correctionView, elements.editorView].forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
  document.body.dataset.view = view.id;
}

function notifyUser(title, detail = "") {
  let notice = document.querySelector("#app-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "app-notice";
    notice.className = "app-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    document.body.append(notice);
  }
  notice.hidden = false;
  notice.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = title;
  notice.append(strong);
  if (detail) {
    const span = document.createElement("span");
    span.textContent = detail;
    notice.append(span);
  }
  notice.classList.add("is-visible");
  window.clearTimeout(notice.hideTimer);
  notice.hideTimer = window.setTimeout(() => notice.classList.remove("is-visible"), 3600);
}

function dismissNotice() {
  const notice = document.querySelector("#app-notice");
  if (!notice) return;
  window.clearTimeout(notice.hideTimer);
  notice.classList.remove("is-visible");
  notice.hidden = true;
}

function confirmImageReplacement(description) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title" aria-describedby="replace-detail">
        <strong id="replace-title">替换当前图片？</strong>
        <p id="replace-detail">${description}会替换当前图片，并重置参考线和缩放位置。</p>
        <div>
          <button class="button button-secondary" type="button" data-choice="cancel">保留当前图片</button>
          <button class="button button-dark" type="button" data-choice="replace">替换图片</button>
        </div>
      </div>
    `;
    const finish = (accepted) => {
      overlay.remove();
      resolve(accepted);
    };
    overlay.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-choice]")?.dataset.choice;
      if (choice) finish(choice === "replace");
      if (event.target === overlay) finish(false);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(false);
    });
    document.body.append(overlay);
    overlay.querySelector('[data-choice="cancel"]').focus();
  });
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

function replaceCurrentImageUrl(blob) {
  if (currentImageUrl) {
    URL.revokeObjectURL(currentImageUrl);
  }
  currentImageUrl = URL.createObjectURL(blob);
  return currentImageUrl;
}

async function displaySourceImage(blob) {
  elements.sourceImage.src = replaceCurrentImageUrl(blob);
  await elements.sourceImage.decode();
}

async function displayWorkingImage(blob, startsNewSession = false) {
  await displaySourceImage(blob);
  imageSession = startsNewSession
    ? imageTools.createImageSession(blob)
    : imageTools.commitWorkingImage(imageSession, blob);
}

async function handleFile(file, source = "file") {
  if (!file) return;

  try {
    await loadImageTools();
  } catch {
    showUploadError("应用资源无法读取", "请刷新页面后重试；当前图片没有上传。");
    return;
  }

  const validationError = imageTools.validateImageFile(file);
  if (validationError) {
    clearProcessingTimers();
    if (imageSession?.workingBlob && document.body.dataset.view !== "upload-view") {
      notifyUser(validationError.title, validationError.detail);
    } else {
      showUploadError(validationError.title, validationError.detail);
    }
    return;
  }

  if (imageSession?.workingBlob && !["upload-view", "processing-view"].includes(document.body.dataset.view)) {
    const description = source === "paste" ? "粘贴的图片" : "新选择的图片";
    if (!await confirmImageReplacement(description)) return;
  }

  const loadId = ++imageLoadSequence;
  const hadCurrentImage = Boolean(imageSession?.workingBlob);
  clearUploadError();
  startProcessingState();

  try {
    const workingImage = await imageTools.prepareWorkingImage(file);
    if (loadId !== imageLoadSequence) return;

    await displayWorkingImage(workingImage, true);
    if (loadId !== imageLoadSequence) return;

    clearProcessingTimers();
    guides = { ...DEFAULT_GUIDES };
    renderGuides();
    updateResults();
    showView(elements.editorView);
    window.requestAnimationFrame(() => {
      updateImageCanvasSize();
      measurementViewport?.reset();
      renderGuides();
    });
  } catch {
    if (loadId !== imageLoadSequence) return;

    clearProcessingTimers();
    const errorMessage = imageTools.isHeicFile(file)
      ? ["HEIC 图片无法读取", "请确认文件没有损坏；如果图片来自 iCloud，请先下载原图后重试。"]
      : imageTools.isTiffFile(file)
        ? ["TIFF 图片无法读取", "请确认文件没有损坏，或把多页 TIFF 导出为单张 PNG 后重试。"]
        : ["图片无法读取", "当前浏览器无法解码该格式，或文件可能已经损坏。"];
    if (hadCurrentImage) {
      showView(elements.editorView);
      window.requestAnimationFrame(updateImageCanvasSize);
      notifyUser(...errorMessage);
    } else {
      showUploadError(...errorMessage);
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
  button.style.setProperty("--handle-position", `${meta.handle * 100}%`);
  button.innerHTML = `<span class="guide-stroke" aria-hidden="true"></span><span class="guide-handle" aria-hidden="true"><b>${meta.short}</b></span>`;

  button.addEventListener("pointerdown", beginGuideDrag);
  button.addEventListener("pointermove", moveActiveGuide);
  button.addEventListener("pointerup", endGuideDrag);
  button.addEventListener("pointercancel", endGuideDrag);
  button.addEventListener("lostpointercapture", endGuideDrag);
  button.addEventListener("keydown", handleGuideKeydown);
  return button;
}

function mountGuides() {
  elements.guideLayer.replaceChildren();
  guideButtons = new Map();
  guideColors = new Map();

  GUIDE_META.forEach((meta) => {
    const button = createGuideButton(meta);
    guideButtons.set(meta.key, button);
    elements.guideLayer.append(button);
  });

  const rootStyle = getComputedStyle(document.documentElement);
  GUIDE_META.forEach((meta) => {
    guideColors.set(
      meta.key,
      rootStyle.getPropertyValue(GUIDE_COLOR_PROPERTY[meta.direction]).trim() || "#fff",
    );
  });
}

function renderGuide(key) {
  const button = guideButtons.get(key);
  if (!button) return;
  const percentage = guides[key] * 100;
  if (GUIDE_AXIS[key] === "x") {
    button.style.left = `${percentage}%`;
  } else {
    button.style.top = `${percentage}%`;
  }
  button.setAttribute("aria-valuenow", percentage.toFixed(1));
  button.setAttribute("aria-valuetext", `${percentage.toFixed(1)}%`);
}

function renderGuides() {
  guideButtons.forEach((_button, key) => renderGuide(key));
}

function applyGuideValue(key, value, loupeState = null) {
  guides = moveGuide(guides, key, value);
  scheduleGuideUi(key, loupeState ? { ...loupeState, key } : null);
}

function hideGuideLoupe() {
  elements.guideLoupe.hidden = true;
}

function drawLoupeImage(canvas, point, previewWidth, previewHeight) {
  const sourceWidth = elements.sourceImage.naturalWidth;
  const sourceHeight = elements.sourceImage.naturalHeight;
  const sourceRect = correctionLoupeSourceRect(
    point,
    sourceWidth,
    sourceHeight,
    previewWidth,
    previewHeight,
  );
  if (!sourceRect) return null;

  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const context = canvas.getContext("2d", { alpha: false });
  const canvasSize = Math.round(CORRECTION_LOUPE_SIZE * pixelRatio);
  if (canvas.width !== canvasSize || canvas.height !== canvasSize) {
    canvas.width = canvasSize;
    canvas.height = canvasSize;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = "#0b0e0b";
  context.fillRect(0, 0, CORRECTION_LOUPE_SIZE, CORRECTION_LOUPE_SIZE);

  const sourceLeft = Math.max(0, sourceRect.x);
  const sourceTop = Math.max(0, sourceRect.y);
  const sourceRight = Math.min(sourceWidth, sourceRect.x + sourceRect.width);
  const sourceBottom = Math.min(sourceHeight, sourceRect.y + sourceRect.height);
  if (sourceRight > sourceLeft && sourceBottom > sourceTop) {
    const scale = CORRECTION_LOUPE_SIZE / sourceRect.width;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      elements.sourceImage,
      sourceLeft,
      sourceTop,
      sourceRight - sourceLeft,
      sourceBottom - sourceTop,
      (sourceLeft - sourceRect.x) * scale,
      (sourceTop - sourceRect.y) * scale,
      (sourceRight - sourceLeft) * scale,
      (sourceBottom - sourceTop) * scale,
    );
  }
  return context;
}

function drawGuideLoupe(pointer, key, layerRect = elements.guideLayer.getBoundingClientRect()) {
  const meta = GUIDE_META_BY_KEY.get(key);
  const axis = GUIDE_AXIS[key];
  const point = guideLoupePoint(axis, guides[key], meta?.handle);
  if (!meta || !point || !layerRect.width || !layerRect.height) return;

  const context = drawLoupeImage(
    elements.guideLoupeCanvas,
    point,
    layerRect.width,
    layerRect.height,
  );
  const segment = guideLoupeSegment(axis);
  if (!context || !segment) return;

  const color = guideColors.get(key) || "#fff";
  context.save();
  context.beginPath();
  context.moveTo(segment.start.x, segment.start.y);
  context.lineTo(segment.end.x, segment.end.y);
  context.setLineDash([5, 4]);
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.shadowColor = "rgba(0, 0, 0, 0.9)";
  context.shadowBlur = 2;
  context.stroke();
  context.restore();

  const frameRect = elements.measurementFrame.getBoundingClientRect();
  const position = positionCorrectionLoupe(
    pointer.clientX - frameRect.left,
    pointer.clientY - frameRect.top,
    frameRect.width,
    frameRect.height,
  );
  elements.guideLoupe.style.left = `${position.left}px`;
  elements.guideLoupe.style.top = `${position.top}px`;
  elements.guideLoupe.style.setProperty("--loupe-outline", color);
  elements.guideLoupeLabel.textContent = `${meta.label} · ${(guides[key] * 100).toFixed(1)}%`;
  elements.guideLoupe.hidden = false;
}

function beginGuideDrag(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (activeDrag) {
    event.stopPropagation();
    event.preventDefault();
    return;
  }

  const button = event.currentTarget;
  const key = button.dataset.guide;
  activeDrag = { key, pointerId: event.pointerId, button };
  button.setPointerCapture(event.pointerId);
  button.classList.add("is-dragging");
  document.body.classList.add("is-dragging-guide");
  updateGuideFromPointer(event, key);
  event.stopPropagation();
  event.preventDefault();
}

function updateGuideFromPointer(event, key) {
  const rect = elements.guideLayer.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const value = GUIDE_AXIS[key] === "x"
    ? (event.clientX - rect.left) / rect.width
    : (event.clientY - rect.top) / rect.height;
  applyGuideValue(key, value, {
    clientX: event.clientX,
    clientY: event.clientY,
    layerRect: rect,
  });
}

function moveActiveGuide(event) {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
  if (pointerButtonsAreReleased(event)) {
    endGuideDrag(event);
    return;
  }
  updateGuideFromPointer(event, activeDrag.key);
  event.preventDefault();
}

function releasePointerCapture(target, pointerId) {
  if (!target || pointerId === undefined || !target.hasPointerCapture?.(pointerId)) return;
  try {
    target.releasePointerCapture(pointerId);
  } catch {
    // Capture can already be gone after an OS gesture, tab switch, or canceled touch.
  }
}

function finishGuideDrag(pointerId, { releaseCapture = true, announce = true } = {}) {
  if (!activeDrag || (pointerId !== undefined && activeDrag.pointerId !== pointerId)) return false;

  const drag = activeDrag;
  activeDrag = null;
  scheduleGuideUi.flush();
  hideGuideLoupe();
  drag.button.classList.remove("is-dragging");
  document.body.classList.remove("is-dragging-guide");
  if (releaseCapture) releasePointerCapture(drag.button, drag.pointerId);
  if (announce) announceResults();
  return true;
}

function endGuideDrag(event) {
  finishGuideDrag(event.pointerId, {
    releaseCapture: event.type !== "lostpointercapture",
  });
}

function handleGuideKeydown(event) {
  const button = event.currentTarget;
  const key = button.dataset.guide;
  const axis = GUIDE_AXIS[key];
  const rect = elements.guideLayer.getBoundingClientRect();
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

  const psa = estimatePsaCentering(results, psaSide);
  elements.psaOutput.value = psa.label;
  elements.psaOutput.textContent = psa.label;
  elements.psaDetail.textContent = psa.valid
    ? `${psa.determiningAxis}决定 · 较偏一侧 ${psa.worst}%`
    : "请先完成四边参考线";
}

function setPsaSide(side) {
  psaSide = side === "back" ? "back" : "front";
  elements.psaFrontButton.setAttribute("aria-pressed", String(psaSide === "front"));
  elements.psaBackButton.setAttribute("aria-pressed", String(psaSide === "back"));
  updateResults();
  announceResults();
}

function currentResultAnnouncement() {
  const results = calculateMeasurements(guides);
  if (!results.horizontal.valid || !results.vertical.valid) {
    return "当前没有形成可测量的边框";
  }
  const psa = estimatePsaCentering(results, psaSide);
  return `左右居中 ${formatRatio(results.horizontal)}，上下居中 ${formatRatio(results.vertical)}，${psa.label}，仅为居中上限`;
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

function viewSize() {
  return {
    width: elements.measurementFrame.clientWidth,
    height: elements.measurementFrame.clientHeight,
    contentWidth: elements.imageCanvas.clientWidth,
    contentHeight: elements.imageCanvas.clientHeight,
  };
}

function updateImageCanvasSize() {
  const viewportWidth = elements.measurementFrame.clientWidth;
  const viewportHeight = elements.measurementFrame.clientHeight;
  const imageWidth = elements.sourceImage.naturalWidth;
  const imageHeight = elements.sourceImage.naturalHeight;
  const fitted = computeMeasurementImageSize(
    viewportWidth,
    viewportHeight,
    imageWidth,
    imageHeight,
  );
  if (!fitted.width || !fitted.height) return;
  elements.imageCanvas.style.width = `${fitted.width}px`;
  elements.imageCanvas.style.height = `${fitted.height}px`;
  measurementViewport?.reconcile({ render: false });
  renderView();
}

function renderView() {
  const state = measurementViewport?.getState() ?? { zoom: 1, panX: 0, panY: 0 };
  const inverseZoom = 1 / state.zoom;
  const localGuideWidth = guideScreenWidth(state.zoom) * inverseZoom;

  elements.measurementFrame.style.setProperty("--canvas-zoom", state.zoom.toFixed(4));
  elements.measurementFrame.style.setProperty("--canvas-pan-x", `${state.panX.toFixed(2)}px`);
  elements.measurementFrame.style.setProperty("--canvas-pan-y", `${state.panY.toFixed(2)}px`);
  elements.measurementFrame.style.setProperty("--guide-inverse-zoom", inverseZoom.toFixed(4));
  elements.measurementFrame.style.setProperty("--guide-active-scale", (inverseZoom * 1.12).toFixed(4));
  elements.measurementFrame.style.setProperty("--guide-line-width", `${localGuideWidth.toFixed(3)}px`);
  elements.measurementFrame.style.setProperty("--guide-shadow-size", `${(3 * inverseZoom).toFixed(3)}px`);
}

function correctionViewSize() {
  const width = elements.correctionFrame.clientWidth;
  const height = elements.correctionFrame.clientHeight;
  const fitted = computeContainSize(
    width,
    height,
    elements.sourceImage.naturalWidth,
    elements.sourceImage.naturalHeight,
  );
  return {
    width,
    height,
    contentWidth: fitted.width,
    contentHeight: fitted.height,
  };
}

function clipboardFile(blob) {
  const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([blob], `pasted-image.${extension}`, { type: blob.type || "image/png" });
}

async function pasteImageFromButton() {
  if (!navigator.clipboard?.read) {
    notifyUser("当前浏览器不支持按钮读取剪贴板", "可以直接按 Command / Ctrl + V，或使用“选择图片”。");
    return;
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (imageType) {
        await handleFile(clipboardFile(await item.getType(imageType)), "paste");
        return;
      }
    }
    notifyUser("剪贴板里没有可读取的图片", "请先在相册、聊天或网页中复制一张图片。");
  } catch (error) {
    const denied = error?.name === "NotAllowedError";
    notifyUser(
      denied ? "没有获得剪贴板权限" : "无法读取剪贴板",
      "你仍可使用“选择图片”或直接按 Command / Ctrl + V。",
    );
  }
}

function handlePaste(event) {
  const item = [...(event.clipboardData?.items || [])].find(
    (candidate) => candidate.kind === "file" && candidate.type.startsWith("image/"),
  );
  if (!item) return;
  const file = item.getAsFile();
  if (!file) return;
  event.preventDefault();
  handleFile(file, "paste");
}

function correctionPointToScreen(point) {
  return {
    x: correctionPreviewRect.left + (point.x * correctionPreviewRect.width),
    y: correctionPreviewRect.top + (point.y * correctionPreviewRect.height),
  };
}

function svgLine(svg, className) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", className);
  svg.append(line);
  return line;
}

let correctionOverlaySvg = null;
let correctionOutline = null;
let correctionGridLines = [];
let correctionHandleButtons = [];
const CORNER_LABELS = ["左上角", "右上角", "右下角", "左下角"];

function mountCorrectionHandles() {
  correctionOverlaySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  correctionOverlaySvg.classList.add("correction-quad-overlay");
  correctionOverlaySvg.setAttribute("aria-hidden", "true");
  correctionOutline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  correctionOutline.setAttribute("class", "correction-quad-outline");
  correctionOverlaySvg.append(correctionOutline);
  correctionGridLines = Array.from({ length: 6 }, (_, index) => (
    svgLine(correctionOverlaySvg, index >= 4 ? "is-center" : "")
  ));
  elements.correctionHandles.append(correctionOverlaySvg);

  correctionHandleButtons = Array.from({ length: 4 }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "corner-handle";
    button.dataset.corner = String(index);
    button.setAttribute("aria-label", `裁剪角点 ${index + 1}`);
    button.addEventListener("pointerdown", beginCornerDrag);
    button.addEventListener("pointermove", moveCornerDrag);
    button.addEventListener("pointerup", endCornerDrag);
    button.addEventListener("pointercancel", endCornerDrag);
    button.addEventListener("lostpointercapture", endCornerDrag);
    elements.correctionHandles.append(button);
    return button;
  });
}

function setSvgLine(line, start, end) {
  line.setAttribute("x1", start.x.toFixed(2));
  line.setAttribute("y1", start.y.toFixed(2));
  line.setAttribute("x2", end.x.toFixed(2));
  line.setAttribute("y2", end.y.toFixed(2));
}

function interpolate(first, second, progress) {
  return {
    x: first.x + ((second.x - first.x) * progress),
    y: first.y + ((second.y - first.y) * progress),
  };
}

function renderCorrectionOverlay() {
  const frameWidth = elements.correctionFrame.clientWidth;
  const frameHeight = elements.correctionFrame.clientHeight;
  if (!frameWidth || !frameHeight) return;
  correctionOverlaySvg.setAttribute("viewBox", `0 0 ${frameWidth} ${frameHeight}`);

  const adjustedPoints = correctionRecipe.quad.map(correctionPointToScreen);
  correctionOutline.setAttribute(
    "points",
    adjustedPoints.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
  );

  [1 / 3, 2 / 3, 0.5].forEach((progress, index) => {
    setSvgLine(
      correctionGridLines[index],
      interpolate(adjustedPoints[0], adjustedPoints[1], progress),
      interpolate(adjustedPoints[3], adjustedPoints[2], progress),
    );
    setSvgLine(
      correctionGridLines[index + 3],
      interpolate(adjustedPoints[0], adjustedPoints[3], progress),
      interpolate(adjustedPoints[1], adjustedPoints[2], progress),
    );
  });

  correctionHandleButtons.forEach((button, index) => {
    button.style.left = `${adjustedPoints[index].x}px`;
    button.style.top = `${adjustedPoints[index].y}px`;
  });
}

function drawCorrectionSource() {
  const width = elements.correctionFrame.clientWidth;
  const height = elements.correctionFrame.clientHeight;
  const layout = computeZoomedContainRect(
    width,
    height,
    elements.sourceImage.naturalWidth,
    elements.sourceImage.naturalHeight,
    correctionViewport?.getState(),
  );
  if (!width || !height || !layout.contentWidth || !layout.contentHeight) return;
  correctionViewport?.setState(layout.viewState, { render: false });
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  elements.correctionCanvas.width = Math.round(width * pixelRatio);
  elements.correctionCanvas.height = Math.round(height * pixelRatio);
  const context = elements.correctionCanvas.getContext("2d", { alpha: true });
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  correctionPreviewRect = {
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
  };
  context.drawImage(
    elements.sourceImage,
    correctionPreviewRect.left,
    correctionPreviewRect.top,
    layout.width,
    layout.height,
  );
}

function renderCorrectionViewport() {
  drawCorrectionSource();
  renderCorrectionOverlay();
}

function setCorrectionBusy(busy) {
  [elements.correctionApplyButton, elements.correctionApplyButtonBottom].forEach((button) => {
    button.disabled = busy;
    button.textContent = busy ? "处理中…" : "应用校正";
  });
}

function setCorrectionSourceBusy(busy) {
  [
    elements.correctionResetButton,
    elements.correctionResetButtonBottom,
    elements.correctionCancelButton,
    elements.correctionCancelButtonBottom,
    elements.correctionApplyButton,
    elements.correctionApplyButtonBottom,
  ].forEach((button) => {
    button.disabled = busy;
  });
}

function renderCorrectionUi() {
  if (!correctionTools || !correctionRecipe) return;
  renderCorrectionOverlay();
  const assessment = correctionTools.assessCaptureGeometry(correctionRecipe);
  elements.geometryAdvice.dataset.level = assessment.level;
  elements.geometryAdviceTitle.textContent = `四角对准后：${assessment.label}`;
  const canApply = correctionTools.isConvexQuad(correctionRecipe.quad);
  elements.correctionApplyButton.disabled = !canApply;
  elements.correctionApplyButtonBottom.disabled = !canApply;
}

function createOriginalRestoreRecipe() {
  return {
    ...correctionTools.createCorrectionRecipe(),
    quad: ORIGINAL_RESTORE_QUAD.map((point) => ({ ...point })),
  };
}

function isOriginalRestoreRecipe(recipe) {
  if (!recipe) return false;
  return ORIGINAL_RESTORE_QUAD.every((point, index) => (
    recipe.quad?.[index]?.x === point.x && recipe.quad[index].y === point.y
  ));
}

async function restoreOriginalImage() {
  if (!imageSession?.originalBlob) return;
  const previousSession = imageSession;
  const previousRecipe = {
    ...correctionRecipe,
    quad: correctionRecipe.quad.map((point) => ({ ...point })),
  };
  hideCorrectionLoupe();
  showOriginalCorrectionPreview();
  setCorrectionSourceBusy(true);
  try {
    const restoredSession = imageTools.restoreOriginalCorrection(imageSession);
    correctionRecipe = createOriginalRestoreRecipe();
    await displaySourceImage(restoredSession.correctionBlob);
    imageSession = restoredSession;
    correctionViewport?.reset({ render: false });
    drawCorrectionSource();
    renderCorrectionUi();
    elements.resultAnnouncer.textContent = "已还原到最初上传的图片。应用校正可保存还原，取消可保留当前工作图。";
  } catch {
    imageSession = previousSession;
    correctionRecipe = previousRecipe;
    await displaySourceImage(previousSession.correctionBlob).catch(() => {});
    drawCorrectionSource();
    renderCorrectionUi();
    notifyUser("原图无法读取", "当前工作图没有变化，请重新上传图片后重试。");
  } finally {
    setCorrectionSourceBusy(false);
    renderCorrectionUi();
  }
}

function hideCorrectionLoupe() {
  elements.correctionLoupe.hidden = true;
  correctionHandleButtons.forEach((button) => button.classList.remove("is-dragging"));
}

function drawCorrectionLoupeGuides(context, recipe, cornerIndex) {
  const adjustedPoints = recipe.quad.map(correctionPointToScreen);
  const segments = correctionLoupeGuideSegments(adjustedPoints, cornerIndex);
  if (!segments.length) return;

  context.save();
  context.beginPath();
  segments.forEach(({ start, end }) => {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  });
  context.lineWidth = 1.5;
  context.lineCap = "round";
  context.strokeStyle = "#fff";
  context.shadowColor = "rgba(0, 0, 0, 0.9)";
  context.shadowBlur = 2;
  context.stroke();
  context.restore();
}

function drawCorrectionLoupe(point, pointerX, pointerY, cornerIndex, recipe = correctionRecipe) {
  const context = drawLoupeImage(
    elements.correctionLoupeCanvas,
    point,
    correctionPreviewRect.width,
    correctionPreviewRect.height,
  );
  if (!context) return;
  drawCorrectionLoupeGuides(context, recipe, cornerIndex);

  const position = positionCorrectionLoupe(
    pointerX,
    pointerY,
    elements.correctionFrame.clientWidth,
    elements.correctionFrame.clientHeight,
  );
  elements.correctionLoupe.style.left = `${position.left}px`;
  elements.correctionLoupe.style.top = `${position.top}px`;
  elements.correctionLoupeLabel.textContent = `${CORNER_LABELS[cornerIndex]} · ${CORRECTION_LOUPE_MAGNIFICATION}×`;
  elements.correctionLoupe.hidden = false;
}

function beginCornerDrag(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const button = event.currentTarget;
  activeCornerDrag = {
    pointerId: event.pointerId,
    index: Number(button.dataset.corner),
    button,
  };
  button.classList.add("is-dragging");
  button.setPointerCapture(event.pointerId);
  moveCornerDrag(event);
  event.preventDefault();
}

function moveCornerDrag(event) {
  if (!activeCornerDrag || activeCornerDrag.pointerId !== event.pointerId) return;
  if (pointerButtonsAreReleased(event)) {
    endCornerDrag(event);
    return;
  }
  const frameRect = elements.correctionFrame.getBoundingClientRect();
  const pointerX = event.clientX - frameRect.left;
  const pointerY = event.clientY - frameRect.top;
  const point = {
    x: Math.min(0.995, Math.max(0.005, (pointerX - correctionPreviewRect.left) / correctionPreviewRect.width)),
    y: Math.min(0.995, Math.max(0.005, (pointerY - correctionPreviewRect.top) / correctionPreviewRect.height)),
  };
  const nextQuad = correctionRecipe.quad.map((current, index) => (
    index === activeCornerDrag.index ? point : current
  ));
  if (correctionTools.isConvexQuad(nextQuad)) {
    const nextRecipe = { ...correctionRecipe, quad: nextQuad };
    correctionRecipe = nextRecipe;
    scheduleCorrectionDragUi({
      point,
      pointerX,
      pointerY,
      cornerIndex: activeCornerDrag.index,
      recipe: nextRecipe,
    });
  } else {
    scheduleCorrectionDragUi({
      point: correctionRecipe.quad[activeCornerDrag.index],
      pointerX,
      pointerY,
      cornerIndex: activeCornerDrag.index,
      recipe: correctionRecipe,
    });
  }
  event.preventDefault();
}

function finishCornerDrag(pointerId, { releaseCapture = true } = {}) {
  if (!activeCornerDrag
    || (pointerId !== undefined && activeCornerDrag.pointerId !== pointerId)) return false;

  const drag = activeCornerDrag;
  activeCornerDrag = null;
  scheduleCorrectionDragUi.flush();
  drag.button.classList.remove("is-dragging");
  if (releaseCapture) releasePointerCapture(drag.button, drag.pointerId);
  hideCorrectionLoupe();
  return true;
}

function endCornerDrag(event) {
  finishCornerDrag(event.pointerId, {
    releaseCapture: event.type !== "lostpointercapture",
  });
}

function endActivePointerInteractions(event) {
  endGuideDrag(event);
  measurementViewport?.endPointer(event);
  correctionViewport?.endPointer(event);
  endCornerDrag(event);
}

function cancelActivePointerInteractions() {
  finishGuideDrag(undefined, { releaseCapture: false, announce: false });
  measurementViewport?.cancel({ releaseCapture: false });
  correctionViewport?.cancel({ releaseCapture: false });
  finishCornerDrag(undefined, { releaseCapture: false });
  showOriginalCorrectionPreview();
}

function handleVisibilityChange() {
  if (document.hidden) cancelActivePointerInteractions();
}

async function openCorrection() {
  if (!imageSession?.workingBlob) return;
  dismissNotice();
  hideCorrectionLoupe();
  try {
    await Promise.all([loadImageTools(), loadCorrectionTools()]);
  } catch {
    notifyUser("校正工具无法读取", "请刷新页面后重试；当前图片没有变化。");
    return;
  }
  imageSession = imageTools.beginImageCorrection(imageSession);
  correctionRecipe = correctionTools.createCorrectionRecipe();
  correctionViewport?.reset({ render: false });
  showView(elements.correctionView);
  window.requestAnimationFrame(() => {
    drawCorrectionSource();
    renderCorrectionUi();
  });
}

async function cancelCorrection() {
  if (!imageSession?.workingBlob) return;
  correctionViewport?.cancel();
  hideCorrectionLoupe();
  showOriginalCorrectionPreview();
  imageSession = imageTools.beginImageCorrection(imageSession);
  await displaySourceImage(imageSession.workingBlob);
  showView(elements.editorView);
  window.requestAnimationFrame(updateImageCanvasSize);
}

function showOriginalCorrectionPreview() {
  elements.correctionCanvas.hidden = false;
  elements.correctionResultCanvas.hidden = true;
  elements.correctionHandles.hidden = false;
  elements.correctionCompareButton.textContent = "按住预览校正";
}

function showCorrectedCorrectionPreview(event) {
  if (!correctionTools || !correctionRecipe) return;
  if (!correctionTools.isConvexQuad(correctionRecipe.quad)) return;
  correctionViewport?.cancel();
  const size = correctionTools.correctionOutputSize(
    elements.sourceImage.naturalWidth,
    elements.sourceImage.naturalHeight,
    correctionRecipe,
    1400,
  );
  const renderer = correctionTools.renderCorrectionToCanvas(
    elements.sourceImage,
    correctionRecipe,
    elements.correctionResultCanvas,
    size,
  );
  if (renderer !== "webgl" && correctionTools.requiresProjectiveCorrection(correctionRecipe)) {
    elements.correctionRendererNote.textContent = "当前设备只能执行矩形裁剪，无法可靠预览四角或透视校正。";
    notifyUser("当前浏览器无法预览透视校正", "可点还原原图后执行普通矩形裁剪。");
    return;
  }
  elements.correctionRendererNote.textContent = renderer === "webgl"
    ? "四角裁剪与拉正预览由本机 GPU 生成；图片不会上传。"
    : "当前设备仅支持矩形裁剪；四角透视拉正需要较新的浏览器。";
  elements.correctionCanvas.hidden = true;
  elements.correctionResultCanvas.hidden = false;
  elements.correctionHandles.hidden = true;
  elements.correctionCompareButton.textContent = "松开回到四角";
  elements.correctionCompareButton.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

async function applyCorrection() {
  if (!imageTools || !correctionTools || !correctionRecipe) return;
  if (!correctionTools.isConvexQuad(correctionRecipe.quad)) {
    notifyUser("四个角点没有形成有效区域", "请让四个角按左上、右上、右下、左下依次围住卡片。");
    return;
  }
  setCorrectionBusy(true);
  correctionViewport?.cancel();
  await new Promise((resolve) => window.requestAnimationFrame(resolve));

  try {
    let correctedBlob;
    if (imageSession?.correctionBlob === imageSession?.originalBlob
      && isOriginalRestoreRecipe(correctionRecipe)) {
      correctedBlob = imageSession.originalBlob;
    } else {
      const size = correctionTools.correctionOutputSize(
        elements.sourceImage.naturalWidth,
        elements.sourceImage.naturalHeight,
        correctionRecipe,
        imageTools.MAX_WORKING_EDGE,
      );
      const canvas = elements.correctionResultCanvas;
      const renderer = correctionTools.renderCorrectionToCanvas(elements.sourceImage, correctionRecipe, canvas, size);
      if (renderer !== "webgl" && correctionTools.requiresProjectiveCorrection(correctionRecipe)) {
        throw new Error("当前浏览器不支持透视校正");
      }
      correctedBlob = await imageTools.canvasToBlob(canvas, "image/jpeg", 0.94);
    }
    await displayWorkingImage(correctedBlob);
    guides = { ...DEFAULT_GUIDES };
    renderGuides();
    updateResults();
    showView(elements.editorView);
    window.requestAnimationFrame(() => {
      updateImageCanvasSize();
      measurementViewport?.reset();
      notifyUser("图片校正已应用", "外沿参考线已贴合图片边缘，请继续对齐图案内沿。");
    });
  } catch (error) {
    notifyUser("无法应用图片校正", error?.message || "请重新拖动四角后重试。");
  } finally {
    setCorrectionBusy(false);
  }
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

const scheduleGuideUi = createKeyedFrameScheduler((keys, loupeState) => {
  keys.forEach(renderGuide);
  updateResults();
  if (loupeState) {
    drawGuideLoupe(loupeState, loupeState.key, loupeState.layerRect);
  }
}, window);
const scheduleViewRender = createFrameScheduler(renderView, window);
const scheduleMeasurementLayout = createFrameScheduler(updateImageCanvasSize, window);
const scheduleCorrectionDragUi = createFrameScheduler((loupeState) => {
  renderCorrectionUi();
  if (loupeState) {
    drawCorrectionLoupe(
      loupeState.point,
      loupeState.pointerX,
      loupeState.pointerY,
      loupeState.cornerIndex,
      loupeState.recipe,
    );
  }
}, window);
const scheduleCorrectionViewport = createFrameScheduler(renderCorrectionViewport, window);
const scheduleCorrectionLayout = createFrameScheduler(() => {
  drawCorrectionSource();
  renderCorrectionUi();
}, window);

measurementViewport = createViewportController({
  frame: elements.measurementFrame,
  controls: {
    zoomOutButton: elements.zoomOutButton,
    zoomResetButton: elements.zoomResetButton,
    zoomInButton: elements.zoomInButton,
    zoomValue: elements.zoomValue,
  },
  getMetrics: viewSize,
  requestRender: scheduleViewRender,
  ignoreSelector: ".guide",
});
correctionViewport = createViewportController({
  frame: elements.correctionFrame,
  controls: {
    zoomOutButton: elements.correctionZoomOutButton,
    zoomResetButton: elements.correctionZoomResetButton,
    zoomInButton: elements.correctionZoomInButton,
    zoomValue: elements.correctionZoomValue,
  },
  getMetrics: correctionViewSize,
  requestRender: scheduleCorrectionViewport,
  ignoreSelector: ".corner-handle",
  canInteract: () => elements.correctionResultCanvas.hidden,
  onInteractionStart: hideCorrectionLoupe,
  resetLabel: "恢复裁剪图片",
});

elements.chooseImageButton.addEventListener("click", requestImage);
elements.changeImageButton.addEventListener("click", requestImage);
elements.processingChangeButton.addEventListener("click", requestImage);
elements.takePhotoButton.addEventListener("click", () => elements.cameraInput.click());
elements.pasteImageButton.addEventListener("click", pasteImageFromButton);
elements.fileInput.addEventListener("change", handleFileInput);
elements.cameraInput.addEventListener("change", handleFileInput);
elements.correctImageButton.addEventListener("click", openCorrection);
elements.psaFrontButton.addEventListener("click", () => setPsaSide("front"));
elements.psaBackButton.addEventListener("click", () => setPsaSide("back"));
elements.correctionResetButton.addEventListener("click", restoreOriginalImage);
elements.correctionResetButtonBottom.addEventListener("click", restoreOriginalImage);
elements.correctionCancelButton.addEventListener("click", cancelCorrection);
elements.correctionCancelButtonBottom.addEventListener("click", cancelCorrection);
elements.correctionApplyButton.addEventListener("click", applyCorrection);
elements.correctionApplyButtonBottom.addEventListener("click", applyCorrection);
elements.correctionCompareButton.addEventListener("pointerdown", showCorrectedCorrectionPreview);
elements.correctionCompareButton.addEventListener("pointerup", showOriginalCorrectionPreview);
elements.correctionCompareButton.addEventListener("pointercancel", showOriginalCorrectionPreview);
elements.correctionCompareButton.addEventListener("lostpointercapture", showOriginalCorrectionPreview);
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
  scheduleGuideUi.cancel();
  scheduleViewRender.cancel();
  scheduleMeasurementLayout.cancel();
  scheduleCorrectionDragUi.cancel();
  scheduleCorrectionViewport.cancel();
  scheduleCorrectionLayout.cancel();
  measurementViewport?.destroy();
  correctionViewport?.destroy();
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
});
window.addEventListener("paste", handlePaste);
window.addEventListener("pointerup", endActivePointerInteractions, true);
window.addEventListener("pointercancel", endActivePointerInteractions, true);
window.addEventListener("blur", cancelActivePointerInteractions);
document.addEventListener("visibilitychange", handleVisibilityChange);

if ("ResizeObserver" in window) {
  const measurementResizeObserver = new ResizeObserver(scheduleMeasurementLayout);
  measurementResizeObserver.observe(elements.measurementFrame);
  const correctionResizeObserver = new ResizeObserver(() => {
    if (document.body.dataset.view !== "correction-view") return;
    scheduleCorrectionLayout();
  });
  correctionResizeObserver.observe(elements.correctionFrame);
}

mountGuides();
mountCorrectionHandles();
renderGuides();
updateResults();
renderView();

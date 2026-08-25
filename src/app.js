import {
  DEFAULT_GUIDES,
  GUIDE_AXIS,
  calculateMeasurements,
  estimatePsaCentering,
  formatRatio,
  moveGuide,
} from "./measurement.js";
import {
  MAX_WORKING_EDGE,
  canvasToBlob,
  isHeicFile,
  isTiffFile,
  prepareWorkingImage,
  validateImageFile,
} from "./image.js";
import {
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  VIEW_ZOOM_STEP,
  CORRECTION_LOUPE_MAGNIFICATION,
  CORRECTION_LOUPE_SIZE,
  clampViewState,
  computeContainSize,
  correctionLoupeSourceRect,
  guideScreenWidth,
  panView,
  pinchView,
  positionCorrectionLoupe,
  zoomViewAt,
} from "./viewport.js";
import {
  assessCaptureGeometry,
  correctionOutputSize,
  correctionSampleQuad,
  createCorrectionRecipe,
  effectiveQuad,
  isConvexQuad,
  requiresProjectiveCorrection,
  renderCorrectionToCanvas,
} from "./perspective.js";

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
  resetGuidesButton: document.querySelector("#reset-guides-button"),
  changeImageButton: document.querySelector("#change-image-button"),
  correctImageButton: document.querySelector("#correct-image-button"),
  measurementFrame: document.querySelector("#measurement-frame"),
  imageCanvas: document.querySelector("#image-canvas"),
  guideLayer: document.querySelector("#guide-layer"),
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
  correctionResetButton: document.querySelector("#correction-reset-button"),
  correctionCancelButton: document.querySelector("#correction-cancel-button"),
  correctionCancelButtonBottom: document.querySelector("#correction-cancel-button-bottom"),
  correctionApplyButton: document.querySelector("#correction-apply-button"),
  correctionApplyButtonBottom: document.querySelector("#correction-apply-button-bottom"),
  aspectControl: document.querySelector("#aspect-control"),
  straightenControl: document.querySelector("#straighten-control"),
  straightenValue: document.querySelector("#straighten-value"),
  verticalPerspectiveControl: document.querySelector("#vertical-perspective-control"),
  verticalPerspectiveValue: document.querySelector("#vertical-perspective-value"),
  horizontalPerspectiveControl: document.querySelector("#horizontal-perspective-control"),
  horizontalPerspectiveValue: document.querySelector("#horizontal-perspective-value"),
  geometryAdvice: document.querySelector("#geometry-advice"),
  geometryAdviceTitle: document.querySelector("#geometry-advice-title"),
  correctionRendererNote: document.querySelector("#correction-renderer-note"),
  resultAnnouncer: document.querySelector("#result-announcer"),
};

let guides = { ...DEFAULT_GUIDES };
let guideButtons = new Map();
let activeDrag = null;
let currentImageUrl = null;
let currentWorkingBlob = null;
let processingTimers = [];
let announceTimer = null;
let imageLoadSequence = 0;
let viewState = { zoom: MIN_VIEW_ZOOM, panX: 0, panY: 0 };
const imagePointers = new Map();
let panGesture = null;
let pinchGesture = null;
let psaSide = "front";
let correctionRecipe = createCorrectionRecipe();
let correctionPreviewRect = { left: 0, top: 0, width: 0, height: 0 };
let activeCornerDrag = null;
let correctionRenderFrame = null;

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

async function displayWorkingImage(blob) {
  currentWorkingBlob = blob;
  elements.sourceImage.src = replaceCurrentImageUrl(blob);
  await elements.sourceImage.decode();
}

async function handleFile(file, source = "file") {
  if (!file) return;

  const validationError = validateImageFile(file);
  if (validationError) {
    clearProcessingTimers();
    if (currentWorkingBlob && document.body.dataset.view !== "upload-view") {
      notifyUser(validationError.title, validationError.detail);
    } else {
      showUploadError(validationError.title, validationError.detail);
    }
    return;
  }

  if (currentWorkingBlob && !["upload-view", "processing-view"].includes(document.body.dataset.view)) {
    const description = source === "paste" ? "粘贴的图片" : "新选择的图片";
    if (!await confirmImageReplacement(description)) return;
  }

  const loadId = ++imageLoadSequence;
  const hadCurrentImage = Boolean(currentWorkingBlob);
  clearUploadError();
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
    window.requestAnimationFrame(() => {
      updateImageCanvasSize();
      resetView();
      renderGuides();
    });
  } catch {
    if (loadId !== imageLoadSequence) return;

    clearProcessingTimers();
    const errorMessage = isHeicFile(file)
      ? ["HEIC 图片无法读取", "请确认文件没有损坏；如果图片来自 iCloud，请先下载原图后重试。"]
      : isTiffFile(file)
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
  event.stopPropagation();
  event.preventDefault();
}

function updateGuideFromPointer(event, key) {
  const rect = elements.guideLayer.getBoundingClientRect();
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

function resetGuides() {
  guides = { ...DEFAULT_GUIDES };
  renderGuides();
  updateResults();
  announceResults();
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
  const fitted = computeContainSize(viewportWidth, viewportHeight, imageWidth, imageHeight);
  if (!fitted.width || !fitted.height) return;
  elements.imageCanvas.style.width = `${fitted.width}px`;
  elements.imageCanvas.style.height = `${fitted.height}px`;
  const { width, height, contentWidth, contentHeight } = viewSize();
  viewState = clampViewState(viewState, width, height, contentWidth, contentHeight);
  renderView();
}

function renderView() {
  const inverseZoom = 1 / viewState.zoom;
  const localGuideWidth = guideScreenWidth(viewState.zoom) * inverseZoom;

  elements.measurementFrame.style.setProperty("--canvas-zoom", viewState.zoom.toFixed(4));
  elements.measurementFrame.style.setProperty("--canvas-pan-x", `${viewState.panX.toFixed(2)}px`);
  elements.measurementFrame.style.setProperty("--canvas-pan-y", `${viewState.panY.toFixed(2)}px`);
  elements.measurementFrame.style.setProperty("--guide-inverse-zoom", inverseZoom.toFixed(4));
  elements.measurementFrame.style.setProperty("--guide-active-scale", (inverseZoom * 1.12).toFixed(4));
  elements.measurementFrame.style.setProperty("--guide-line-width", `${localGuideWidth.toFixed(3)}px`);
  elements.measurementFrame.style.setProperty("--guide-shadow-size", `${(3 * inverseZoom).toFixed(3)}px`);
  elements.measurementFrame.classList.toggle("is-zoomed", viewState.zoom > MIN_VIEW_ZOOM);

  const percentage = `${Math.round(viewState.zoom * 100)}%`;
  elements.zoomValue.textContent = percentage;
  elements.zoomResetButton.setAttribute("aria-label", `恢复为 100%，当前 ${percentage}`);
  elements.zoomOutButton.disabled = viewState.zoom <= MIN_VIEW_ZOOM;
  elements.zoomInButton.disabled = viewState.zoom >= MAX_VIEW_ZOOM;
}

function setView(nextState) {
  const { width, height, contentWidth, contentHeight } = viewSize();
  viewState = clampViewState(nextState, width, height, contentWidth, contentHeight);
  renderView();
}

function resetView() {
  imagePointers.clear();
  panGesture = null;
  pinchGesture = null;
  elements.measurementFrame.classList.remove("is-panning");
  setView({ zoom: MIN_VIEW_ZOOM, panX: 0, panY: 0 });
}

function zoomAtPoint(requestedZoom, clientX, clientY) {
  const rect = elements.measurementFrame.getBoundingClientRect();
  const { width, height, contentWidth, contentHeight } = viewSize();
  const focalX = clientX - (rect.left + rect.width / 2);
  const focalY = clientY - (rect.top + rect.height / 2);
  viewState = zoomViewAt(
    viewState,
    requestedZoom,
    focalX,
    focalY,
    width,
    height,
    contentWidth,
    contentHeight,
  );
  renderView();
}

function zoomAtCenter(requestedZoom) {
  const { width, height, contentWidth, contentHeight } = viewSize();
  viewState = zoomViewAt(
    viewState,
    requestedZoom,
    0,
    0,
    width,
    height,
    contentWidth,
    contentHeight,
  );
  renderView();
}

function pointerPairMetrics() {
  const [first, second] = [...imagePointers.values()];
  if (!first || !second) return null;

  const rect = elements.measurementFrame.getBoundingClientRect();
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  return {
    distance: Math.hypot(deltaX, deltaY),
    center: {
      x: ((first.x + second.x) / 2) - (rect.left + rect.width / 2),
      y: ((first.y + second.y) / 2) - (rect.top + rect.height / 2),
    },
  };
}

function startPinchGesture() {
  const metrics = pointerPairMetrics();
  if (!metrics || !(metrics.distance > 0)) return;
  pinchGesture = {
    state: { ...viewState },
    distance: metrics.distance,
    center: metrics.center,
  };
  panGesture = null;
  elements.measurementFrame.classList.add("is-panning");
}

function beginImageGesture(event) {
  if (event.target.closest(".guide")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.pointerType === "mouse" && viewState.zoom <= MIN_VIEW_ZOOM) return;

  imagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  elements.measurementFrame.setPointerCapture(event.pointerId);

  if (imagePointers.size === 1) {
    panGesture = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      state: { ...viewState },
    };
    if (viewState.zoom > MIN_VIEW_ZOOM) {
      elements.measurementFrame.classList.add("is-panning");
    }
  } else if (imagePointers.size === 2) {
    startPinchGesture();
  }

  event.preventDefault();
}

function moveImageGesture(event) {
  if (!imagePointers.has(event.pointerId)) return;
  imagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const { width, height, contentWidth, contentHeight } = viewSize();

  if (imagePointers.size >= 2 && pinchGesture) {
    const metrics = pointerPairMetrics();
    if (metrics) {
      viewState = pinchView(
        pinchGesture.state,
        pinchGesture.distance,
        pinchGesture.center,
        metrics.distance,
        metrics.center,
        width,
        height,
        contentWidth,
        contentHeight,
      );
      renderView();
    }
  } else if (panGesture?.pointerId === event.pointerId) {
    viewState = panView(
      panGesture.state,
      event.clientX - panGesture.x,
      event.clientY - panGesture.y,
      width,
      height,
      contentWidth,
      contentHeight,
    );
    renderView();
  }

  event.preventDefault();
}

function endImageGesture(event) {
  if (!imagePointers.has(event.pointerId)) return;
  imagePointers.delete(event.pointerId);
  if (elements.measurementFrame.hasPointerCapture(event.pointerId)) {
    elements.measurementFrame.releasePointerCapture(event.pointerId);
  }

  if (imagePointers.size === 1) {
    const [pointerId, point] = imagePointers.entries().next().value;
    panGesture = { pointerId, x: point.x, y: point.y, state: { ...viewState } };
    pinchGesture = null;
  } else if (imagePointers.size === 0) {
    panGesture = null;
    pinchGesture = null;
    elements.measurementFrame.classList.remove("is-panning");
  } else {
    startPinchGesture();
  }
}

function handleImageWheel(event) {
  const pageScale = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
    ? elements.measurementFrame.clientHeight
    : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
  const factor = Math.exp(-event.deltaY * pageScale * 0.002);
  zoomAtPoint(viewState.zoom * factor, event.clientX, event.clientY);
  event.preventDefault();
}

function handleImageDoubleClick(event) {
  if (event.target.closest(".guide")) return;
  const requestedZoom = viewState.zoom < 2 ? 2 : MIN_VIEW_ZOOM;
  zoomAtPoint(requestedZoom, event.clientX, event.clientY);
  event.preventDefault();
}

function handleImageKeydown(event) {
  if (event.target !== elements.measurementFrame) return;

  if (event.key === "+" || event.key === "=") {
    zoomAtCenter(viewState.zoom + VIEW_ZOOM_STEP);
  } else if (event.key === "-") {
    zoomAtCenter(viewState.zoom - VIEW_ZOOM_STEP);
  } else if (event.key === "0") {
    resetView();
  } else if (event.key.startsWith("Arrow") && viewState.zoom > MIN_VIEW_ZOOM) {
    const distance = event.shiftKey ? 48 : 16;
    const deltaX = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
    const deltaY = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
    const { width, height, contentWidth, contentHeight } = viewSize();
    viewState = panView(
      viewState,
      deltaX,
      deltaY,
      width,
      height,
      contentWidth,
      contentHeight,
    );
    renderView();
  } else {
    return;
  }

  event.preventDefault();
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

  const basePoints = correctionRecipe.quad.map(correctionPointToScreen);
  const adjustedPoints = correctionSampleQuad(
    elements.sourceImage.naturalWidth,
    elements.sourceImage.naturalHeight,
    correctionRecipe,
  ).map(correctionPointToScreen);
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
    button.style.left = `${basePoints[index].x}px`;
    button.style.top = `${basePoints[index].y}px`;
  });
}

function drawCorrectionSource() {
  const width = elements.correctionFrame.clientWidth;
  const height = elements.correctionFrame.clientHeight;
  if (!width || !height || !elements.sourceImage.naturalWidth) return;
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  elements.correctionCanvas.width = Math.round(width * pixelRatio);
  elements.correctionCanvas.height = Math.round(height * pixelRatio);
  const context = elements.correctionCanvas.getContext("2d", { alpha: true });
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const fitted = computeContainSize(
    width,
    height,
    elements.sourceImage.naturalWidth,
    elements.sourceImage.naturalHeight,
  );
  correctionPreviewRect = {
    left: (width - fitted.width) / 2,
    top: (height - fitted.height) / 2,
    width: fitted.width,
    height: fitted.height,
  };
  context.drawImage(
    elements.sourceImage,
    correctionPreviewRect.left,
    correctionPreviewRect.top,
    fitted.width,
    fitted.height,
  );
}

function setCorrectionBusy(busy) {
  [elements.correctionApplyButton, elements.correctionApplyButtonBottom].forEach((button) => {
    button.disabled = busy;
    button.textContent = busy ? "处理中…" : "应用校正";
  });
}

function renderCorrectionUi() {
  correctionRenderFrame = null;
  renderCorrectionOverlay();
  elements.straightenValue.textContent = `${Number(correctionRecipe.straighten).toFixed(1)}°`;
  elements.verticalPerspectiveValue.textContent = String(Math.round(correctionRecipe.verticalPerspective));
  elements.horizontalPerspectiveValue.textContent = String(Math.round(correctionRecipe.horizontalPerspective));
  elements.aspectControl.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.aspect === correctionRecipe.aspect));
  });
  const assessment = assessCaptureGeometry(correctionRecipe);
  elements.geometryAdvice.dataset.level = assessment.level;
  elements.geometryAdviceTitle.textContent = `四角对准后：${assessment.label}`;
  const canApply = isConvexQuad(effectiveQuad(correctionRecipe));
  elements.correctionApplyButton.disabled = !canApply;
  elements.correctionApplyButtonBottom.disabled = !canApply;
}

function scheduleCorrectionUi() {
  if (correctionRenderFrame !== null) return;
  correctionRenderFrame = window.requestAnimationFrame(renderCorrectionUi);
}

function resetCorrection() {
  correctionRecipe = createCorrectionRecipe();
  elements.straightenControl.value = "0";
  elements.verticalPerspectiveControl.value = "0";
  elements.horizontalPerspectiveControl.value = "0";
  scheduleCorrectionUi();
}

function hideCorrectionLoupe() {
  elements.correctionLoupe.hidden = true;
  correctionHandleButtons.forEach((button) => button.classList.remove("is-dragging"));
}

function drawCorrectionLoupe(point, pointerX, pointerY, cornerIndex) {
  const sourceWidth = elements.sourceImage.naturalWidth;
  const sourceHeight = elements.sourceImage.naturalHeight;
  const sourceRect = correctionLoupeSourceRect(
    point,
    sourceWidth,
    sourceHeight,
    correctionPreviewRect.width,
    correctionPreviewRect.height,
  );
  if (!sourceRect) return;

  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const canvas = elements.correctionLoupeCanvas;
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
  activeCornerDrag = { pointerId: event.pointerId, index: Number(event.currentTarget.dataset.corner) };
  event.currentTarget.classList.add("is-dragging");
  event.currentTarget.setPointerCapture(event.pointerId);
  moveCornerDrag(event);
  event.preventDefault();
}

function moveCornerDrag(event) {
  if (!activeCornerDrag || activeCornerDrag.pointerId !== event.pointerId) return;
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
  if (isConvexQuad(nextQuad)) {
    drawCorrectionLoupe(point, pointerX, pointerY, activeCornerDrag.index);
    correctionRecipe = { ...correctionRecipe, quad: nextQuad };
    scheduleCorrectionUi();
  } else {
    drawCorrectionLoupe(
      correctionRecipe.quad[activeCornerDrag.index],
      pointerX,
      pointerY,
      activeCornerDrag.index,
    );
  }
  event.preventDefault();
}

function endCornerDrag(event) {
  if (!activeCornerDrag || activeCornerDrag.pointerId !== event.pointerId) return;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  event.currentTarget.classList.remove("is-dragging");
  activeCornerDrag = null;
  hideCorrectionLoupe();
}

function openCorrection() {
  if (!currentWorkingBlob) return;
  hideCorrectionLoupe();
  correctionRecipe = createCorrectionRecipe();
  elements.straightenControl.value = "0";
  elements.verticalPerspectiveControl.value = "0";
  elements.horizontalPerspectiveControl.value = "0";
  showView(elements.correctionView);
  window.requestAnimationFrame(() => {
    drawCorrectionSource();
    renderCorrectionUi();
  });
}

function cancelCorrection() {
  hideCorrectionLoupe();
  showOriginalCorrectionPreview();
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
  if (!isConvexQuad(effectiveQuad(correctionRecipe))) return;
  const size = correctionOutputSize(
    elements.sourceImage.naturalWidth,
    elements.sourceImage.naturalHeight,
    correctionRecipe,
    1400,
  );
  const renderer = renderCorrectionToCanvas(
    elements.sourceImage,
    correctionRecipe,
    elements.correctionResultCanvas,
    size,
  );
  if (renderer !== "webgl" && requiresProjectiveCorrection(
    elements.sourceImage.naturalWidth,
    elements.sourceImage.naturalHeight,
    correctionRecipe,
  )) {
    elements.correctionRendererNote.textContent = "当前设备只能执行矩形裁剪，无法可靠预览四角或透视校正。";
    notifyUser("当前浏览器无法预览透视校正", "仍可还原四角和透视滑杆后执行普通矩形裁剪。");
    return;
  }
  elements.correctionRendererNote.textContent = renderer === "webgl"
    ? "透视预览由本机 GPU 生成；图片不会上传。应用后参考线会重置。"
    : "当前设备仅支持矩形裁剪；四角和透视校正需要较新的浏览器。";
  elements.correctionCanvas.hidden = true;
  elements.correctionResultCanvas.hidden = false;
  elements.correctionHandles.hidden = true;
  elements.correctionCompareButton.textContent = "松开回到四角";
  elements.correctionCompareButton.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

async function applyCorrection() {
  if (!isConvexQuad(effectiveQuad(correctionRecipe))) {
    notifyUser("四个角点没有形成有效区域", "请让四个角按左上、右上、右下、左下依次围住卡片。");
    return;
  }
  setCorrectionBusy(true);
  await new Promise((resolve) => window.requestAnimationFrame(resolve));

  try {
    const size = correctionOutputSize(
      elements.sourceImage.naturalWidth,
      elements.sourceImage.naturalHeight,
      correctionRecipe,
      MAX_WORKING_EDGE,
    );
    const canvas = elements.correctionResultCanvas;
    const renderer = renderCorrectionToCanvas(elements.sourceImage, correctionRecipe, canvas, size);
    if (renderer !== "webgl" && requiresProjectiveCorrection(
      elements.sourceImage.naturalWidth,
      elements.sourceImage.naturalHeight,
      correctionRecipe,
    )) {
      throw new Error("当前浏览器不支持透视校正");
    }
    const correctedBlob = await canvasToBlob(canvas, "image/jpeg", 0.94);
    await displayWorkingImage(correctedBlob);
    guides = { ...DEFAULT_GUIDES };
    renderGuides();
    updateResults();
    showView(elements.editorView);
    window.requestAnimationFrame(() => {
      updateImageCanvasSize();
      resetView();
      notifyUser("图片校正已应用", "参考线已重置，请重新对齐卡片边框。");
    });
  } catch (error) {
    notifyUser("无法应用图片校正", error?.message || "请还原透视滑杆后重试。");
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

elements.chooseImageButton.addEventListener("click", requestImage);
elements.changeImageButton.addEventListener("click", requestImage);
elements.processingChangeButton.addEventListener("click", requestImage);
elements.takePhotoButton.addEventListener("click", () => elements.cameraInput.click());
elements.pasteImageButton.addEventListener("click", pasteImageFromButton);
elements.fileInput.addEventListener("change", handleFileInput);
elements.cameraInput.addEventListener("change", handleFileInput);
elements.correctImageButton.addEventListener("click", openCorrection);
elements.resetGuidesButton.addEventListener("click", resetGuides);
elements.psaFrontButton.addEventListener("click", () => setPsaSide("front"));
elements.psaBackButton.addEventListener("click", () => setPsaSide("back"));
elements.zoomOutButton.addEventListener("click", () => zoomAtCenter(viewState.zoom - VIEW_ZOOM_STEP));
elements.zoomResetButton.addEventListener("click", resetView);
elements.zoomInButton.addEventListener("click", () => zoomAtCenter(viewState.zoom + VIEW_ZOOM_STEP));
elements.measurementFrame.addEventListener("pointerdown", beginImageGesture);
elements.measurementFrame.addEventListener("pointermove", moveImageGesture);
elements.measurementFrame.addEventListener("pointerup", endImageGesture);
elements.measurementFrame.addEventListener("pointercancel", endImageGesture);
elements.measurementFrame.addEventListener("wheel", handleImageWheel, { passive: false });
elements.measurementFrame.addEventListener("dblclick", handleImageDoubleClick);
elements.measurementFrame.addEventListener("keydown", handleImageKeydown);
elements.correctionResetButton.addEventListener("click", resetCorrection);
elements.correctionCancelButton.addEventListener("click", cancelCorrection);
elements.correctionCancelButtonBottom.addEventListener("click", cancelCorrection);
elements.correctionApplyButton.addEventListener("click", applyCorrection);
elements.correctionApplyButtonBottom.addEventListener("click", applyCorrection);
elements.correctionCompareButton.addEventListener("pointerdown", showCorrectedCorrectionPreview);
elements.correctionCompareButton.addEventListener("pointerup", showOriginalCorrectionPreview);
elements.correctionCompareButton.addEventListener("pointercancel", showOriginalCorrectionPreview);
elements.correctionCompareButton.addEventListener("lostpointercapture", showOriginalCorrectionPreview);
elements.aspectControl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-aspect]");
  if (!button) return;
  correctionRecipe = { ...correctionRecipe, aspect: button.dataset.aspect };
  scheduleCorrectionUi();
});
elements.straightenControl.addEventListener("input", (event) => {
  correctionRecipe = { ...correctionRecipe, straighten: Number(event.target.value) };
  scheduleCorrectionUi();
});
elements.verticalPerspectiveControl.addEventListener("input", (event) => {
  correctionRecipe = { ...correctionRecipe, verticalPerspective: Number(event.target.value) };
  scheduleCorrectionUi();
});
elements.horizontalPerspectiveControl.addEventListener("input", (event) => {
  correctionRecipe = { ...correctionRecipe, horizontalPerspective: Number(event.target.value) };
  scheduleCorrectionUi();
});

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
  if (correctionRenderFrame !== null) window.cancelAnimationFrame(correctionRenderFrame);
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
});
window.addEventListener("paste", handlePaste);

if ("ResizeObserver" in window) {
  const measurementResizeObserver = new ResizeObserver(updateImageCanvasSize);
  measurementResizeObserver.observe(elements.measurementFrame);
  const correctionResizeObserver = new ResizeObserver(() => {
    if (document.body.dataset.view !== "correction-view") return;
    drawCorrectionSource();
    renderCorrectionUi();
  });
  correctionResizeObserver.observe(elements.correctionFrame);
}

mountGuides();
mountCorrectionHandles();
renderGuides();
updateResults();
renderView();

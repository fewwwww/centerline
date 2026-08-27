import {
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  VIEW_ZOOM_STEP,
  clampViewState,
  panView,
  pinchView,
  pointerButtonsAreReleased,
  zoomViewAt,
} from "./viewport.js";

const INITIAL_VIEW_STATE = Object.freeze({
  zoom: MIN_VIEW_ZOOM,
  panX: 0,
  panY: 0,
});

function viewStatesEqual(first, second) {
  return first.zoom === second.zoom
    && first.panX === second.panX
    && first.panY === second.panY;
}

function pointerPairMetrics(pointers, frame) {
  const [first, second] = [...pointers.values()];
  if (!first || !second) return null;

  const rect = frame.getBoundingClientRect();
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

function releasePointerCapture(frame, pointerId) {
  if (pointerId === undefined || !frame.hasPointerCapture?.(pointerId)) return;
  try {
    frame.releasePointerCapture(pointerId);
  } catch {
    // The OS or browser can release capture first when a gesture is interrupted.
  }
}

function capturePointer(frame, pointerId) {
  try {
    frame.setPointerCapture?.(pointerId);
  } catch {
    // A detached frame cannot capture; global pointer fallbacks still end the gesture.
  }
}

export function createViewportController({
  frame,
  controls,
  getMetrics,
  requestRender,
  ignoreSelector = "",
  canInteract = () => true,
  onInteractionStart = () => {},
  resetLabel = "恢复图片",
}) {
  if (!frame || !controls || typeof getMetrics !== "function" || typeof requestRender !== "function") {
    throw new TypeError("Viewport controller requires a frame, controls, metrics, and renderer");
  }

  const {
    zoomOutButton,
    zoomResetButton,
    zoomInButton,
    zoomValue,
  } = controls;
  let state = { ...INITIAL_VIEW_STATE };
  const pointers = new Map();
  let panGesture = null;
  let pinchGesture = null;
  let renderedZoom = Number.NaN;

  function metrics() {
    const value = getMetrics() || {};
    return {
      width: value.width || 0,
      height: value.height || 0,
      contentWidth: value.contentWidth || 0,
      contentHeight: value.contentHeight || 0,
    };
  }

  function renderControls() {
    if (state.zoom === renderedZoom) return;
    renderedZoom = state.zoom;
    const percentage = `${Math.round(state.zoom * 100)}%`;
    zoomValue.textContent = percentage;
    zoomResetButton.setAttribute("aria-label", `${resetLabel}为 100%，当前 ${percentage}`);
    zoomOutButton.disabled = state.zoom <= MIN_VIEW_ZOOM;
    zoomInButton.disabled = state.zoom >= MAX_VIEW_ZOOM;
    frame.classList.toggle("is-zoomed", state.zoom > MIN_VIEW_ZOOM);
  }

  function commitState(nextState, { render = true } = {}) {
    if (viewStatesEqual(state, nextState)) return false;

    state = nextState;
    renderControls();
    if (render) requestRender();
    return true;
  }

  function setState(nextState, options) {
    const { width, height, contentWidth, contentHeight } = metrics();
    return commitState(clampViewState(
      nextState,
      width,
      height,
      contentWidth,
      contentHeight,
    ), options);
  }

  function reconcile(options) {
    return setState(state, options);
  }

  function getState() {
    return { ...state };
  }

  function cancel({ releaseCapture = true } = {}) {
    const pointerIds = [...pointers.keys()];
    pointers.clear();
    panGesture = null;
    pinchGesture = null;
    frame.classList.remove("is-panning");
    if (releaseCapture) {
      pointerIds.forEach((pointerId) => releasePointerCapture(frame, pointerId));
    }
  }

  function reset(options) {
    cancel();
    setState(INITIAL_VIEW_STATE, options);
  }

  function zoomAtPoint(requestedZoom, clientX, clientY) {
    const rect = frame.getBoundingClientRect();
    const { width, height, contentWidth, contentHeight } = metrics();
    commitState(zoomViewAt(
      state,
      requestedZoom,
      clientX - (rect.left + rect.width / 2),
      clientY - (rect.top + rect.height / 2),
      width,
      height,
      contentWidth,
      contentHeight,
    ));
  }

  function zoomAtCenter(requestedZoom) {
    const { width, height, contentWidth, contentHeight } = metrics();
    commitState(zoomViewAt(
      state,
      requestedZoom,
      0,
      0,
      width,
      height,
      contentWidth,
      contentHeight,
    ));
  }

  function startPinchGesture() {
    const pair = pointerPairMetrics(pointers, frame);
    if (!pair || !(pair.distance > 0)) return;
    pinchGesture = {
      state: getState(),
      distance: pair.distance,
      center: pair.center,
    };
    panGesture = null;
    frame.classList.add("is-panning");
  }

  function isIgnoredTarget(target) {
    return Boolean(ignoreSelector && target?.closest?.(ignoreSelector));
  }

  function beginPointer(event) {
    if (!canInteract(event) || isIgnoredTarget(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType === "mouse" && state.zoom <= MIN_VIEW_ZOOM) return;

    onInteractionStart(event);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capturePointer(frame, event.pointerId);

    if (pointers.size === 1) {
      panGesture = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        state: getState(),
      };
      if (state.zoom > MIN_VIEW_ZOOM) frame.classList.add("is-panning");
    } else if (pointers.size === 2) {
      startPinchGesture();
    }

    event.preventDefault();
  }

  function movePointer(event) {
    if (!pointers.has(event.pointerId)) return;
    if (pointerButtonsAreReleased(event)) {
      endPointer(event);
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const { width, height, contentWidth, contentHeight } = metrics();

    if (pointers.size >= 2 && pinchGesture) {
      const pair = pointerPairMetrics(pointers, frame);
      if (pair) {
        commitState(pinchView(
          pinchGesture.state,
          pinchGesture.distance,
          pinchGesture.center,
          pair.distance,
          pair.center,
          width,
          height,
          contentWidth,
          contentHeight,
        ));
      }
    } else if (panGesture?.pointerId === event.pointerId) {
      commitState(panView(
        panGesture.state,
        event.clientX - panGesture.x,
        event.clientY - panGesture.y,
        width,
        height,
        contentWidth,
        contentHeight,
      ));
    }

    event.preventDefault();
  }

  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (event.type !== "lostpointercapture") releasePointerCapture(frame, event.pointerId);

    if (pointers.size === 1) {
      const [pointerId, point] = pointers.entries().next().value;
      panGesture = { pointerId, x: point.x, y: point.y, state: getState() };
      pinchGesture = null;
    } else if (pointers.size === 0) {
      panGesture = null;
      pinchGesture = null;
      frame.classList.remove("is-panning");
    } else {
      startPinchGesture();
    }
  }

  function handleWheel(event) {
    if (!canInteract(event)) return;
    const pageScale = event.deltaMode === 2
      ? frame.clientHeight
      : event.deltaMode === 1 ? 16 : 1;
    zoomAtPoint(
      state.zoom * Math.exp(-event.deltaY * pageScale * 0.002),
      event.clientX,
      event.clientY,
    );
    event.preventDefault();
  }

  function handleDoubleClick(event) {
    if (!canInteract(event) || isIgnoredTarget(event.target)) return;
    zoomAtPoint(state.zoom < 2 ? 2 : MIN_VIEW_ZOOM, event.clientX, event.clientY);
    event.preventDefault();
  }

  function handleKeydown(event) {
    if (event.target !== frame || !canInteract(event)) return;

    if (event.key === "+" || event.key === "=") {
      zoomAtCenter(state.zoom + VIEW_ZOOM_STEP);
    } else if (event.key === "-") {
      zoomAtCenter(state.zoom - VIEW_ZOOM_STEP);
    } else if (event.key === "0") {
      reset();
    } else if (event.key.startsWith("Arrow") && state.zoom > MIN_VIEW_ZOOM) {
      const distance = event.shiftKey ? 48 : 16;
      const deltaX = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
      const deltaY = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
      const { width, height, contentWidth, contentHeight } = metrics();
      commitState(panView(
        state,
        deltaX,
        deltaY,
        width,
        height,
        contentWidth,
        contentHeight,
      ));
    } else {
      return;
    }

    event.preventDefault();
  }

  const handleZoomOut = () => {
    if (canInteract()) zoomAtCenter(state.zoom - VIEW_ZOOM_STEP);
  };
  const handleZoomReset = () => {
    if (canInteract()) reset();
  };
  const handleZoomIn = () => {
    if (canInteract()) zoomAtCenter(state.zoom + VIEW_ZOOM_STEP);
  };

  zoomOutButton.addEventListener("click", handleZoomOut);
  zoomResetButton.addEventListener("click", handleZoomReset);
  zoomInButton.addEventListener("click", handleZoomIn);
  frame.addEventListener("pointerdown", beginPointer);
  frame.addEventListener("pointermove", movePointer);
  frame.addEventListener("pointerup", endPointer);
  frame.addEventListener("pointercancel", endPointer);
  frame.addEventListener("lostpointercapture", endPointer);
  frame.addEventListener("wheel", handleWheel, { passive: false });
  frame.addEventListener("dblclick", handleDoubleClick);
  frame.addEventListener("keydown", handleKeydown);
  renderControls();

  function destroy() {
    cancel();
    zoomOutButton.removeEventListener("click", handleZoomOut);
    zoomResetButton.removeEventListener("click", handleZoomReset);
    zoomInButton.removeEventListener("click", handleZoomIn);
    frame.removeEventListener("pointerdown", beginPointer);
    frame.removeEventListener("pointermove", movePointer);
    frame.removeEventListener("pointerup", endPointer);
    frame.removeEventListener("pointercancel", endPointer);
    frame.removeEventListener("lostpointercapture", endPointer);
    frame.removeEventListener("wheel", handleWheel);
    frame.removeEventListener("dblclick", handleDoubleClick);
    frame.removeEventListener("keydown", handleKeydown);
  }

  return {
    cancel,
    destroy,
    endPointer,
    getState,
    reconcile,
    reset,
    setState,
    zoomAtCenter,
    zoomAtPoint,
  };
}

export const MIN_VIEW_ZOOM = 1;
export const MAX_VIEW_ZOOM = 6;
export const VIEW_ZOOM_STEP = 0.25;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function computeContainSize(viewportWidth, viewportHeight, imageWidth, imageHeight) {
  if (!(viewportWidth > 0) || !(viewportHeight > 0) || !(imageWidth > 0) || !(imageHeight > 0)) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
  };
}

function maximumPan(contentSize, viewportSize, zoom) {
  if (zoom <= MIN_VIEW_ZOOM) return 0;
  const scaledSize = Math.max(0, contentSize || 0) * zoom;
  const safeZone = Math.min(Math.max(32, viewportSize * 0.18), scaledSize / 2);
  return Math.max(0, scaledSize / 2 - safeZone);
}

export function clampViewState(
  state,
  viewportWidth,
  viewportHeight,
  contentWidth = viewportWidth,
  contentHeight = viewportHeight,
) {
  const zoom = clamp(state.zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const safeViewportWidth = Math.max(0, viewportWidth || 0);
  const safeViewportHeight = Math.max(0, viewportHeight || 0);
  const maxPanX = maximumPan(contentWidth, safeViewportWidth, zoom);
  const maxPanY = maximumPan(contentHeight, safeViewportHeight, zoom);
  const panX = clamp(state.panX || 0, -maxPanX, maxPanX);
  const panY = clamp(state.panY || 0, -maxPanY, maxPanY);

  return {
    zoom,
    panX: panX === 0 ? 0 : panX,
    panY: panY === 0 ? 0 : panY,
  };
}

export function panView(state, deltaX, deltaY, width, height, contentWidth, contentHeight) {
  return clampViewState({
    zoom: state.zoom,
    panX: state.panX + deltaX,
    panY: state.panY + deltaY,
  }, width, height, contentWidth, contentHeight);
}

export function zoomViewAt(
  state,
  requestedZoom,
  focalX,
  focalY,
  width,
  height,
  contentWidth,
  contentHeight,
) {
  const zoom = clamp(requestedZoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const ratio = zoom / state.zoom;

  return clampViewState({
    zoom,
    panX: focalX - ((focalX - state.panX) * ratio),
    panY: focalY - ((focalY - state.panY) * ratio),
  }, width, height, contentWidth, contentHeight);
}

export function pinchView(
  startState,
  startDistance,
  startCenter,
  currentDistance,
  currentCenter,
  width,
  height,
  contentWidth,
  contentHeight,
) {
  if (!(startDistance > 0) || !(currentDistance > 0)) {
    return clampViewState(startState, width, height, contentWidth, contentHeight);
  }

  const zoom = clamp(
    startState.zoom * (currentDistance / startDistance),
    MIN_VIEW_ZOOM,
    MAX_VIEW_ZOOM,
  );
  const ratio = zoom / startState.zoom;

  return clampViewState({
    zoom,
    panX: currentCenter.x - ((startCenter.x - startState.panX) * ratio),
    panY: currentCenter.y - ((startCenter.y - startState.panY) * ratio),
  }, width, height, contentWidth, contentHeight);
}

export function guideScreenWidth(zoom) {
  return Math.max(1, 2 / Math.sqrt(clamp(zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM)));
}

export const MIN_VIEW_ZOOM = 1;
export const MAX_VIEW_ZOOM = 6;
export const VIEW_ZOOM_STEP = 0.25;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampViewState(state, width, height) {
  const zoom = clamp(state.zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const safeWidth = Math.max(0, width || 0);
  const safeHeight = Math.max(0, height || 0);
  const maxPanX = (safeWidth * (zoom - 1)) / 2;
  const maxPanY = (safeHeight * (zoom - 1)) / 2;
  const panX = clamp(state.panX || 0, -maxPanX, maxPanX);
  const panY = clamp(state.panY || 0, -maxPanY, maxPanY);

  return {
    zoom,
    panX: panX === 0 ? 0 : panX,
    panY: panY === 0 ? 0 : panY,
  };
}

export function panView(state, deltaX, deltaY, width, height) {
  return clampViewState({
    zoom: state.zoom,
    panX: state.panX + deltaX,
    panY: state.panY + deltaY,
  }, width, height);
}

export function zoomViewAt(state, requestedZoom, focalX, focalY, width, height) {
  const zoom = clamp(requestedZoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const ratio = zoom / state.zoom;

  return clampViewState({
    zoom,
    panX: focalX - ((focalX - state.panX) * ratio),
    panY: focalY - ((focalY - state.panY) * ratio),
  }, width, height);
}

export function pinchView(
  startState,
  startDistance,
  startCenter,
  currentDistance,
  currentCenter,
  width,
  height,
) {
  if (!(startDistance > 0) || !(currentDistance > 0)) {
    return clampViewState(startState, width, height);
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
  }, width, height);
}

export function guideScreenWidth(zoom) {
  return Math.max(1, 2 / Math.sqrt(clamp(zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM)));
}

export const MIN_VIEW_ZOOM = 1;
export const MAX_VIEW_ZOOM = 6;
export const VIEW_ZOOM_STEP = 0.25;
export const GUIDE_EDGE_GUTTER = 18;
export const CORRECTION_LOUPE_SIZE = 116;
export const CORRECTION_LOUPE_MAGNIFICATION = 2.6;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pointerButtonsAreReleased(event) {
  return event?.buttons === 0;
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

export function computeMeasurementImageSize(
  viewportWidth,
  viewportHeight,
  imageWidth,
  imageHeight,
  gutter = GUIDE_EDGE_GUTTER,
) {
  const safeGutter = Math.max(0, Number(gutter) || 0);
  return computeContainSize(
    Math.max(0, viewportWidth - (safeGutter * 2)),
    Math.max(0, viewportHeight - (safeGutter * 2)),
    imageWidth,
    imageHeight,
  );
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

export function positionCorrectionLoupe(
  pointerX,
  pointerY,
  frameWidth,
  frameHeight,
  size = CORRECTION_LOUPE_SIZE,
) {
  const margin = 10;
  const fingerGap = 42;
  let left = pointerX - (size / 2);
  let top = pointerY - size - fingerGap;

  if (top < margin) top = pointerY + fingerGap;
  if (left < margin) left = pointerX + fingerGap;
  if (left + size > frameWidth - margin) left = pointerX - size - fingerGap;

  return {
    left: clamp(left, margin, Math.max(margin, frameWidth - size - margin)),
    top: clamp(top, margin, Math.max(margin, frameHeight - size - margin)),
  };
}

export function correctionLoupeSourceRect(
  point,
  sourceWidth,
  sourceHeight,
  previewWidth,
  previewHeight,
  size = CORRECTION_LOUPE_SIZE,
  magnification = CORRECTION_LOUPE_MAGNIFICATION,
) {
  const displayScale = Math.min(previewWidth / sourceWidth, previewHeight / sourceHeight);
  if (!(displayScale > 0) || !(magnification > 0)) return null;
  const sourceSpan = size / (displayScale * magnification);
  return {
    x: (point.x * sourceWidth) - (sourceSpan / 2),
    y: (point.y * sourceHeight) - (sourceSpan / 2),
    width: sourceSpan,
    height: sourceSpan,
  };
}

export function correctionLoupeGuideSegments(
  quad,
  cornerIndex,
  size = CORRECTION_LOUPE_SIZE,
  length = 36,
) {
  if (!Array.isArray(quad) || quad.length !== 4 || !Number.isInteger(cornerIndex)) return [];
  if (cornerIndex < 0 || cornerIndex >= quad.length || !(size > 0) || !(length > 0)) return [];

  const corner = quad[cornerIndex];
  if (!Number.isFinite(corner?.x) || !Number.isFinite(corner?.y)) return [];
  const center = { x: size / 2, y: size / 2 };
  const halfLength = length / 2;
  const neighborIndices = [(cornerIndex + 3) % 4, (cornerIndex + 1) % 4];

  return neighborIndices.flatMap((neighborIndex) => {
    const neighbor = quad[neighborIndex];
    const deltaX = neighbor?.x - corner.x;
    const deltaY = neighbor?.y - corner.y;
    const edgeLength = Math.hypot(deltaX, deltaY);
    if (!(edgeLength > 1e-8)) return [];
    const unitX = deltaX / edgeLength;
    const unitY = deltaY / edgeLength;
    return [{
      start: {
        x: center.x - (unitX * halfLength),
        y: center.y - (unitY * halfLength),
      },
      end: {
        x: center.x + (unitX * halfLength),
        y: center.y + (unitY * halfLength),
      },
    }];
  });
}

export const DEFAULT_GUIDES = Object.freeze({
  outerLeft: 0.04,
  innerLeft: 0.12,
  innerRight: 0.88,
  outerRight: 0.96,
  outerTop: 0.04,
  innerTop: 0.12,
  innerBottom: 0.88,
  outerBottom: 0.96,
});

export const GUIDE_AXIS = Object.freeze({
  outerLeft: "x",
  innerLeft: "x",
  innerRight: "x",
  outerRight: "x",
  outerTop: "y",
  innerTop: "y",
  innerBottom: "y",
  outerBottom: "y",
});

const EPSILON = 1e-7;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function constrainGuide(guides, key, requestedValue) {
  const value = clamp(requestedValue, 0, 1);

  switch (key) {
    case "outerLeft":
      return clamp(value, 0, guides.innerLeft);
    case "innerLeft":
      return clamp(value, guides.outerLeft, guides.innerRight);
    case "innerRight":
      return clamp(value, guides.innerLeft, guides.outerRight);
    case "outerRight":
      return clamp(value, guides.innerRight, 1);
    case "outerTop":
      return clamp(value, 0, guides.innerTop);
    case "innerTop":
      return clamp(value, guides.outerTop, guides.innerBottom);
    case "innerBottom":
      return clamp(value, guides.innerTop, guides.outerBottom);
    case "outerBottom":
      return clamp(value, guides.innerBottom, 1);
    default:
      throw new Error(`Unknown guide: ${key}`);
  }
}

export function moveGuide(guides, key, requestedValue) {
  if (!(key in GUIDE_AXIS)) {
    throw new Error(`Unknown guide: ${key}`);
  }

  return {
    ...guides,
    [key]: constrainGuide(guides, key, requestedValue),
  };
}

export function calculateAxis(firstGap, secondGap) {
  const safeFirstGap = Math.max(0, firstGap);
  const safeSecondGap = Math.max(0, secondGap);
  const total = safeFirstGap + safeSecondGap;

  if (total <= EPSILON) {
    return {
      valid: false,
      first: null,
      second: null,
      firstGap: safeFirstGap,
      secondGap: safeSecondGap,
    };
  }

  const first = Math.round((safeFirstGap / total) * 100);

  return {
    valid: true,
    first,
    second: 100 - first,
    firstGap: safeFirstGap,
    secondGap: safeSecondGap,
  };
}

export function calculateMeasurements(guides) {
  const leftGap = guides.innerLeft - guides.outerLeft;
  const rightGap = guides.outerRight - guides.innerRight;
  const topGap = guides.innerTop - guides.outerTop;
  const bottomGap = guides.outerBottom - guides.innerBottom;

  return {
    horizontal: calculateAxis(leftGap, rightGap),
    vertical: calculateAxis(topGap, bottomGap),
  };
}

export function formatRatio(axisResult) {
  if (!axisResult.valid) {
    return "— / —";
  }

  return `${axisResult.first} / ${axisResult.second}`;
}

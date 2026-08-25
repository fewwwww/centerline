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

const PSA_FRONT_THRESHOLDS = Object.freeze([
  { maximum: 55, label: "PSA 10", grade: 10 },
  { maximum: 60, label: "PSA 9", grade: 9 },
  { maximum: 65, label: "PSA 8", grade: 8 },
  { maximum: 70, label: "PSA 7", grade: 7 },
]);

const PSA_BACK_THRESHOLDS = Object.freeze([
  { maximum: 75, label: "PSA 10", grade: 10 },
  { maximum: 90, label: "PSA 9", grade: 9 },
]);

function axisWorst(axisResult) {
  return axisResult.valid ? Math.max(axisResult.first, axisResult.second) : null;
}

export function estimatePsaCentering(measurements, side = "front") {
  const horizontalWorst = axisWorst(measurements.horizontal);
  const verticalWorst = axisWorst(measurements.vertical);

  if (horizontalWorst === null || verticalWorst === null) {
    return {
      valid: false,
      label: "—",
      grade: null,
      determiningAxis: null,
      worst: null,
    };
  }

  const worst = Math.max(horizontalWorst, verticalWorst);
  const determiningAxis = horizontalWorst === verticalWorst
    ? "左右与上下"
    : horizontalWorst > verticalWorst ? "左右" : "上下";
  const thresholds = side === "back" ? PSA_BACK_THRESHOLDS : PSA_FRONT_THRESHOLDS;
  const match = thresholds.find(({ maximum }) => worst <= maximum);

  return {
    valid: true,
    label: match?.label || "PSA 6 或以下",
    grade: match?.grade ?? 6,
    determiningAxis,
    horizontalWorst,
    verticalWorst,
    worst,
    side: side === "back" ? "back" : "front",
  };
}

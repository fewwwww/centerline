import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GUIDES,
  calculateAxis,
  calculateMeasurements,
  constrainGuide,
  estimatePsaCentering,
  formatRatio,
  moveGuide,
} from "../src/measurement.js";

test("equal borders produce a 50 / 50 result", () => {
  const result = calculateAxis(3, 3);
  assert.equal(result.valid, true);
  assert.equal(formatRatio(result), "50 / 50");
});

test("a 3-to-2 border ratio preserves direction as 60 / 40", () => {
  assert.equal(formatRatio(calculateAxis(3, 2)), "60 / 40");
  assert.equal(formatRatio(calculateAxis(2, 3)), "40 / 60");
});

test("rounded values always add up to 100", () => {
  const result = calculateAxis(1, 2);
  assert.equal(result.first + result.second, 100);
  assert.equal(formatRatio(result), "33 / 67");
});

test("zero-width borders are invalid instead of showing fake percentages", () => {
  const result = calculateAxis(0, 0);
  assert.equal(result.valid, false);
  assert.equal(formatRatio(result), "— / —");
});

test("default guides create valid 50 / 50 results on both axes", () => {
  assert.deepEqual(
    {
      outerLeft: DEFAULT_GUIDES.outerLeft,
      outerRight: DEFAULT_GUIDES.outerRight,
      outerTop: DEFAULT_GUIDES.outerTop,
      outerBottom: DEFAULT_GUIDES.outerBottom,
    },
    { outerLeft: 0, outerRight: 1, outerTop: 0, outerBottom: 1 },
  );
  const results = calculateMeasurements(DEFAULT_GUIDES);
  assert.equal(formatRatio(results.horizontal), "50 / 50");
  assert.equal(formatRatio(results.vertical), "50 / 50");
});

test("moving a guide returns new state without mutating the source", () => {
  const source = { ...DEFAULT_GUIDES };
  const moved = moveGuide(source, "innerLeft", 0.2);
  assert.equal(source.innerLeft, DEFAULT_GUIDES.innerLeft);
  assert.equal(moved.innerLeft, 0.2);
  assert.notEqual(moved, source);
});

test("guides cannot cross adjacent guides or leave the image", () => {
  const guides = { ...DEFAULT_GUIDES };
  assert.equal(constrainGuide(guides, "outerLeft", -1), 0);
  assert.equal(constrainGuide(guides, "outerLeft", 0.5), guides.innerLeft);
  assert.equal(constrainGuide(guides, "innerLeft", 0.99), guides.innerRight);
  assert.equal(constrainGuide(guides, "innerRight", -1), guides.innerLeft);
  assert.equal(constrainGuide(guides, "outerRight", 2), 1);
  assert.equal(constrainGuide(guides, "outerTop", 0.5), guides.innerTop);
  assert.equal(constrainGuide(guides, "outerBottom", -1), guides.innerBottom);
});

test("normalizing the same geometry to another display size keeps its ratio", () => {
  const normalized = calculateAxis(0.12, 0.08);
  const renderedPixels = calculateAxis(0.12 * 390, 0.08 * 390);
  assert.equal(formatRatio(normalized), "60 / 40");
  assert.equal(formatRatio(renderedPixels), "60 / 40");
});

test("PSA front estimate uses the worse displayed axis and exact boundaries", () => {
  const cases = [
    [55, 10],
    [56, 9],
    [60, 9],
    [61, 8],
    [65, 8],
    [66, 7],
    [70, 7],
    [71, 6],
  ];

  cases.forEach(([worst, grade]) => {
    const result = estimatePsaCentering({
      horizontal: { valid: true, first: worst, second: 100 - worst },
      vertical: { valid: true, first: 50, second: 50 },
    });
    assert.equal(result.grade, grade);
    assert.equal(result.determiningAxis, "左右");
  });
});

test("PSA estimate treats direction equally and supports documented back thresholds", () => {
  const front = estimatePsaCentering({
    horizontal: { valid: true, first: 35, second: 65 },
    vertical: { valid: true, first: 65, second: 35 },
  });
  assert.equal(front.label, "PSA 8");
  assert.equal(front.determiningAxis, "左右与上下");

  const back = estimatePsaCentering({
    horizontal: { valid: true, first: 76, second: 24 },
    vertical: { valid: true, first: 50, second: 50 },
  }, "back");
  assert.equal(back.label, "PSA 9");
});

test("PSA estimate never keeps a grade when either axis is invalid", () => {
  const result = estimatePsaCentering({
    horizontal: { valid: false, first: null, second: null },
    vertical: { valid: true, first: 50, second: 50 },
  });
  assert.equal(result.valid, false);
  assert.equal(result.label, "—");
});

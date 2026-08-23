import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GUIDES,
  calculateAxis,
  calculateMeasurements,
  constrainGuide,
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

import assert from "node:assert/strict";
import test from "node:test";

import {
  assessCaptureGeometry,
  correctionOutputSize,
  correctionSampleQuad,
  createCorrectionRecipe,
  effectiveQuad,
  isConvexQuad,
  projectPoint,
  requiresProjectiveCorrection,
  solveUnitSquareToQuad,
} from "../src/perspective.js";

test("default correction recipe is a valid near-rectangular crop", () => {
  const recipe = createCorrectionRecipe();
  assert.equal(isConvexQuad(recipe.quad), true);
  assert.equal(assessCaptureGeometry(recipe).level, "direct");
});

test("homography maps all four unit-square corners to the requested quad", () => {
  const quad = [
    { x: 0.1, y: 0.2 },
    { x: 0.9, y: 0.1 },
    { x: 0.8, y: 0.95 },
    { x: 0.2, y: 0.8 },
  ];
  const matrix = solveUnitSquareToQuad(quad);
  const actual = [
    projectPoint(matrix, 0, 0),
    projectPoint(matrix, 1, 0),
    projectPoint(matrix, 1, 1),
    projectPoint(matrix, 0, 1),
  ];
  actual.forEach((point, index) => {
    assert.ok(Math.abs(point.x - quad[index].x) < 1e-9);
    assert.ok(Math.abs(point.y - quad[index].y) < 1e-9);
  });
});

test("crossed and tiny quadrilaterals are rejected before rendering", () => {
  const crossed = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.9 },
  ];
  assert.equal(isConvexQuad(crossed), false);
  assert.equal(solveUnitSquareToQuad(crossed), null);
});

test("perspective controls alter the sampled quadrilateral deterministically", () => {
  const recipe = createCorrectionRecipe();
  recipe.verticalPerspective = 50;
  recipe.horizontalPerspective = -25;
  recipe.straighten = 3;
  assert.notDeepEqual(effectiveQuad(recipe), recipe.quad);
  assert.equal(assessCaptureGeometry(recipe).level, "reshoot");
});

test("5:7 output respects its ratio and longest-edge limit", () => {
  const recipe = createCorrectionRecipe();
  recipe.aspect = "5:7";
  const size = correctionOutputSize(4000, 3000, recipe, 1000);
  assert.equal(size.height, 1000);
  assert.ok(Math.abs((size.width / size.height) - (5 / 7)) < 0.002);
});

test("fixed aspect ratios crop the rectified image instead of stretching it", () => {
  const recipe = createCorrectionRecipe();
  recipe.aspect = "5:7";
  const quad = correctionSampleQuad(4000, 3000, recipe);

  assert.ok(quad[0].x > recipe.quad[0].x, "wide source is cropped at the left edge");
  assert.ok(quad[1].x < recipe.quad[1].x, "wide source is cropped at the right edge");
  assert.equal(quad[0].y, recipe.quad[0].y);
  assert.equal(quad[2].y, recipe.quad[2].y);
});

test("crop-only fallback is allowed only for axis-aligned source regions", () => {
  const recipe = createCorrectionRecipe();
  assert.equal(requiresProjectiveCorrection(1000, 1500, recipe), false);

  recipe.quad[0].x += 0.05;
  assert.equal(requiresProjectiveCorrection(1000, 1500, recipe), true);
});

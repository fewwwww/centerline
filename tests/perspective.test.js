import assert from "node:assert/strict";
import test from "node:test";

import {
  assessCaptureGeometry,
  correctionOutputSize,
  createCorrectionRecipe,
  isConvexQuad,
  projectPoint,
  renderCorrectionToCanvas,
  requiresProjectiveCorrection,
  solveUnitSquareToQuad,
} from "../src/perspective.js";

test("default correction recipe is a valid near-rectangular crop", () => {
  const recipe = createCorrectionRecipe();
  assert.deepEqual(Object.keys(recipe), ["quad"]);
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

test("capture advice is derived only from the four dragged corners", () => {
  const recipe = createCorrectionRecipe();
  recipe.quad = [
    { x: 0.2, y: 0.05 },
    { x: 0.95, y: 0.2 },
    { x: 0.8, y: 0.95 },
    { x: 0.05, y: 0.8 },
  ];
  assert.equal(assessCaptureGeometry(recipe).level, "reshoot");
});

test("output follows the dragged quadrilateral and longest-edge limit", () => {
  const recipe = createCorrectionRecipe();
  const size = correctionOutputSize(4000, 3000, recipe, 1000);
  assert.deepEqual(size, { width: 1000, height: 750 });
});

test("output keeps the proportions selected by the four corners", () => {
  const recipe = createCorrectionRecipe();
  recipe.quad = [
    { x: 0.25, y: 0.1 },
    { x: 0.75, y: 0.1 },
    { x: 0.75, y: 0.9 },
    { x: 0.25, y: 0.9 },
  ];
  assert.deepEqual(correctionOutputSize(4000, 3000, recipe), { width: 2000, height: 2400 });
});

test("crop-only fallback is allowed only for axis-aligned source regions", () => {
  const recipe = createCorrectionRecipe();
  assert.equal(requiresProjectiveCorrection(recipe), false);

  recipe.quad[0].x += 0.05;
  assert.equal(requiresProjectiveCorrection(recipe), true);
});

test("WebGL renderer reuses its program, uniform locations, and source texture", () => {
  const uniformLookups = [];
  let textureUploads = 0;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TEXTURE_2D: 8,
    UNPACK_FLIP_Y_WEBGL: 9,
    TEXTURE_WRAP_S: 10,
    TEXTURE_WRAP_T: 11,
    CLAMP_TO_EDGE: 12,
    TEXTURE_MIN_FILTER: 13,
    TEXTURE_MAG_FILTER: 14,
    LINEAR: 15,
    RGBA: 16,
    UNSIGNED_BYTE: 17,
    COLOR_BUFFER_BIT: 18,
    TRIANGLE_STRIP: 19,
    createShader: () => ({}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader() {},
    createProgram: () => ({}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    createBuffer: () => ({}),
    bindBuffer() {},
    bufferData() {},
    useProgram() {},
    getAttribLocation: (_program, name) => name === "a_position" ? 0 : 1,
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    createTexture: () => ({}),
    bindTexture() {},
    pixelStorei() {},
    texParameteri() {},
    getUniformLocation: (_program, name) => {
      uniformLookups.push(name);
      return { name };
    },
    uniform1i() {},
    texImage2D() {
      textureUploads += 1;
    },
    uniformMatrix3fv() {},
    viewport() {},
    clearColor() {},
    clear() {},
    drawArrays() {},
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: (type) => type === "webgl" ? gl : null,
  };
  const source = {
    currentSrc: "blob:card-image",
    naturalWidth: 1_000,
    naturalHeight: 1_500,
  };
  const recipe = createCorrectionRecipe();
  const size = { width: 800, height: 1_200 };

  assert.equal(renderCorrectionToCanvas(source, recipe, canvas, size), "webgl");
  assert.equal(renderCorrectionToCanvas(source, recipe, canvas, size), "webgl");

  assert.deepEqual(uniformLookups, ["u_image", "u_map"]);
  assert.equal(textureUploads, 1);
});

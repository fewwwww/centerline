import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_VIEW_ZOOM,
  clampViewState,
  guideScreenWidth,
  panView,
  pinchView,
  zoomViewAt,
} from "../src/viewport.js";

test("viewport starts fitted and cannot pan until it is zoomed", () => {
  assert.deepEqual(
    clampViewState({ zoom: 1, panX: 80, panY: -40 }, 400, 600),
    { zoom: 1, panX: 0, panY: 0 },
  );
});

test("panning a zoomed image stays inside the fitted image bounds", () => {
  assert.deepEqual(
    panView({ zoom: 2, panX: 0, panY: 0 }, 999, -999, 400, 600),
    { zoom: 2, panX: 200, panY: -300 },
  );
});

test("zooming around a point keeps that image point under the pointer", () => {
  assert.deepEqual(
    zoomViewAt({ zoom: 1, panX: 0, panY: 0 }, 2, 100, -50, 800, 600),
    { zoom: 2, panX: -100, panY: 50 },
  );
});

test("pinch combines scale and moving midpoint without exceeding maximum zoom", () => {
  const state = pinchView(
    { zoom: 2, panX: 20, panY: -10 },
    100,
    { x: 40, y: 20 },
    400,
    { x: 60, y: 30 },
    500,
    500,
  );

  assert.equal(state.zoom, MAX_VIEW_ZOOM);
  assert.deepEqual({ panX: state.panX, panY: state.panY }, { panX: 0, panY: -60 });
});

test("guide stroke becomes thinner on screen as zoom increases", () => {
  assert.equal(guideScreenWidth(1), 2);
  assert.equal(guideScreenWidth(4), 1);
  assert.equal(guideScreenWidth(6), 1);
});

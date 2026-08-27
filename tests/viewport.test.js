import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_VIEW_ZOOM,
  CORRECTION_LOUPE_SIZE,
  clampViewState,
  computeContainSize,
  computeMeasurementImageSize,
  correctionLoupeGuideSegments,
  correctionLoupeSourceRect,
  guideLoupePoint,
  guideLoupeSegment,
  guideScreenWidth,
  pointerButtonsAreReleased,
  panView,
  pinchView,
  positionCorrectionLoupe,
  zoomViewAt,
} from "../src/viewport.js";

test("pointer movement self-heals only after every button is released", () => {
  assert.equal(pointerButtonsAreReleased({ buttons: 0 }), true);
  assert.equal(pointerButtonsAreReleased({ buttons: 1 }), false);
  assert.equal(pointerButtonsAreReleased({ buttons: 2 }), false);
  assert.equal(pointerButtonsAreReleased({}), false);
  assert.equal(pointerButtonsAreReleased(null), false);
});

test("viewport starts fitted and cannot pan until it is zoomed", () => {
  assert.deepEqual(
    clampViewState({ zoom: 1, panX: 80, panY: -40 }, 400, 600),
    { zoom: 1, panX: 0, panY: 0 },
  );
});

test("panning a zoomed image stays inside the fitted image bounds", () => {
  const state = panView({ zoom: 2, panX: 0, panY: 0 }, 999, -999, 400, 600, 300, 600);
  assert.deepEqual(state, { zoom: 2, panX: 228, panY: -492 });
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

test("contain sizing gives a portrait image the full viewport height", () => {
  assert.deepEqual(computeContainSize(390, 600, 1000, 1500), { width: 390, height: 585 });
  assert.deepEqual(computeContainSize(0, 600, 1000, 1500), { width: 0, height: 0 });
});

test("measurement sizing keeps outer guide handles inside the clipped viewport", () => {
  const heightLimited = computeMeasurementImageSize(749, 330, 1693, 1000);
  assert.ok(((749 - heightLimited.width) / 2) >= 18);
  assert.ok(((330 - heightLimited.height) / 2) >= 18);

  const widthLimited = computeMeasurementImageSize(390, 600, 1600, 900);
  assert.ok(((390 - widthLimited.width) / 2) >= 18);
  assert.ok(((600 - widthLimited.height) / 2) >= 18);
});

test("zoomed portrait content can move its edge into the central safe area", () => {
  const state = clampViewState(
    { zoom: 3, panX: 999, panY: 999 },
    390,
    600,
    300,
    600,
  );
  assert.ok(state.panX > 300, "horizontal pan is based on content, not the old small frame");
  assert.ok(state.panY > 700, "vertical pan keeps only a safe-zone strip visible");
});

test("correction loupe stays away from the finger and switches sides near edges", () => {
  assert.deepEqual(positionCorrectionLoupe(195, 300, 390, 600), { left: 137, top: 142 });
  assert.deepEqual(positionCorrectionLoupe(20, 300, 390, 600), { left: 62, top: 142 });
  assert.deepEqual(positionCorrectionLoupe(370, 300, 390, 600), { left: 212, top: 142 });
  assert.deepEqual(positionCorrectionLoupe(195, 30, 390, 600), { left: 137, top: 72 });
  assert.equal(CORRECTION_LOUPE_SIZE, 116);
});

test("correction loupe samples a magnified square centered on the dragged point", () => {
  const rect = correctionLoupeSourceRect(
    { x: 0.25, y: 0.75 },
    1000,
    1500,
    300,
    450,
  );
  assert.ok(Math.abs(rect.width - 148.7179) < 0.001);
  assert.equal(rect.width, rect.height);
  assert.ok(Math.abs((rect.x + (rect.width / 2)) - 250) < 1e-9);
  assert.ok(Math.abs((rect.y + (rect.height / 2)) - 1125) < 1e-9);
  const zoomedRect = correctionLoupeSourceRect(
    { x: 0.25, y: 0.75 },
    1000,
    1500,
    600,
    900,
  );
  assert.ok(Math.abs(zoomedRect.width - (rect.width / 2)) < 1e-9);
  assert.equal(correctionLoupeSourceRect({ x: 0.5, y: 0.5 }, 1000, 1500, 0, 450), null);
});

test("guide loupe samples the circular handle and keeps its guide centered", () => {
  assert.deepEqual(guideLoupePoint("x", 0.28, 0.42), { x: 0.28, y: 0.42 });
  assert.deepEqual(guideLoupePoint("y", 0.73, 0.58), { x: 0.58, y: 0.73 });
  assert.deepEqual(guideLoupePoint("x", -1, 2), { x: 0, y: 1 });
  assert.equal(guideLoupePoint("z", 0.5, 0.5), null);

  assert.deepEqual(guideLoupeSegment("x", 100), {
    start: { x: 50, y: 0 },
    end: { x: 50, y: 100 },
  });
  assert.deepEqual(guideLoupeSegment("y", 100), {
    start: { x: 0, y: 50 },
    end: { x: 100, y: 50 },
  });
  assert.equal(guideLoupeSegment("z", 100), null);
});

test("correction loupe guides follow both dashed edges beside every dragged corner", () => {
  const quad = [
    { x: 20, y: 15 },
    { x: 100, y: 28 },
    { x: 88, y: 108 },
    { x: 12, y: 92 },
  ];

  quad.forEach((corner, cornerIndex) => {
    const segments = correctionLoupeGuideSegments(quad, cornerIndex);
    const neighborIndices = [(cornerIndex + 3) % 4, (cornerIndex + 1) % 4];

    assert.equal(segments.length, 2);
    segments.forEach((segment, segmentIndex) => {
      const segmentVector = {
        x: segment.end.x - segment.start.x,
        y: segment.end.y - segment.start.y,
      };
      const edgeVector = {
        x: quad[neighborIndices[segmentIndex]].x - corner.x,
        y: quad[neighborIndices[segmentIndex]].y - corner.y,
      };
      const crossProduct = (segmentVector.x * edgeVector.y) - (segmentVector.y * edgeVector.x);
      assert.ok(Math.abs(crossProduct) < 1e-8, `corner ${cornerIndex} guide must stay parallel`);
      assert.deepEqual(
        {
          x: (segment.start.x + segment.end.x) / 2,
          y: (segment.start.y + segment.end.y) / 2,
        },
        { x: CORRECTION_LOUPE_SIZE / 2, y: CORRECTION_LOUPE_SIZE / 2 },
      );
    });
  });
});

test("correction loupe guide geometry rejects invalid or collapsed edges", () => {
  assert.deepEqual(correctionLoupeGuideSegments([], 0), []);
  assert.equal(correctionLoupeGuideSegments([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ], 0).length, 1);
});

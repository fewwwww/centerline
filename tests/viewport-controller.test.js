import assert from "node:assert/strict";
import test from "node:test";

import { createViewportController } from "../src/viewport-controller.js";

class FakeClassList {
  names = new Set();

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  toggle(name, force) {
    if (force === undefined) force = !this.names.has(name);
    if (force) this.names.add(name);
    else this.names.delete(name);
    return force;
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeTarget {
  constructor(rect = { left: 0, top: 0, width: 400, height: 600 }) {
    this.rect = rect;
    this.clientHeight = rect.height;
    this.listeners = new Map();
    this.attributes = new Map();
    this.capturedPointers = new Set();
    this.classList = new FakeClassList();
    this.disabled = false;
    this.textContent = "";
    this.attributeWrites = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    const dispatched = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...event,
    };
    [...(this.listeners.get(type) || [])].forEach((listener) => listener(dispatched));
    return dispatched;
  }

  closest() {
    return null;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  setAttribute(name, value) {
    this.attributeWrites += 1;
    this.attributes.set(name, value);
  }

  setPointerCapture(pointerId) {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.capturedPointers.delete(pointerId);
  }
}

function createHarness(overrides = {}) {
  const frame = new FakeTarget();
  const controls = {
    zoomOutButton: new FakeTarget(),
    zoomResetButton: new FakeTarget(),
    zoomInButton: new FakeTarget(),
    zoomValue: new FakeTarget(),
  };
  let renderCount = 0;
  const controller = createViewportController({
    frame,
    controls,
    getMetrics: () => ({
      width: 400,
      height: 600,
      contentWidth: 300,
      contentHeight: 600,
    }),
    requestRender: () => {
      renderCount += 1;
    },
    ...overrides,
  });
  return {
    controller,
    controls,
    frame,
    renderCount: () => renderCount,
  };
}

test("shared zoom controls update state once and skip no-op renders", () => {
  const harness = createHarness();
  const { controller, controls, frame } = harness;

  assert.equal(controls.zoomValue.textContent, "100%");
  assert.equal(controls.zoomOutButton.disabled, true);

  controls.zoomInButton.dispatch("click");
  assert.deepEqual(controller.getState(), { zoom: 1.25, panX: 0, panY: 0 });
  assert.equal(controls.zoomValue.textContent, "125%");
  assert.equal(frame.classList.contains("is-zoomed"), true);
  assert.equal(harness.renderCount(), 1);

  assert.equal(controller.setState(controller.getState()), false);
  assert.equal(harness.renderCount(), 1, "unchanged state must not schedule another frame");

  controls.zoomResetButton.dispatch("click");
  assert.deepEqual(controller.getState(), { zoom: 1, panX: 0, panY: 0 });
  assert.equal(frame.classList.contains("is-zoomed"), false);
  assert.equal(harness.renderCount(), 2);
});

test("shared pointer lifecycle pans and clears capture outside the original hit area", () => {
  const { controller, controls, frame } = createHarness();
  controller.zoomAtCenter(2);
  const zoomLabelWrites = controls.zoomResetButton.attributeWrites;

  frame.dispatch("pointerdown", {
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: 200,
    clientY: 300,
  });
  assert.equal(frame.capturedPointers.has(7), true);
  assert.equal(frame.classList.contains("is-panning"), true);

  frame.dispatch("pointermove", {
    pointerId: 7,
    pointerType: "mouse",
    buttons: 1,
    clientX: 240,
    clientY: 270,
  });
  assert.deepEqual(controller.getState(), { zoom: 2, panX: 40, panY: -30 });
  assert.equal(
    controls.zoomResetButton.attributeWrites,
    zoomLabelWrites,
    "panning must not rewrite controls whose zoom value did not change",
  );

  controller.endPointer({ pointerId: 7, type: "pointerup" });
  assert.equal(frame.capturedPointers.has(7), false);
  assert.equal(frame.classList.contains("is-panning"), false);
});

test("pointer movement self-heals when mouseup is missed", () => {
  const { controller, frame } = createHarness();
  controller.zoomAtCenter(2);
  frame.dispatch("pointerdown", {
    pointerId: 9,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: 200,
    clientY: 300,
  });

  frame.dispatch("pointermove", {
    pointerId: 9,
    pointerType: "mouse",
    buttons: 0,
    clientX: 260,
    clientY: 300,
  });

  assert.equal(frame.capturedPointers.has(9), false);
  assert.equal(frame.classList.contains("is-panning"), false);
  assert.deepEqual(controller.getState(), { zoom: 2, panX: 0, panY: 0 });
});

test("two touch pointers share the same pinch and pan state machine", () => {
  const { controller, frame } = createHarness();
  frame.dispatch("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    buttons: 1,
    clientX: 100,
    clientY: 300,
  });
  frame.dispatch("pointerdown", {
    pointerId: 2,
    pointerType: "touch",
    button: 0,
    buttons: 1,
    clientX: 300,
    clientY: 300,
  });
  frame.dispatch("pointermove", {
    pointerId: 2,
    pointerType: "touch",
    buttons: 1,
    clientX: 400,
    clientY: 300,
  });

  assert.deepEqual(controller.getState(), { zoom: 1.5, panX: 50, panY: 0 });
  assert.equal(frame.classList.contains("is-panning"), true);
  controller.cancel();
  assert.equal(frame.capturedPointers.size, 0);
  assert.equal(frame.classList.contains("is-panning"), false);
});

test("wheel, double-click, and keyboard input use the same zoom contract", () => {
  const { controller, frame } = createHarness();
  const wheel = frame.dispatch("wheel", {
    deltaMode: 0,
    deltaY: -100,
    clientX: 200,
    clientY: 300,
  });
  assert.ok(controller.getState().zoom > 1);
  assert.equal(wheel.defaultPrevented, true);

  frame.dispatch("dblclick", { clientX: 200, clientY: 300 });
  assert.equal(controller.getState().zoom, 2);
  frame.dispatch("keydown", { target: frame, key: "ArrowRight", shiftKey: false });
  assert.equal(controller.getState().panX, 16);
  frame.dispatch("keydown", { target: frame, key: "0", shiftKey: false });
  assert.deepEqual(controller.getState(), { zoom: 1, panX: 0, panY: 0 });
});

test("ignored handles and disabled preview state do not start viewport gestures", () => {
  let interactive = true;
  const { controller, controls, frame } = createHarness({
    ignoreSelector: ".guide",
    canInteract: () => interactive,
  });
  controller.zoomAtCenter(2);
  const guide = { closest: (selector) => selector === ".guide" ? guide : null };

  frame.dispatch("pointerdown", {
    target: guide,
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    buttons: 1,
    clientX: 100,
    clientY: 100,
  });
  assert.equal(frame.capturedPointers.size, 0);

  interactive = false;
  controls.zoomInButton.dispatch("click");
  frame.dispatch("wheel", { deltaMode: 0, deltaY: -100, clientX: 200, clientY: 300 });
  assert.equal(controller.getState().zoom, 2);
});

test("destroy removes listeners and releases active pointers", () => {
  const { controller, controls, frame } = createHarness();
  controller.zoomAtCenter(2);
  frame.dispatch("pointerdown", {
    pointerId: 3,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: 200,
    clientY: 300,
  });

  controller.destroy();
  assert.equal(frame.capturedPointers.size, 0);
  assert.equal(frame.classList.contains("is-panning"), false);
  assert.equal(frame.listeners.get("pointerdown").size, 0);
  assert.equal(controls.zoomInButton.listeners.get("click").size, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  createFrameScheduler,
  createKeyedFrameScheduler,
} from "../src/frame-scheduler.js";

function createFakeFrameHost() {
  let nextId = 1;
  const frames = new Map();
  return {
    requestAnimationFrame(callback) {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    runNextFrame() {
      const [id, callback] = frames.entries().next().value || [];
      if (!callback) return false;
      frames.delete(id);
      callback(16.7);
      return true;
    },
    get pendingCount() {
      return frames.size;
    },
  };
}

test("frame scheduler fails fast when its timing contract is unavailable", () => {
  assert.throws(() => createFrameScheduler(), /frame callback is required/);
  assert.throws(
    () => createFrameScheduler(() => {}, {}),
    /requestAnimationFrame and cancelAnimationFrame are required/,
  );
});

test("frame scheduler collapses a burst into one callback with the latest values", () => {
  const frameHost = createFakeFrameHost();
  const calls = [];
  const schedule = createFrameScheduler((...args) => calls.push(args), frameHost);

  for (let index = 0; index < 1_000; index += 1) schedule(index, `value-${index}`);

  assert.equal(frameHost.pendingCount, 1);
  assert.equal(schedule.isPending(), true);
  assert.equal(frameHost.runNextFrame(), true);
  assert.deepEqual(calls, [[999, "value-999"]]);
  assert.equal(schedule.isPending(), false);
});

test("frame scheduler can flush the final interaction state synchronously", () => {
  const frameHost = createFakeFrameHost();
  const calls = [];
  const schedule = createFrameScheduler((value) => calls.push(value), frameHost);

  schedule("final");
  assert.equal(schedule.flush(), true);
  assert.deepEqual(calls, ["final"]);
  assert.equal(frameHost.pendingCount, 0);
  assert.equal(schedule.flush(), false);
});

test("frame scheduler cancellation drops queued work", () => {
  const frameHost = createFakeFrameHost();
  const calls = [];
  const schedule = createFrameScheduler((value) => calls.push(value), frameHost);

  schedule("stale");
  schedule.cancel();

  assert.equal(frameHost.pendingCount, 0);
  assert.equal(frameHost.runNextFrame(), false);
  assert.deepEqual(calls, []);
});

test("keyed frame scheduler preserves every changed key and the latest detail", () => {
  const frameHost = createFakeFrameHost();
  const calls = [];
  const schedule = createKeyedFrameScheduler(
    (keys, detail) => calls.push({ keys, detail }),
    frameHost,
  );

  schedule("outerLeft", { pointer: 1 });
  schedule("innerRight", { pointer: 2 });
  schedule("outerLeft", { pointer: 3 });

  assert.equal(frameHost.pendingCount, 1);
  assert.equal(schedule.flush(), true);
  assert.deepEqual(calls, [{
    keys: ["outerLeft", "innerRight"],
    detail: { pointer: 3 },
  }]);
  assert.equal(schedule.isPending(), false);
});

test("keyed frame scheduler cancellation clears accumulated keys", () => {
  const frameHost = createFakeFrameHost();
  const calls = [];
  const schedule = createKeyedFrameScheduler((keys) => calls.push(keys), frameHost);

  schedule("outerTop");
  schedule("innerBottom");
  schedule.cancel();

  assert.equal(frameHost.pendingCount, 0);
  assert.equal(frameHost.runNextFrame(), false);
  assert.deepEqual(calls, []);
});

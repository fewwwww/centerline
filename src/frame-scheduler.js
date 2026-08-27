export function createFrameScheduler(callback, frameHost = globalThis) {
  if (typeof callback !== "function") {
    throw new TypeError("A frame callback is required");
  }

  const requestFrame = frameHost?.requestAnimationFrame?.bind(frameHost);
  const cancelFrame = frameHost?.cancelAnimationFrame?.bind(frameHost);
  if (!requestFrame || !cancelFrame) {
    throw new TypeError("requestAnimationFrame and cancelAnimationFrame are required");
  }

  let frameId = null;
  let latestArgs = [];

  function run() {
    frameId = null;
    const args = latestArgs;
    latestArgs = [];
    callback(...args);
  }

  function schedule(...args) {
    latestArgs = args;
    if (frameId === null) frameId = requestFrame(run);
  }

  schedule.cancel = () => {
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    latestArgs = [];
  };

  schedule.flush = () => {
    if (frameId === null) return false;
    cancelFrame(frameId);
    run();
    return true;
  };

  schedule.isPending = () => frameId !== null;
  return schedule;
}

export function createKeyedFrameScheduler(callback, frameHost = globalThis) {
  if (typeof callback !== "function") {
    throw new TypeError("A keyed frame callback is required");
  }

  const pendingKeys = new Set();
  let latestArgs = [];
  const scheduleFrame = createFrameScheduler(() => {
    const keys = [...pendingKeys];
    const args = latestArgs;
    pendingKeys.clear();
    latestArgs = [];
    callback(keys, ...args);
  }, frameHost);

  function schedule(key, ...args) {
    pendingKeys.add(key);
    latestArgs = args;
    scheduleFrame();
  }

  schedule.cancel = () => {
    scheduleFrame.cancel();
    pendingKeys.clear();
    latestArgs = [];
  };
  schedule.flush = scheduleFrame.flush;
  schedule.isPending = scheduleFrame.isPending;
  return schedule;
}

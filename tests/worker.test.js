import assert from "node:assert/strict";
import test from "node:test";

import worker from "../dist/server/index.js";

test("deployment worker serves the app with absolute social metadata", async () => {
  const response = await worker.fetch(new Request("https://centerline.example/"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.match(html, /https:\/\/centerline\.example\/assets\/og-card-centering\.png/);
  assert.match(html, /图片不离开本机/);
});

test("deployment worker serves modules and rejects unknown routes", async () => {
  const moduleResponse = await worker.fetch(new Request("https://centerline.example/src/measurement.js"));
  const missingResponse = await worker.fetch(new Request("https://centerline.example/not-found"));

  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get("content-type"), /^text\/javascript/);
  assert.equal(missingResponse.status, 404);
});

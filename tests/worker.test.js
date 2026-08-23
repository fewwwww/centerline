import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("viewport and guide style contracts stay explicit", async () => {
  const [styles, html] = await Promise.all([
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);

  assert.match(styles, /height:\s*100dvh/);
  assert.match(styles, /height:\s*-webkit-fill-available/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /border-left:\s*2px dashed var\(--guide-color\)/);
  assert.match(styles, /border-top:\s*2px dashed var\(--guide-color\)/);
  assert.doesNotMatch(html, /实线/);
});

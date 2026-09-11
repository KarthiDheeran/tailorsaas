import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestActivity, createTrackedFetch, isVisibleRequest } from "../lib/request-activity.js";

const origin = "http://localhost:3100";
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

test("overlapping requests settle independently and cleanup is idempotent", () => {
  const activity = createRequestActivity();
  const counts: number[] = [];
  const unsubscribe = activity.subscribe(() => counts.push(activity.getSnapshot()));
  const first = activity.begin();
  const second = activity.begin();
  first(); first();
  assert.equal(activity.getSnapshot(), 1);
  second();
  assert.deepEqual(counts, [1, 2, 1, 0]);
  unsubscribe();
  activity.begin()();
  assert.equal(counts.length, 4);
});

test("tracks actions, API, navigation, and Supabase but excludes prefetch/assets", () => {
  assert.ok(isVisibleRequest("/orders", { headers: { "Next-Action": "test" } }, origin));
  assert.ok(isVisibleRequest("/orders?_rsc=test", { headers: { RSC: "1" } }, origin));
  assert.ok(isVisibleRequest(new Request(origin + "/api/test"), undefined, origin));
  assert.ok(isVisibleRequest("https://db.example/rest/v1/orders", undefined, origin, "https://db.example"));
  assert.equal(isVisibleRequest("/orders", { headers: { RSC: "1", "Next-Router-Prefetch": "1" } }, origin), false);
  assert.equal(isVisibleRequest("/_next/static/app.js", undefined, origin), false);
  assert.equal(isVisibleRequest("https://unrelated.example/api/test", undefined, origin), false);
});

test("streaming responses remain busy after headers and keep the original body intact", async () => {
  const activity = createRequestActivity();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const tracked = createTrackedFetch(async () => new Response(body), activity, () => true);
  const response = await tracked(origin);
  assert.equal(activity.getSnapshot(), 1);
  controller.enqueue(new TextEncoder().encode("hello"));
  await flush();
  assert.equal(activity.getSnapshot(), 1);
  controller.close();
  assert.equal(await response.text(), "hello");
  await flush();
  assert.equal(activity.getSnapshot(), 0);
});

test("network rejection and aborted requests release loading state", async () => {
  for (const error of [new TypeError("offline"), new DOMException("Aborted", "AbortError")]) {
    const activity = createRequestActivity();
    const tracked = createTrackedFetch(async () => { throw error; }, activity, () => true);
    await assert.rejects(tracked(origin), (actual) => actual === error);
    assert.equal(activity.getSnapshot(), 0);
  }
});

test("HTTP errors, empty responses, and failed streams release loading state", async () => {
  for (const response of [new Response("failed", { status: 500 }), new Response(null, { status: 204 })]) {
    const activity = createRequestActivity();
    const tracked = createTrackedFetch(async () => response, activity, () => true);
    assert.equal((await tracked(origin)).status, response.status);
    await flush();
    assert.equal(activity.getSnapshot(), 0);
  }
  const activity = createRequestActivity();
  const tracked = createTrackedFetch(async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error("stream failed")); },
  })), activity, () => true);
  const response = await tracked(origin);
  await assert.rejects(response.text(), /stream failed/);
  await flush();
  assert.equal(activity.getSnapshot(), 0);
});

test("prefetch bypasses accounting without changing the response", async () => {
  const activity = createRequestActivity();
  const response = new Response("prefetched");
  const tracked = createTrackedFetch(async () => response, activity, () => false);
  assert.equal(await tracked(origin), response);
  assert.equal(activity.getSnapshot(), 0);
});

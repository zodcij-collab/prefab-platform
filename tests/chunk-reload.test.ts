import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isChunkLoadError, shouldReloadForChunkError, CHUNK_RELOAD_WINDOW_MS } from "../lib/chunk-reload.ts";

// Blocker #2 — Daily Log (and any page) hanging on a stale client after a redeploy. The server
// render is fast; the hang is a client-side navigation stalling on a chunk whose hashed filename
// changed in the new build. These cover the detection + one-time-reload recovery logic.

test("isChunkLoadError detects the stale-asset failures Next.js surfaces after a redeploy", () => {
  assert.equal(isChunkLoadError({ name: "ChunkLoadError", message: "x" }), true);
  assert.equal(isChunkLoadError(new Error("Loading chunk 4821 failed.\n(missing: /_next/static/chunks/4821.js)")), true);
  assert.equal(isChunkLoadError(new Error("Loading CSS chunk 12 failed")), true);
  assert.equal(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/_next/static/chunks/app/page.js")), true);
  assert.equal(isChunkLoadError(new Error("error loading dynamically imported module")), true);
  assert.equal(isChunkLoadError(new Error("importing a module script failed.")), true); // Safari wording
});

test("isChunkLoadError ignores unrelated errors (never reload on a normal app error)", () => {
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isChunkLoadError("A validation message"), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
  assert.equal(isChunkLoadError({}), false);
});

test("shouldReloadForChunkError reloads once, then suppresses a loop within the window", () => {
  const err = new Error("Loading chunk 9 failed");
  // never reloaded before → reload
  assert.equal(shouldReloadForChunkError(err, 0, 100000), true);
  // reloaded 1s ago (< 15s window) → do NOT reload again (prevents a reload loop)
  assert.equal(shouldReloadForChunkError(err, 100000, 101000), false);
  // reloaded 16s ago (> window) → allowed again
  assert.equal(shouldReloadForChunkError(err, 100000, 116001), true);
  // a non-chunk error never triggers a reload regardless of timing
  assert.equal(shouldReloadForChunkError(new Error("normal"), 0, 100000), false);
  assert.equal(CHUNK_RELOAD_WINDOW_MS, 15000);
});

test("the portal layout mounts the AssetReloadGuard so every portal page is covered", () => {
  const layout = readFileSync(join(process.cwd(), "app/portal/layout.tsx"), "utf8");
  assert.match(layout, /AssetReloadGuard/, "portal layout must render the stale-asset reload guard");
});

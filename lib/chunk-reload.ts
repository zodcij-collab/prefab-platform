// Detect a "stale client after deployment" failure: the browser tab was loaded from a previous
// build and, on a client-side navigation, tries to fetch a JS/CSS chunk whose hashed filename no
// longer exists (the redeploy changed the hashes). Next.js does NOT auto-recover from this — the
// navigation stalls, which reads as a hang. The fix is a one-time full reload to fetch the new
// assets. This is a targeted recovery keyed on the specific error — NOT a blind timeout/retry.
//
// Pure + unit-testable so the actual detection logic is covered by a regression test.
export function isChunkLoadError(reason: unknown): boolean {
  if (reason == null) return false;
  const name = typeof reason === "object" ? (reason as { name?: unknown }).name : undefined;
  if (name === "ChunkLoadError") return true;
  const message = typeof reason === "object" && (reason as { message?: unknown }).message
    ? String((reason as { message?: unknown }).message)
    : String(reason);
  return /Loading chunk [\w./-]+ failed/i.test(message)
    || /Loading CSS chunk [\w./-]+ failed/i.test(message)
    || /Failed to fetch dynamically imported module/i.test(message)
    || /error loading dynamically imported module/i.test(message)
    || /importing a module script failed/i.test(message);
}

// Guard against reload loops: only reload if we have not already reloaded for this reason very
// recently. `now`/`last` are millisecond timestamps; a genuine stale-asset error is fixed by one
// reload, so a second identical error within the window means reloading will not help — stop.
export const CHUNK_RELOAD_WINDOW_MS = 15000;
export function shouldReloadForChunkError(reason: unknown, lastReloadAt: number, now: number): boolean {
  return isChunkLoadError(reason) && now - lastReloadAt >= CHUNK_RELOAD_WINDOW_MS;
}

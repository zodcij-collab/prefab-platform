"use client";
import { useEffect } from "react";
import { shouldReloadForChunkError } from "../../lib/chunk-reload";

// Mounted once in the portal layout. If a client-side navigation fails to load a chunk because
// the tab is running a previous build (the redeploy changed hashed asset filenames), do a single
// full reload to fetch the current assets — otherwise the navigation hangs indefinitely. A
// timestamp in sessionStorage prevents any reload loop.
const KEY = "prefab.assetReloadAt";

export function AssetReloadGuard() {
  useEffect(() => {
    const recover = (reason: unknown) => {
      let last = 0;
      try { last = Number(sessionStorage.getItem(KEY) || 0) || 0; } catch { /* storage unavailable */ }
      if (!shouldReloadForChunkError(reason, last, Date.now())) return;
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => recover(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => recover(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

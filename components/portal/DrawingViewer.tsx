"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";
import { clampUnit, markerAppearance, markerPassesFilter, MARKER_FILTERS, type MarkerFilter } from "../../lib/issues";

type Marker = { id: number; issueNumber: number; type: string; title: string; status: string; priority: string; assignedTo: string; dueDate: string; drawingPage: number; drawingX: number; drawingY: number };
type SetIssue = { id: number; number: number };

// Client PDF drawing viewer with an issue-marker overlay. The private PDF is fetched from the
// existing authenticated same-origin document route and rendered in-browser by pdf.js (no SaaS,
// no public URL). Markers are stored/read as normalized coords (0..1); a tap's normalized
// position is derived from the canvas's on-screen bounding box, so it is independent of zoom,
// pan, viewport and fit mode. Placement is an explicit mode and a tap (minimal movement) is
// distinguished from a pan/pinch, so panning never drops an accidental marker.
export function DrawingViewer({ projectId, doc, markers, canCapture, canManage, language, initialPage, focusIssueId, setIssue, setMarkerAction }: {
  projectId: string; doc: { id: number; title: string }; markers: Marker[]; canCapture: boolean; canManage: boolean; language: PortalLanguage; initialPage: number; focusIssueId?: number; setIssue?: SetIssue; setMarkerAction: (data: FormData) => void | Promise<void>;
}) {
  const t = (v: string) => portalText(language, v);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null);
  // A deep-linked marker (?issue=N) opens on its page and is pre-selected — derived at render
  // so no state-setting effect is needed to bring it into view.
  const focusMarker = focusIssueId ? markers.find((m) => m.id === focusIssueId) : undefined;
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(Math.max(1, focusMarker?.drawingPage || initialPage || 1));
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [placing, setPlacing] = useState(Boolean(setIssue));
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [filter, setFilter] = useState<MarkerFilter>("active");
  const [selected, setSelected] = useState<Marker | null>(focusMarker ?? null);
  // Best-effort visual crop of the drawing around the pending marker (a PNG data URL). Captured
  // client-side from the already-rendered canvas; embedded in the Issue PDF. Purely additive —
  // if capture yields nothing the marker still saves and the PDF uses its textual reference.
  const [pendingSnapshot, setPendingSnapshot] = useState<string>("");
  const router = useRouter();

  // Load the PDF once (dynamic import keeps pdf.js out of SSR).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        // Vendored resources so non-embedded standard fonts (Helvetica/Times/…) and CJK cmaps
        // render — without these, a text-only drawing renders blank.
        const task = pdfjs.getDocument({ url: `/portal/files/documents/${doc.id}`, isEvalSupported: false, standardFontDataUrl: "/pdfjs/standard_fonts/", cMapUrl: "/pdfjs/cmaps/", cMapPacked: true });
        const pdf = await task.promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setStatus("ready");
      } catch { if (!cancelled) setStatus("error"); }
    })();
    return () => { cancelled = true; };
  }, [doc.id]);

  // Render the current page to the canvas at a fit-width base resolution (DPR-aware for
  // crispness); zoom/pan are CSS transforms so re-rendering stays cheap. Any in-flight render
  // is cancelled first so a re-render (or React StrictMode's double-invoke in dev) can never
  // run two render() operations on the same canvas and leave it blank.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);
  const renderPage = useCallback(async () => {
    const pdf = pdfRef.current, canvas = canvasRef.current, stage = stageRef.current?.parentElement;
    if (!pdf || !canvas || !stage) return;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* already done */ } renderTaskRef.current = null; }
    const p = await pdf.getPage(page);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const base = p.getViewport({ scale: 1 });
    const targetCssW = Math.max(320, Math.min(stage.clientWidth - 24, 1600));
    const cssScale = targetCssW / base.width;
    const viewport = p.getViewport({ scale: cssScale * dpr });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${Math.round(viewport.width / dpr)}px`; canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const task = p.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try { await task.promise; } catch { /* render cancelled by a newer render */ }
  }, [page]);

  useEffect(() => { if (status === "ready") renderPage(); }, [status, page, renderPage]);
  useEffect(() => { const on = () => renderPage(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, [renderPage]);

  // ── pointer: pan / pinch / tap-to-place ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; startPan: { x: number; y: number }; pinchDist: number; startZoom: number }>({ moved: 0, startPan: { x: 0, y: 0 }, pinchDist: 0, startZoom: 1 });
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current.moved = 0; gesture.current.startPan = { ...pan };
    if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y); gesture.current.startZoom = zoom; }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinchDist) setZoom(Math.max(1, Math.min(6, gesture.current.startZoom * (dist / gesture.current.pinchDist))));
      gesture.current.moved += 10; return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    gesture.current.moved += Math.abs(dx) + Math.abs(dy);
    setPan((pp) => ({ x: pp.x + dx, y: pp.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasTap = gesture.current.moved < 6 && pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (placing && wasTap && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clampUnit((e.clientX - rect.left) / rect.width), y = clampUnit((e.clientY - rect.top) / rect.height);
      setPending({ x, y }); setSelected(null);
      setPendingSnapshot(captureSnapshot(x, y));
    }
  };

  // Rasterize a crop of the current page around a normalized point, with the marker drawn on
  // it, to a bounded PNG data URL. Reads the already-rendered same-origin canvas (never tainted)
  // so toDataURL succeeds; any failure returns "" and the snapshot is simply omitted.
  const captureSnapshot = (nx: number, ny: number): string => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return "";
    try {
      const W = canvas.width, H = canvas.height;
      const cropW = Math.min(W, Math.round(Math.min(W, H) * 0.5)), cropH = Math.min(H, Math.round(Math.min(W, H) * 0.5));
      const cx = nx * W, cy = ny * H;
      const sx = Math.max(0, Math.min(W - cropW, Math.round(cx - cropW / 2)));
      const sy = Math.max(0, Math.min(H - cropH, Math.round(cy - cropH / 2)));
      const scale = Math.min(1, 640 / Math.max(cropW, cropH));
      const outW = Math.max(1, Math.round(cropW * scale)), outH = Math.max(1, Math.round(cropH * scale));
      const out = document.createElement("canvas"); out.width = outW; out.height = outH;
      const ctx = out.getContext("2d"); if (!ctx) return "";
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(canvas, sx, sy, cropW, cropH, 0, 0, outW, outH);
      // Marker indicator (ring + crosshair) at the tapped point within the crop.
      const mx = (cx - sx) * scale, my = (cy - sy) * scale, r = Math.max(9, outW * 0.05);
      ctx.lineWidth = Math.max(2, outW * 0.012); ctx.strokeStyle = "#f26522";
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - r * 1.6, my); ctx.lineTo(mx + r * 1.6, my); ctx.moveTo(mx, my - r * 1.6); ctx.lineTo(mx, my + r * 1.6); ctx.stroke();
      ctx.fillStyle = "#f26522"; ctx.beginPath(); ctx.arc(mx, my, Math.max(2, r * 0.28), 0, Math.PI * 2); ctx.fill();
      return out.toDataURL("image/png");
    } catch { return ""; }
  };

  // Capture-from-drawing hands the crop to the new-issue form via sessionStorage (a same-tab
  // one-shot keyed to this marker); the form re-attaches it on submit. Then navigate to capture.
  const startCapture = (intent: "Defect" | "Task") => {
    if (!pending) return;
    try {
      if (pendingSnapshot) sessionStorage.setItem("prefab.drawingSnapshot", JSON.stringify({ documentId: doc.id, page, x: +pending.x.toFixed(4), y: +pending.y.toFixed(4), dataUrl: pendingSnapshot }));
      else sessionStorage.removeItem("prefab.drawingSnapshot");
    } catch { /* storage unavailable — proceed without the snapshot */ }
    router.push(`${captureBase}&intent=${intent}`);
  };

  const zoomBy = (f: number) => setZoom((z) => Math.max(1, Math.min(6, +(z * f).toFixed(3))));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const visible = markers.filter((m) => m.drawingPage === page && markerPassesFilter(m, filter));
  const APP_CLASS: Record<string, string> = { critical: "dv-mk-critical", open: "dv-mk-open", subdued: "dv-mk-subdued", hidden: "dv-mk-hidden" };
  // Cancelled markers surface only in the "all" filter — rendered subdued (never active-looking).
  const markerClass = (m: Marker) => { const app = markerAppearance(m); return app === "hidden" ? "dv-mk-cancelled" : APP_CLASS[app]; };
  const captureBase = `/portal/projects/${projectId}/issues/new?documentId=${doc.id}&drawingPage=${page}` + (pending ? `&drawingX=${pending.x.toFixed(4)}&drawingY=${pending.y.toFixed(4)}` : "");

  return (
    <div className="dv-root">
      <div className="dv-toolbar">
        <div className="dv-pages">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label={t("Previous page")}>‹</button>
          <span className="dv-page-label">{t("Page")} {page}{numPages ? ` / ${numPages}` : ""}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(numPages || p, p + 1))} disabled={numPages > 0 && page >= numPages} aria-label={t("Next page")}>›</button>
        </div>
        <div className="dv-zoom">
          <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label={t("Zoom out")}>−</button>
          <button type="button" onClick={resetView} aria-label={t("Fit page")}>{t("Fit")}</button>
          <button type="button" onClick={() => zoomBy(1.3)} aria-label={t("Zoom in")}>+</button>
        </div>
        <div className="dv-filters" role="group" aria-label={t("Filter markers")}>
          {MARKER_FILTERS.map((f) => <button key={f} type="button" className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{t(FILTER_LABEL[f])}</button>)}
        </div>
      </div>

      {(canCapture || setIssue) && <div className={`dv-placebar ${placing ? "on" : ""}`}>
        {setIssue
          ? <span className="dv-placehint">{t("Tap the exact location for")} #{setIssue.number}</span>
          : <button type="button" className={placing ? "os-primary-action" : "os-secondary-action"} onClick={() => { setPlacing((v) => !v); setPending(null); setPendingSnapshot(""); }}>{placing ? t("Placing… tap the drawing") : `📍 ${t("Place marker")}`}</button>}
        {placing && !setIssue && <button type="button" className="dv-cancel" onClick={() => { setPlacing(false); setPending(null); setPendingSnapshot(""); }}>{t("Cancel")}</button>}
      </div>}

      <div className="dv-canvas-wrap">
        {status === "loading" && <p className="dv-msg">{t("Loading drawing…")}</p>}
        {status === "error" && <p className="dv-msg dv-err">{t("This drawing could not be displayed.")}</p>}
        <div ref={stageRef} className={`dv-stage ${placing ? "placing" : ""}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <canvas ref={canvasRef} className="dv-canvas" />
          <div className="dv-overlay">
            {visible.map((m) => <button key={m.id} type="button" className={`dv-marker ${markerClass(m)}`} style={{ left: `${m.drawingX * 100}%`, top: `${m.drawingY * 100}%`, transform: `translate(-50%,-50%) scale(${1 / zoom})` }} onClick={(e) => { e.stopPropagation(); setSelected(m); }} aria-label={`#${m.issueNumber} ${m.title}`}><span>{m.issueNumber}</span></button>)}
            {pending && <span className="dv-marker dv-mk-pending" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%`, transform: `translate(-50%,-50%) scale(${1 / zoom})` }}><span>+</span></span>}
          </div>
        </div>
      </div>

      {pending && <div className="dv-confirm">
        <span className="dv-placehint">{t("Marker placed. Confirm or tap again to reposition.")}</span>
        <div className="dv-confirm-actions">
          {setIssue
            ? <form action={setMarkerAction} className="os-inline-form"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="issueId" value={setIssue.id} /><input type="hidden" name="documentId" value={doc.id} /><input type="hidden" name="drawingPage" value={page} /><input type="hidden" name="drawingX" value={pending.x.toFixed(4)} /><input type="hidden" name="drawingY" value={pending.y.toFixed(4)} /><input type="hidden" name="snapshot" value={pendingSnapshot} /><button className="os-primary-action" type="submit">{t("Save location")}</button></form>
            : <><button type="button" className="os-primary-action" onClick={() => startCapture("Defect")}>{t("Create Defect")}</button><button type="button" className="os-secondary-action" onClick={() => startCapture("Task")}>{t("Create Task")}</button></>}
          <button type="button" className="dv-cancel" onClick={() => { setPending(null); setPendingSnapshot(""); }}>{t("Cancel")}</button>
        </div>
      </div>}

      {selected && <div className="dv-card" role="dialog" aria-label={`#${selected.issueNumber}`}>
        <button type="button" className="dv-card-close" onClick={() => setSelected(null)} aria-label={t("Close")}>×</button>
        <div className="dv-card-head"><strong>#{selected.issueNumber} · {t(selected.type)}</strong><span className={`os-badge os-badge-${selected.status.toLowerCase().replace(/[^a-z]/g, "")}`}>{t(selected.status)}</span></div>
        <p className="dv-card-title">{selected.title || t("Capture")}</p>
        <p className="dv-card-meta"><span className={`os-prio os-prio-${selected.priority.toLowerCase()}`}>{t(selected.priority)}</span>{selected.assignedTo && <span> · ◎ {selected.assignedTo}</span>}{selected.dueDate && <span> · ⏱ {selected.dueDate}</span>}</p>
        <Link className="os-primary-action" href={`/portal/projects/${projectId}/issues/${selected.id}`}>{t("Open")} →</Link>
      </div>}
      {canManage && !setIssue && <p className="os-form-hint">{t("Place marker enables tap-to-create. Pinch or the +/− controls zoom; drag to pan.")}</p>}
    </div>
  );
}

const FILTER_LABEL: Record<MarkerFilter, string> = { active: "Active", defects: "Defects", tasks: "Tasks", critical: "Critical", resolved: "Resolved/Closed", all: "All" };

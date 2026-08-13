"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";
import { computeLoadTotals, defaultOrientation, elementMatchesLoadFilter, evaluateLoad, recommendTransport, sortElementsByLength, ELEMENT_ORIENTATIONS, LOAD_INTENTS, type LoadElementCalc, type LoadMessage, type TransportProfileCalc } from "../../lib/loads";
import type { LoadActionState } from "../../app/portal/projects/[id]/loads/actions";

type Profile = { id: number; name: string; active: number; placeholder: number; rank: number; maxPayloadT: number | null; maxLengthMm: number | null; maxWidthMm: number | null; maxHeightMm: number | null; note: string };
type AvailEl = { id: number; code: string; elementType: string; floor: string; zone: string; weight: number | null; length: number | null; width: number | null; height: number | null; status: string; installationZoneId?: number | null; installationZoneName?: string };
type LoadEl = AvailEl & { elementId: number; orientation: string; intent: string; note: string };
type LoadInfo = { id: number; loadNumber: number; status: string; plannedDate: string; plannedTime: string; transportProfileId: number | null; loadingDirection: string; orientationNote: string; note: string; exceptionAck: number; exceptionReason: string; weekendAck: number };

const dims = (e: { length: number | null; width: number | null; height: number | null }) => [e.length, e.width, e.height].map((v) => (v ?? "—")).join(" × ") + " mm";
const t1 = (v: number | null) => (v === null ? "—" : v.toFixed(v % 1 === 0 ? 0 : 2));

function messageText(t: (v: string) => string, message: LoadMessage): string {
  const map: Record<string, string> = {
    unusual_orientation: "An element is carried against its type default orientation — site repositioning may be required.",
    non_standard: "NON-STANDARD TRANSPORT — manual review / permit may be required.",
    exceeds_selected: "Load exceeds the selected transport limits. Acknowledge the exception to plan.",
    exceeds_acknowledged: "Selected transport exceeded — exception acknowledged.",
    below_recommended: "Selected transport is below the recommended profile.",
    no_elements: "Add at least one element before planning.",
    no_datetime: "Set delivery date and time before planning.",
    no_transport: "Select a transport before planning.",
    non_standard_ack: "Non-standard load — acknowledge the transport exception to plan.",
    weekend_delivery: "Weekend delivery — confirm site access and crew availability.",
    weekend_ack: "Weekend delivery — acknowledge to plan this load.",
  };
  return t(map[message.code] ?? message.code);
}

export function LoadEditor({ projectId, load, initialElements, available, profiles, canApproveException, language, action, isNew = false }: {
  projectId: string; load: LoadInfo; initialElements: LoadEl[]; available: AvailEl[]; profiles: Profile[]; canApproveException: boolean; language: PortalLanguage; action: (state: LoadActionState, data: FormData) => Promise<LoadActionState>; isNew?: boolean;
}) {
  const t = (v: string) => portalText(language, v);
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [current, setCurrent] = useState<LoadEl[]>(initialElements);
  const [planned, setPlanned] = useState(load.status === "Planned");
  // Controlled fields — the live validator must see exactly what the browser shows.
  const [plannedDate, setPlannedDate] = useState(load.plannedDate);
  const [plannedTime, setPlannedTime] = useState(load.plannedTime);
  const [transportProfileId, setTransportProfileId] = useState(load.transportProfileId ? String(load.transportProfileId) : "");
  const [loadingDirection, setLoadingDirection] = useState(load.loadingDirection || "forward");
  const [note, setNote] = useState(load.note);
  const [orientationNote, setOrientationNote] = useState(load.orientationNote);
  const [ack, setAck] = useState(load.exceptionAck === 1);
  const [weekendAck, setWeekendAck] = useState(load.weekendAck === 1);
  const [exceptionReason, setExceptionReason] = useState(load.exceptionReason);
  const [search, setSearch] = useState(""); const [typeFilter, setTypeFilter] = useState(""); const [floorFilter, setFloorFilter] = useState(""); const [zoneFilter, setZoneFilter] = useState(""); const [installZoneFilter, setInstallZoneFilter] = useState(""); const [lengthSort, setLengthSort] = useState<"" | "asc" | "desc">("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.error && errorRef.current) errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); }, [state]);

  const currentIds = new Set(current.map((e) => e.elementId));
  const profilesCalc: TransportProfileCalc[] = profiles.map((p) => ({ id: p.id, name: p.name, active: p.active === 1, placeholder: p.placeholder === 1, rank: p.rank, maxPayloadT: p.maxPayloadT, maxLengthMm: p.maxLengthMm, maxWidthMm: p.maxWidthMm, maxHeightMm: p.maxHeightMm }));
  const calc: LoadElementCalc[] = current.map((e) => ({ elementType: e.elementType, orientation: e.orientation, weight: e.weight, length: e.length, width: e.width, height: e.height }));
  const totals = computeLoadTotals(calc);
  const recommended = recommendTransport(totals, profilesCalc);
  const targetStatus = planned ? "Planned" : "Draft";
  const evaluation = evaluateLoad({ elements: calc, profiles: profilesCalc, selectedProfileId: transportProfileId ? Number(transportProfileId) : null, targetStatus, plannedDate, plannedTime, exceptionAcknowledged: ack && canApproveException, weekendAcknowledged: weekendAck });
  const showWeekendAck = evaluation.messages.some((m) => m.code === "weekend_delivery");
  const selectedProfile = profiles.find((p) => String(p.id) === transportProfileId) ?? null;
  const needsAck = evaluation.messages.some((m) => ["exceeds_selected", "non_standard", "non_standard_ack", "exceeds_acknowledged"].includes(m.code));
  const blockedForPlanned = planned && evaluation.blocking;

  const types = useMemo(() => [...new Set(available.map((e) => e.elementType))].sort(), [available]);
  const floors = useMemo(() => [...new Set(available.map((e) => e.floor).filter(Boolean))].sort(), [available]);
  const zones = useMemo(() => [...new Set(available.map((e) => e.zone).filter(Boolean))].sort(), [available]);
  const installZones = useMemo(() => { const map = new Map<number, string>(); for (const e of available) if (e.installationZoneId != null && e.installationZoneName) map.set(e.installationZoneId, e.installationZoneName); return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)); }, [available]);
  const matched = available.filter((e) => !currentIds.has(e.id) && elementMatchesLoadFilter(e, { query: search, type: typeFilter, floor: floorFilter, zone: zoneFilter, installationZoneId: installZoneFilter ? Number(installZoneFilter) : null }));
  const filteredAvailable = lengthSort ? sortElementsByLength(matched, lengthSort) : matched;
  const VISIBLE = 150; const shown = filteredAvailable.slice(0, VISIBLE);

  const addElement = (e: AvailEl) => setCurrent((list) => [...list, { ...e, elementId: e.id, orientation: defaultOrientation(e.elementType), intent: "Direct erection", note: "" }]);
  const removeElement = (id: number) => setCurrent((list) => list.filter((e) => e.elementId !== id));
  const move = (index: number, delta: number) => setCurrent((list) => { const next = [...list]; const target = index + delta; if (target < 0 || target >= next.length) return list; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const setField = (id: number, key: "orientation" | "intent", val: string) => setCurrent((list) => list.map((e) => (e.elementId === id ? { ...e, [key]: val } : e)));

  const elementsPayload = JSON.stringify(current.map((e) => ({ elementId: e.elementId, orientation: e.orientation, intent: e.intent, note: e.note })));

  return (
    <form action={formAction} className="os-load-editor">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="loadId" value={load.id} />
      <input type="hidden" name="targetStatus" value={targetStatus} />
      <input type="hidden" name="elements" value={elementsPayload} />
      {state.error && <p className="os-form-error" role="alert" ref={errorRef}>{t(state.error)}</p>}

      <div className="os-load-grid">
        <section className="os-panel os-load-available">
          <div className="os-panel-head"><div><p>{t("Element register").toUpperCase()}</p><h2>{t("Available elements")}</h2></div><span className="os-muted">{filteredAvailable.length}</span></div>
          <div className="os-filter-grid">
            <input aria-label={t("Search")} placeholder={t("Search marks — separate several with a comma")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label={t("Element type")}><option value="">{t("All types")}</option>{types.map((v) => <option key={v} value={v}>{t(v)}</option>)}</select>
            {floors.length > 0 && <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} aria-label={t("Floor")}><option value="">{t("All floors")}</option>{floors.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
            {zones.length > 0 && <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} aria-label={t("Zone")}><option value="">{t("All zones")}</option>{zones.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
            {installZones.length > 0 && <select value={installZoneFilter} onChange={(e) => setInstallZoneFilter(e.target.value)} aria-label={t("Installation zone")}><option value="">{t("All installation zones")}</option>{installZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>}
            <select value={lengthSort} onChange={(e) => setLengthSort(e.target.value as "" | "asc" | "desc")} aria-label={t("Sort by length")}><option value="">{t("Register order")}</option><option value="desc">{t("Longest first")}</option><option value="asc">{t("Shortest first")}</option></select>
          </div>
          <div className="os-load-avail-list">
            {shown.map((e) => (
              <button type="button" key={e.id} className="os-avail-row" onClick={() => addElement(e)}>
                <span className="os-avail-add" aria-hidden="true">+</span>
                <strong>{e.code}</strong><span>{t(e.elementType)}</span><span>{e.floor || "—"}/{e.zone || "—"}</span><span>{t1(e.weight)} t</span><span>{dims(e)}</span>
              </button>
            ))}
            {filteredAvailable.length === 0 && <p className="os-empty">{t("No available elements match these filters.")}</p>}
            {filteredAvailable.length > VISIBLE && <p className="os-muted os-load-more">{filteredAvailable.length - VISIBLE} {t("more — refine search or filters.")}</p>}
          </div>
        </section>

        <section className="os-panel os-load-current">
          <div className="os-panel-head"><div><p>{t("Load planning").toUpperCase()}</p><h2>{isNew ? t("New load") : `${t("Load")} ${load.loadNumber}`}</h2></div><span className={`os-badge os-badge-${load.status.toLowerCase()}`}>{t(load.status)}</span></div>

          <div className="os-load-summary">
            <div><span>{t("Elements")}</span><strong>{totals.count}</strong></div>
            <div><span>{t("Total weight")}</span><strong>{totals.totalWeightT.toFixed(2)}{selectedProfile?.maxPayloadT != null ? ` / ${selectedProfile.maxPayloadT} t` : " t"}</strong></div>
            {selectedProfile?.maxPayloadT != null && <div><span>{t("Remaining payload")}</span><strong>{(selectedProfile.maxPayloadT - totals.totalWeightT).toFixed(2)} t</strong></div>}
            <div><span>{t("Max vertical height")}</span><strong>{totals.maxVerticalHeightMm || "—"} mm</strong></div>
            <div><span>{t("Recommended transport")}</span><strong>{recommended ? recommended.name : t("Non-standard")}</strong></div>
          </div>

          {evaluation.messages.length > 0 && <ul className="os-load-messages">{evaluation.messages.map((m, i) => <li key={i} className={m.level === "blocking" ? "blocking" : "warning"}>{messageText(t, m)}</li>)}</ul>}

          <div className="os-load-elements">
            {current.length === 0 && <p className="os-empty">{t("Add elements from the register to build this load.")}</p>}
            {current.map((e, index) => (
              <div className="os-load-el" key={e.elementId}>
                <div className="os-load-el-order"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("Move up")}>↑</button><span>{index + 1}</span><button type="button" onClick={() => move(index, 1)} disabled={index === current.length - 1} aria-label={t("Move down")}>↓</button></div>
                <div className="os-load-el-main"><strong>{e.code}</strong><span>{t(e.elementType)} · {t1(e.weight)} t · {dims(e)}</span></div>
                <label className="os-load-el-field"><span>{t("Orientation")}</span><select value={e.orientation} onChange={(ev) => setField(e.elementId, "orientation", ev.target.value)}>{ELEMENT_ORIENTATIONS.map((o) => <option key={o} value={o}>{t(o)}</option>)}</select></label>
                <label className="os-load-el-field"><span>{t("Planning intent")}</span><select value={e.intent} onChange={(ev) => setField(e.elementId, "intent", ev.target.value)}>{LOAD_INTENTS.map((o) => <option key={o} value={o}>{t(o)}</option>)}</select></label>
                <button type="button" className="os-load-el-remove" onClick={() => removeElement(e.elementId)} aria-label={t("Remove")}>×</button>
              </div>
            ))}
          </div>

          <div className="os-load-fields">
            <label>{t("Delivery date")}<input type="date" name="plannedDate" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} /></label>
            <label>{t("Delivery time")}<input type="time" name="plannedTime" value={plannedTime} onChange={(e) => setPlannedTime(e.target.value)} /></label>
            <label>{t("Selected transport")}<select name="transportProfileId" value={transportProfileId} onChange={(e) => setTransportProfileId(e.target.value)}><option value="">{t("Not selected")}</option>{profiles.filter((p) => p.active === 1 || p.id === load.transportProfileId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>{t("Loading direction")}<select name="loadingDirection" value={loadingDirection} onChange={(e) => setLoadingDirection(e.target.value)}><option value="forward">{t("First listed element loaded first")}</option><option value="reverse">{t("First listed element loaded last")}</option></select></label>
            <label className="wide">{t("General transport orientation / note")}<input name="orientationNote" maxLength={500} value={orientationNote} onChange={(e) => setOrientationNote(e.target.value)} /></label>
            <label className="wide">{t("Load note")}<textarea name="note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>

          <p className="os-form-hint">{t("Transport height limits are confirmed; payload, length and width still require carrier confirmation.")}</p>

          {needsAck && canApproveException && (
            <div className="os-load-ack">
              <label><input type="checkbox" name="exceptionAck" value="on" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {t("Acknowledge non-standard / over-limit transport exception")}</label>
              {ack && <label className="wide">{t("Exception reason")}<input name="exceptionReason" maxLength={500} value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} /></label>}
            </div>
          )}
          {needsAck && !canApproveException && <p className="os-form-hint">{t("A Project Manager or Administrator must acknowledge this transport exception to plan the load.")}</p>}

          {showWeekendAck && (
            <div className="os-load-ack">
              <label><input type="checkbox" name="weekendAck" value="on" checked={weekendAck} onChange={(e) => setWeekendAck(e.target.checked)} /> {t("Acknowledge weekend delivery (site access and crew confirmed)")}</label>
            </div>
          )}
          {!showWeekendAck && weekendAck && <input type="hidden" name="weekendAck" value="on" />}

          <label className="os-load-plan-toggle"><input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} /> {t("Mark as Planned (ready for the delivery schedule)")}</label>

          <div className="os-form-actions">
            <button type="submit" name="intent" value="save" className="os-secondary-action" disabled={pending || blockedForPlanned}>{pending ? `${t("Saving")}…` : t("Save")}</button>
            <button type="submit" name="intent" value="save_next" className="os-primary-action os-primary-action-dark" disabled={pending || blockedForPlanned}>{pending ? `${t("Saving")}…` : `${t("Save load & create next")} →`}</button>
          </div>
          {blockedForPlanned && <p className="os-form-hint">{t("Resolve the blocking issues above, or uncheck Planned to save as Draft.")}</p>}
        </section>
      </div>
    </form>
  );
}

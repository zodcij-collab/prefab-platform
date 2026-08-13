"use client";
import { useMemo, useState } from "react";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";
import { parseSearchTerms } from "../../lib/loads";
import { acceptLoadAction } from "../../app/portal/projects/[id]/loads/actions";

type PlannedEl = { elementId: number; code: string; elementType: string };
type AddEl = { id: number; code: string; elementType: string; floor: string; zone: string };

// Receive a Planned load. "As planned" records the whole plan as delivered. "With
// discrepancies" (supervisory) lets the receiver mark individual elements missing and add
// elements that physically arrived off-plan. All enforcement is server-side; this panel
// only assembles the receipt for acceptLoadAction.
export function LoadAcceptPanel({ projectId, loadId, planned, availableToAdd, canApproveException, defaultDate, language }: {
  projectId: string; loadId: number; planned: PlannedEl[]; availableToAdd: AddEl[]; canApproveException: boolean; defaultDate: string; language: PortalLanguage;
}) {
  const t = (v: string) => portalText(language, v);
  const [mode, setMode] = useState<"as_planned" | "with_discrepancies">("as_planned");
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<AddEl[]>([]);
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(defaultDate);

  const toggleMissing = (id: number) => setMissing((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const addedIds = new Set(added.map((a) => a.id));
  const matches = useMemo(() => {
    const terms = parseSearchTerms(search);
    return availableToAdd.filter((e) => !addedIds.has(e.id) && (!terms.length || terms.some((term) => e.code.toLowerCase().includes(term) || e.elementType.toLowerCase().includes(term)))).slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, availableToAdd, added]);
  const addedPayload = JSON.stringify(added.map((a) => ({ elementId: a.id, category: "added", note: "" })));

  const receivedCount = mode === "as_planned" ? planned.length : planned.length - missing.size;

  return (
    <section className="os-panel os-load-accept">
      <div className="os-panel-head"><div><p>{t("Delivery").toUpperCase()}</p><h2>{t("Receive load")}</h2></div></div>
      <div className="os-accept-modes" role="radiogroup">
        <label><input type="radio" name="mode" checked={mode === "as_planned"} onChange={() => setMode("as_planned")} /> {t("Received as planned")}</label>
        {canApproveException
          ? <label><input type="radio" name="mode" checked={mode === "with_discrepancies"} onChange={() => setMode("with_discrepancies")} /> {t("Received with discrepancies")}</label>
          : <span className="os-muted">{t("A Project Manager or Administrator can record discrepancies.")}</span>}
      </div>

      <form action={acceptLoadAction} className="os-accept-form">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="loadId" value={loadId} />
        <input type="hidden" name="acceptanceType" value={mode} />
        <input type="hidden" name="added" value={addedPayload} />

        {mode === "with_discrepancies" && (
          <>
            <p className="os-form-hint">{t("Mark any element that did not arrive as Missing. Missing elements are released for re-planning.")}</p>
            <ul className="os-accept-list">
              {planned.map((el) => (
                <li key={el.elementId} className={missing.has(el.elementId) ? "missing" : "received"}>
                  <span><strong>{el.code}</strong> · {t(el.elementType)}</span>
                  <label className="os-accept-toggle"><input type="checkbox" checked={missing.has(el.elementId)} onChange={() => toggleMissing(el.elementId)} /> {t("Missing")}</label>
                  <input type="hidden" name={`disp_${el.elementId}`} value={missing.has(el.elementId) ? "missing" : "received"} />
                </li>
              ))}
            </ul>

            <div className="os-accept-add">
              <p className="os-muted">{t("Add elements that arrived but were not planned on this load:")}</p>
              {added.length > 0 && <ul className="os-accept-added">{added.map((a) => <li key={a.id}><strong>{a.code}</strong> · {t(a.elementType)} <button type="button" onClick={() => setAdded((l) => l.filter((x) => x.id !== a.id))} aria-label={t("Remove")}>×</button></li>)}</ul>}
              <input placeholder={t("Search marks — separate several with a comma")} value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && (
                <div className="os-accept-matches">
                  {matches.map((e) => <button type="button" key={e.id} className="os-avail-row" onClick={() => { setAdded((l) => [...l, e]); setSearch(""); }}><span className="os-avail-add">+</span><strong>{e.code}</strong><span>{t(e.elementType)}</span><span>{e.floor || "—"}/{e.zone || "—"}</span></button>)}
                  {matches.length === 0 && <p className="os-empty">{t("No available elements match these filters.")}</p>}
                </div>
              )}
            </div>
          </>
        )}

        <div className="os-load-fields">
          <label>{t("Delivery date")}<input type="date" name="operationDate" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="wide">{t("Receipt note")}<textarea name="comment" maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        </div>

        <p className="os-accept-summary">{t("Received")}: <strong>{receivedCount + added.length}</strong>{mode === "with_discrepancies" && <> · {t("Missing")}: <strong>{missing.size}</strong> · {t("Added")}: <strong>{added.length}</strong></>}</p>
        <div className="os-form-actions"><button type="submit" className="os-primary-action">{t("Confirm receipt")}</button></div>
      </form>
    </section>
  );
}

"use client";
import { useActionState, useMemo, useState } from "react";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";
import { ISSUE_PRIORITIES, ISSUE_TYPES } from "../../lib/issues";
import { classifyIssueFormAction, type ClassifyState } from "../../app/portal/projects/[id]/issues/actions";

type Zone = { id: number; name: string };
type Element = { id: number; code: string; elementType: string; floor: string; installationZoneId: number | null };
type IssueValues = { type: string; title: string; details: string; priority: string; installationZoneId: number | null; elementId: number | null; dueDate: string };

// Classification form. All fields are controlled client state and the action revalidates in
// place (never navigates), so typed-but-unsaved values survive an Assign / status / comment /
// media action on the same page, and a recoverable validation error keeps them too. The
// element picker follows the selected zone; changing the zone clears an incompatible element.
export function IssueClassifyForm({ projectId, issueId, issue, zones, elements, language, isClassified }: {
  projectId: string; issueId: number; issue: IssueValues; zones: Zone[]; elements: Element[]; language: PortalLanguage; isClassified: boolean;
}) {
  const t = (v: string) => portalText(language, v);
  const [state, formAction, pending] = useActionState<ClassifyState, FormData>(classifyIssueFormAction, { error: "", saved: false });
  const [title, setTitle] = useState(issue.title);
  const [type, setType] = useState(issue.type);
  const [priority, setPriority] = useState(issue.priority);
  const [dueDate, setDueDate] = useState(issue.dueDate);
  const [details, setDetails] = useState(issue.details);
  const [zone, setZone] = useState(issue.installationZoneId ? String(issue.installationZoneId) : "");
  const [element, setElement] = useState(issue.elementId ? String(issue.elementId) : "");

  const zoneElements = useMemo(() => (zone ? elements.filter((e) => e.installationZoneId === Number(zone)) : []), [zone, elements]);
  const onZoneChange = (next: string) => {
    setZone(next);
    if (element && !elements.some((e) => String(e.id) === element && e.installationZoneId === Number(next))) setElement("");
  };

  return (
    <form action={formAction} className="os-mini-form">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="issueId" value={issueId} />
      {state.error && <p className="os-form-error" role="alert">{t(state.error)}</p>}
      {state.saved && !state.error && <p className="os-form-success" role="status">{t("Classification saved.")}</p>}
      <label className="wide">{t("Title")}<input name="title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>{t("Type")}<select name="type" value={type} onChange={(e) => setType(e.target.value)}>{ISSUE_TYPES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
      <label>{t("Priority")}<select name="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>{ISSUE_PRIORITIES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
      <label>{t("Installation zone")}<select name="installationZoneId" value={zone} onChange={(e) => onZoneChange(e.target.value)}><option value="">{t("None")}</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
      <label>{t("Element")}
        <select name="elementId" value={element} onChange={(e) => setElement(e.target.value)} disabled={!zone}>
          <option value="">{zone ? t("None") : t("Select installation zone first")}</option>
          {zoneElements.map((e) => <option key={e.id} value={e.id}>{e.code} · {t(e.elementType)} · {e.floor || "—"}</option>)}
        </select>
      </label>
      {zone && zoneElements.length === 0 && <p className="os-form-hint">{t("No elements are assigned to this installation zone yet.")}</p>}
      <label>{t("Due date")}<input type="date" name="dueDate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      <label className="wide">{t("Description")}<textarea name="details" rows={3} maxLength={8000} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
      <button className="os-primary-action" type="submit" disabled={pending}>{pending ? `${t("Saving")}…` : (isClassified ? t("Save classification") : t("Classify"))}</button>
    </form>
  );
}

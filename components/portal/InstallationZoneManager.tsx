"use client";
import Link from "next/link";
import { useState } from "react";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";

type Zone = { id: number; name: string; description: string; elementCount: number };
type ZoneAction = (data: FormData) => void | Promise<void>;

// Installation Zone management: view assigned elements (reusing the Element Register filter),
// rename/describe a zone (same zone id stays attached to the same element ids), and delete
// behind an explicit confirmation. Renaming never reassigns elements; deletion only clears
// the operational link (handled server-side) and never touches physical elements.
export function InstallationZoneManager({ projectId, zones, canManage, language, createAction, renameAction, deleteAction }: {
  projectId: string; zones: Zone[]; canManage: boolean; language: PortalLanguage; createAction: ZoneAction; renameAction: ZoneAction; deleteAction: ZoneAction;
}) {
  const t = (v: string) => portalText(language, v);
  const [editing, setEditing] = useState<number | null>(null);
  const confirmDelete = (zone: Zone) => (event: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(`${t("Are you sure you want to delete this installation zone?")}\n\n"${zone.name}" · ${zone.elementCount} ${t("elements")}\n\n${t("The elements are kept and become unassigned.")}`)) event.preventDefault();
  };
  return (
    <section className="os-panel os-zone-admin">
      <div className="os-panel-head"><div><p>{t("Element register").toUpperCase()}</p><h2>{t("Installation zones")}</h2></div></div>
      <p className="os-form-hint">{t("Operational erection groups. Independent of the design zone and preserved across XLSX re-sync.")}</p>
      {zones.length > 0 && <ul className="os-zone-list">{zones.map((zone) => (
        <li key={zone.id} className="os-zone-row">
          {editing === zone.id && canManage ? (
            <form action={renameAction} className="os-zone-edit" onSubmit={() => setEditing(null)}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="zoneId" value={zone.id} />
              <input name="name" maxLength={120} defaultValue={zone.name} required aria-label={t("Installation zone name")} />
              <input name="description" maxLength={500} defaultValue={zone.description} placeholder={t("Description (optional)")} aria-label={t("Description (optional)")} />
              <button className="os-secondary-action" type="submit">{t("Save")}</button>
              <button type="button" className="os-zone-cancel" onClick={() => setEditing(null)}>{t("Cancel")}</button>
            </form>
          ) : (
            <>
              <span><strong>{zone.name}</strong> · {zone.elementCount} {t("elements")}{zone.description ? ` · ${zone.description}` : ""}</span>
              <span className="os-zone-actions">
                <Link className="os-zone-link" href={`/portal/projects/${projectId}/elements?izone=${zone.id}`}>{t("View elements")}</Link>
                {canManage && <button type="button" className="os-zone-link" onClick={() => setEditing(zone.id)}>{t("Edit")}</button>}
                {canManage && <form action={deleteAction} className="os-inline-form" onSubmit={confirmDelete(zone)}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="zoneId" value={zone.id} /><button className="os-delete-trigger" type="submit">{t("Delete zone")}</button></form>}
              </span>
            </>
          )}
        </li>
      ))}</ul>}
      {canManage && <form action={createAction} className="os-inline-form os-zone-create"><input type="hidden" name="projectId" value={projectId} /><input name="name" maxLength={120} placeholder={t("New installation zone name")} required /><input name="description" maxLength={500} placeholder={t("Description (optional)")} /><button className="os-secondary-action" type="submit">+ {t("Add zone")}</button></form>}
    </section>
  );
}

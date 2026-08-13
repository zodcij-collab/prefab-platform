import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../components/portal/BackLink";
import { requireUser } from "../../../../../lib/auth";
import { canManageProjectLoads, canViewProjectLoads } from "../../../../../lib/permissions";
import { getProject, listProjectLoadSummaries, listTransportProfiles } from "../../../../../lib/repositories";
import { getPortalLanguage } from "../../../../../lib/portal-locale";
import { portalText } from "../../../../../data/portal-i18n";
import { cancelLoadAction } from "./actions";

export default async function DeliverySchedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; saved?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canViewProjectLoads(user, id)) notFound();
  const language = await getPortalLanguage();
  const t = (v: string) => portalText(language, v);
  const canManage = canManageProjectLoads(user, id) && !project.archivedAt;
  const showCancelled = query.view === "cancelled";
  const loads = listProjectLoadSummaries(id, showCancelled).filter((load) => (showCancelled ? load.status === "Cancelled" : load.status !== "Cancelled"));
  const profileName = new Map(listTransportProfiles().map((p) => [p.id, p.name]));

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Load planning")}`} title={t("Delivery schedule")} action={<>
      <Link className="os-secondary-action" href={`/portal/projects/${id}/loads/schedule?format=pdf`}>{t("Generate delivery schedule PDF")}</Link>
      {canManage && <Link className="os-primary-action" href={`/portal/projects/${id}/loads/new`}>+ {t("Create load")}</Link>}
    </>} />
    {project.archivedAt && <p className="os-archived-banner">{t("This project is archived and read-only.")}</p>}
    <div className="os-tabs" role="tablist">
      <Link className={showCancelled ? "" : "active"} href={`/portal/projects/${id}/loads`} role="tab" aria-selected={!showCancelled}>{t("Delivery schedule")}</Link>
      <Link className={showCancelled ? "active" : ""} href={`/portal/projects/${id}/loads?view=cancelled`} role="tab" aria-selected={showCancelled}>{t("Cancelled loads")}</Link>
    </div>
    <div className="os-table-wrap os-table-card"><table className="os-table">
      <thead><tr><th>{t("Load")}</th><th>{t("Date")}</th><th>{t("Time")}</th><th>{t("Elements")}</th><th>{t("Total weight")}</th><th>{t("Recommended transport")}</th><th>{t("Selected transport")}</th><th>{t("Status")}</th><th>{t("Manage")}</th></tr></thead>
      <tbody>{loads.map((load) => <tr key={load.id}>
        <td data-label={t("Load")}><strong>{t("Load")} {load.loadNumber}</strong>{load.exceptionAck === 1 && <><br /><small className="os-muted">⚠ {t("Exception acknowledged")}</small></>}</td>
        <td data-label={t("Date")}>{load.plannedDate || "—"}</td>
        <td data-label={t("Time")}>{load.plannedTime || "—"}</td>
        <td data-label={t("Elements")}>{load.elementCount}</td>
        <td data-label={t("Total weight")}>{load.totalWeightT.toFixed(2)} t</td>
        <td data-label={t("Recommended transport")}>{load.recommendedProfileId ? profileName.get(load.recommendedProfileId) ?? "—" : t("Non-standard")}</td>
        <td data-label={t("Selected transport")}>{load.transportProfileId ? profileName.get(load.transportProfileId) ?? "—" : "—"}</td>
        <td data-label={t("Status")}><span className={`os-badge os-badge-${(load.status === "Accepted" && load.receivedCount > 0 && load.installedCount === load.receivedCount) ? "installed" : load.status.toLowerCase()}`}>{(load.status === "Accepted" && load.receivedCount > 0 && load.installedCount === load.receivedCount) ? t("Fully installed") : t(load.status)}</span>{load.status === "Accepted" && <><br /><small className="os-muted">{t("Installed")} {load.installedCount} / {load.receivedCount}</small></>}</td>
        <td data-label={t("Manage")}>{load.status !== "Cancelled" && <Link href={`/portal/projects/${id}/loads/${load.id}`}>{t("Open")} →</Link>}{canManage && (load.status === "Draft" || load.status === "Planned") && <form action={cancelLoadAction} className="os-inline-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="loadId" value={load.id} /><button className="os-delete-trigger" type="submit">{t("Cancel load")}</button></form>}</td>
      </tr>)}</tbody>
    </table>{loads.length === 0 && <p className="os-empty-state">{showCancelled ? t("No cancelled loads.") : t("No loads planned yet.")}</p>}</div>
  </PortalShell>;
}

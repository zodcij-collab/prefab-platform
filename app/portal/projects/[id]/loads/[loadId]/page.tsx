import { notFound, redirect } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../../components/portal/BackLink";
import { LoadEditor } from "../../../../../../components/portal/LoadEditor";
import { LoadAcceptPanel } from "../../../../../../components/portal/LoadAcceptPanel";
import { requireUser } from "../../../../../../lib/auth";
import { canManageProjectLoads, canApproveLoadException } from "../../../../../../lib/permissions";
import { getLoad, getLoadReceipt, getProject, listActiveAllocatedElementIds, listLoadElements, listLoadReceiptElements, listProjectElements, listTransportProfiles, loadInstallationProgress } from "../../../../../../lib/repositories";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { portalText } from "../../../../../../data/portal-i18n";
import { saveLoadAction } from "../actions";

const availMap = (element: { id: number; code: string; elementType: string; floor: string; zone: string; weight: number | null; length: number | null; width: number | null; height: number | null; status: string; installationZoneId: number | null; installationZoneName: string }) => ({ id: element.id, code: element.code, elementType: element.elementType, floor: element.floor, zone: element.zone, weight: element.weight, length: element.length, width: element.width, height: element.height, status: element.status, installationZoneId: element.installationZoneId, installationZoneName: element.installationZoneName });

export default async function LoadEditorPage({ params }: { params: Promise<{ id: string; loadId: string }> }) {
  const { id, loadId } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canManageProjectLoads(user, id)) notFound();
  const load = getLoad(Number(loadId));
  if (!load || load.projectId !== id) notFound();
  if (load.status === "Cancelled") redirect(`/portal/projects/${id}/loads?view=cancelled`);
  const language = await getPortalLanguage();
  const t = (v: string) => portalText(language, v);
  const canApproveException = canApproveLoadException(user, id);

  // A received (Accepted) load is a frozen delivery record — show its receipt + derived
  // installation progress instead of the planning editor.
  if (load.status === "Accepted") {
    const receipt = getLoadReceipt(load.id);
    const progress = loadInstallationProgress(load.id);
    const elements = receipt ? listLoadReceiptElements(receipt.id) : [];
    return <PortalShell active="/portal/projects">
      <BackLink href={`/portal/projects/${id}/loads`} label={t("Back to delivery schedule")} />
      <PortalTopbar eyebrow={`${project.name} · ${t("Load planning")}`} title={`${t("Load")} ${load.loadNumber} · ${t("Received")}`} />
      <section className="os-panel">
        <div className="os-panel-head"><div><p>{t("Delivery").toUpperCase()}</p><h2>{load.acceptanceType === "with_discrepancies" ? t("Received with discrepancies") : t("Received as planned")}</h2></div><span className={`os-badge os-badge-${progress.fullyInstalled ? "installed" : "accepted"}`}>{progress.fullyInstalled ? t("Fully installed") : t("Accepted")}</span></div>
        <div className="os-load-summary">
          <div><span>{t("Received")}</span><strong>{progress.received}</strong></div>
          <div><span>{t("Installed")}</span><strong>{progress.installed} / {progress.received}</strong></div>
          <div><span>{t("On site")}</span><strong>{progress.onSite}</strong></div>
          <div><span>{t("Missing")}</span><strong>{progress.missing}</strong></div>
          <div><span>{t("Added")}</span><strong>{progress.added}</strong></div>
        </div>
        {receipt && <p className="os-form-hint">{t("Accepted by")} {receipt.acceptedBy || "—"} · {receipt.acceptedAt}{receipt.comment ? ` · ${receipt.comment}` : ""}</p>}
        <p className="os-form-hint">{t("Installation is finalized only through an approved Daily Report; this progress is derived from element status.")}</p>
        <div className="os-table-wrap"><table className="os-table">
          <thead><tr><th>{t("Element")}</th><th>{t("Type")}</th><th>{t("Disposition")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{elements.map((el) => <tr key={el.id}>
            <td data-label={t("Element")}><strong>{el.code}</strong></td>
            <td data-label={t("Type")}>{t(el.elementType)}</td>
            <td data-label={t("Disposition")}>{t(el.disposition === "missing" ? "Missing" : el.disposition === "added" ? "Added" : "Received")}</td>
            <td data-label={t("Status")}><span className={`os-badge os-badge-${el.status.toLowerCase().replace(/[^a-z]/g, "")}`}>{t(el.status)}</span></td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </PortalShell>;
  }

  const allocatedElsewhere = new Set(listActiveAllocatedElementIds(id, load.id));
  const available = listProjectElements(id).filter((element) => !allocatedElsewhere.has(element.id)).map(availMap);
  const initialElements = listLoadElements(load.id).map((row) => ({ id: row.elementId, elementId: row.elementId, code: row.code, elementType: row.elementType, floor: row.floor, zone: row.zone, weight: row.weight, length: row.length, width: row.width, height: row.height, status: row.status, orientation: row.orientation, intent: row.intent, note: row.note }));
  const profiles = listTransportProfiles().map((p) => ({ id: p.id, name: p.name, active: p.active, placeholder: p.placeholder, rank: p.rank, maxPayloadT: p.maxPayloadT, maxLengthMm: p.maxLengthMm, maxWidthMm: p.maxWidthMm, maxHeightMm: p.maxHeightMm, note: p.note }));
  const plannedForReceipt = load.status === "Planned" ? listLoadElements(load.id).map((row) => ({ elementId: row.elementId, code: row.code, elementType: row.elementType })) : [];

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}/loads`} label={t("Back to delivery schedule")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Load planning")}`} title={`${t("Load")} ${load.loadNumber}`} />
    <LoadEditor projectId={id} load={{ id: load.id, loadNumber: load.loadNumber, status: load.status, plannedDate: load.plannedDate, plannedTime: load.plannedTime, transportProfileId: load.transportProfileId, loadingDirection: load.loadingDirection, orientationNote: load.orientationNote, note: load.note, exceptionAck: load.exceptionAck, exceptionReason: load.exceptionReason, weekendAck: load.weekendAck }} initialElements={initialElements} available={available} profiles={profiles} canApproveException={canApproveException} language={language} action={saveLoadAction} />
    {load.status === "Planned" && !project.archivedAt && <LoadAcceptPanel projectId={id} loadId={load.id} planned={plannedForReceipt} availableToAdd={available.map((e) => ({ id: e.id, code: e.code, elementType: e.elementType, floor: e.floor, zone: e.zone }))} canApproveException={canApproveException} defaultDate={load.plannedDate} language={language} />}
  </PortalShell>;
}

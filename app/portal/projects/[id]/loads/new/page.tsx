import { notFound, redirect } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../../components/portal/BackLink";
import { LoadEditor } from "../../../../../../components/portal/LoadEditor";
import { requireUser } from "../../../../../../lib/auth";
import { canApproveLoadException, canManageProjectLoads } from "../../../../../../lib/permissions";
import { getProject, listActiveAllocatedElementIds, listProjectElements, listTransportProfiles, nextProjectLoadNumber } from "../../../../../../lib/repositories";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { portalText } from "../../../../../../data/portal-i18n";
import { saveLoadAction } from "../actions";

// A brand-new load. No DB row exists until the first successful save — abandoning this
// page persists nothing and consumes no load number.
export default async function NewLoadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; time?: string; transport?: string; direction?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canManageProjectLoads(user, id)) notFound();
  if (project.archivedAt) redirect(`/portal/projects/${id}/loads`);
  const language = await getPortalLanguage();
  const t = (v: string) => portalText(language, v);

  const allocated = new Set(listActiveAllocatedElementIds(id, 0));
  const available = listProjectElements(id).filter((element) => !allocated.has(element.id)).map((element) => ({ id: element.id, code: element.code, elementType: element.elementType, floor: element.floor, zone: element.zone, weight: element.weight, length: element.length, width: element.width, height: element.height, status: element.status, installationZoneId: element.installationZoneId, installationZoneName: element.installationZoneName }));
  const profiles = listTransportProfiles().map((p) => ({ id: p.id, name: p.name, active: p.active, placeholder: p.placeholder, rank: p.rank, maxPayloadT: p.maxPayloadT, maxLengthMm: p.maxLengthMm, maxWidthMm: p.maxWidthMm, maxHeightMm: p.maxHeightMm, note: p.note }));
  const previewNumber = nextProjectLoadNumber(id);
  const carryTransport = q.transport && profiles.some((p) => String(p.id) === q.transport) ? Number(q.transport) : null;
  const load = { id: 0, loadNumber: previewNumber, status: "Draft", plannedDate: q.date ?? "", plannedTime: q.time ?? "", transportProfileId: carryTransport, loadingDirection: q.direction === "reverse" ? "reverse" : "forward", orientationNote: "", note: "", exceptionAck: 0, exceptionReason: "", weekendAck: 0 };

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}/loads`} label={t("Back to delivery schedule")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Load planning")}`} title={`${t("New load")} · ${t("Load")} ${previewNumber}`} />
    <LoadEditor projectId={id} load={load} initialElements={[]} available={available} profiles={profiles} canApproveException={canApproveLoadException(user, id)} language={language} action={saveLoadAction} isNew />
  </PortalShell>;
}

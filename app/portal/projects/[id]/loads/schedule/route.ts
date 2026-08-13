import { requireUser } from "../../../../../../lib/auth";
import { canViewProjectLoads } from "../../../../../../lib/permissions";
import { getProject, listLoadElements, listProjectLoadSummaries, listTransportProfiles, logActivity } from "../../../../../../lib/repositories";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { deliveryScheduleFilename, generateDeliverySchedulePdf, type SchedulePdfLoad } from "../../../../../../lib/load-schedule-pdf";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = getProject(id);
  if (!project || !canViewProjectLoads(user, id)) return new Response("Not found", { status: 404 });

  const includeDrafts = new URL(request.url).searchParams.get("drafts") === "1";
  const profileName = new Map(listTransportProfiles().map((p) => [p.id, p.name]));
  // Pre-flight: operational schedule = Planned loads by default; Drafts only if explicitly requested (marked DRAFT).
  const summaries = listProjectLoadSummaries(id, false).filter((load) => load.status === "Planned" || (includeDrafts && load.status === "Draft"));
  const loads: SchedulePdfLoad[] = summaries.map((load) => ({
    loadNumber: load.loadNumber, status: load.status, plannedDate: load.plannedDate, plannedTime: load.plannedTime,
    loadingDirection: load.loadingDirection, note: load.note, orientationNote: load.orientationNote,
    exceptionAck: load.exceptionAck === 1, exceptionReason: load.exceptionReason,
    recommendedName: load.recommendedProfileId ? profileName.get(load.recommendedProfileId) ?? "" : "",
    selectedName: load.transportProfileId ? profileName.get(load.transportProfileId) ?? "" : "",
    totalWeightT: load.totalWeightT,
    elements: listLoadElements(load.id).map((row) => ({ code: row.code, elementType: row.elementType, floor: row.floor, installationZoneName: row.installationZoneName, weight: row.weight, length: row.length, width: row.width, height: row.height, orientation: row.orientation, intent: row.intent, note: row.note })),
  }));

  // The author is the authenticated user generating the schedule — never a client-supplied
  // value. logActivity keeps an immutable, timestamped audit snapshot (actor + createdAt) so
  // a later regeneration by another user cannot rewrite this generation's recorded author.
  const pdf = await generateDeliverySchedulePdf({ projectName: project.name, loads, language: await getPortalLanguage(), includedDrafts: includeDrafts, generatedBy: user.name });
  logActivity({ userId: user.id, actor: user.name, action: "Delivery schedule PDF generated", entityType: "project", entityId: id, details: `${loads.length} loads · ${user.name}` });
  const filename = deliveryScheduleFilename(project.name), ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.length), "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

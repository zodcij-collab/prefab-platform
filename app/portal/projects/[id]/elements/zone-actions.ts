"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../../lib/auth";
import { canManageProjectElements, canUpdateElementOperations } from "../../../../../lib/permissions";
import { assignElementsToInstallationZone, createInstallationZone, deleteInstallationZone, getProject, logActivity, renameInstallationZone, runTransaction } from "../../../../../lib/repositories";

const val = (data: FormData, key: string, max = 200) => String(data.get(key) ?? "").trim().slice(0, max);
function assertWritable(projectId: string) {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only. Restore the project first.");
}

// Installation zones are structural project metadata → require elements.manage.
export async function createInstallationZoneAction(data: FormData) {
  const user = await requireUser();
  const projectId = val(data, "projectId", 100);
  assertWritable(projectId);
  if (!canManageProjectElements(user, projectId)) throw new Error("You do not have permission to manage installation zones.");
  const name = val(data, "name", 120);
  if (!name) throw new Error("Installation zone name is required.");
  runTransaction(() => {
    const zoneId = createInstallationZone(projectId, name, val(data, "description", 500));
    logActivity({ userId: user.id, actor: user.name, action: "Installation zone created", entityType: "project", entityId: projectId, details: `${name} (#${zoneId})` });
  });
  revalidatePath(`/portal/projects/${projectId}/elements`);
}

export async function renameInstallationZoneAction(data: FormData) {
  const user = await requireUser();
  const projectId = val(data, "projectId", 100), zoneId = Number(val(data, "zoneId", 30));
  assertWritable(projectId);
  if (!canManageProjectElements(user, projectId)) throw new Error("You do not have permission to manage installation zones.");
  runTransaction(() => renameInstallationZone(zoneId, projectId, val(data, "name", 120), val(data, "description", 500)));
  revalidatePath(`/portal/projects/${projectId}/elements`);
}

export async function deleteInstallationZoneAction(data: FormData) {
  const user = await requireUser();
  const projectId = val(data, "projectId", 100), zoneId = Number(val(data, "zoneId", 30));
  assertWritable(projectId);
  if (!canManageProjectElements(user, projectId)) throw new Error("You do not have permission to manage installation zones.");
  runTransaction(() => {
    deleteInstallationZone(zoneId, projectId);
    logActivity({ userId: user.id, actor: user.name, action: "Installation zone deleted", entityType: "project", entityId: projectId, details: `#${zoneId}` });
  });
  revalidatePath(`/portal/projects/${projectId}/elements`);
}

// Bulk-assign (or clear) an installation zone on the selected elements → require
// elements.operate (operational grouping). Never touches element status or history.
export async function assignInstallationZoneAction(data: FormData) {
  const user = await requireUser();
  const projectId = val(data, "projectId", 100);
  assertWritable(projectId);
  if (!canUpdateElementOperations(user, projectId)) throw new Error("You do not have permission to assign installation zones.");
  const zoneRaw = val(data, "zoneId", 30), zoneId = zoneRaw ? Number(zoneRaw) : null;
  const ids = data.getAll("elementIds").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) throw new Error("No elements selected.");
  runTransaction(() => {
    const changed = assignElementsToInstallationZone(projectId, ids, zoneId);
    if (changed) logActivity({ userId: user.id, actor: user.name, action: "Installation zone assigned", entityType: "project", entityId: projectId, details: `${changed} elements · ${zoneId ? `zone #${zoneId}` : "cleared"}` });
  });
  revalidatePath(`/portal/projects/${projectId}/elements`);
}

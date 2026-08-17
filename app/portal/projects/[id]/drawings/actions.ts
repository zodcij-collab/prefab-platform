"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../../lib/auth";
import { canManageProjectIssues } from "../../../../../lib/permissions";
import { getProject, runTransaction } from "../../../../../lib/repositories";
import { clearIssueMarker, getIssue, removeIssueDrawingSnapshot, replaceIssueDrawingSnapshot, setIssueMarker } from "../../../../../lib/issues-repo";
import { removeStoredFile, storeSnapshotPng } from "../../../../../lib/storage";

const value = (data: FormData, key: string, max = 100) => String(data.get(key) ?? "").trim().slice(0, max);
async function authorize(data: FormData) {
  const user = await requireUser();
  const projectId = value(data, "projectId", 100);
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only. Restore the project first.");
  if (!canManageProjectIssues(user, projectId)) throw new Error("You do not have permission to change drawing markers.");
  return { user, projectId };
}
function issueId(data: FormData) { const id = Number(value(data, "issueId", 30)); if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid issue."); return id; }

// Set / move the marker on an EXISTING issue (same immutable record). Requires issues.manage.
export async function setIssueMarkerAction(data: FormData) {
  const { user, projectId } = await authorize(data);
  const id = issueId(data);
  const documentId = Number(value(data, "documentId", 30)), page = Number(value(data, "drawingPage", 10));
  const x = Number(value(data, "drawingX", 30)), y = Number(value(data, "drawingY", 30));
  const issue = getIssue(id);
  if (!issue || issue.projectId !== projectId) throw new Error("Issue not found.");
  // Optional best-effort visual crop captured client-side (a PNG data URL). Stored outside the
  // transaction (async file I/O); a missing/invalid snapshot is simply skipped — the marker is
  // authoritative and the Issue PDF falls back to the textual reference.
  const snapshot = await storeSnapshotPng(String(data.get("snapshot") ?? ""));
  let priorPaths: string[] = [];
  try {
    runTransaction(() => {
      setIssueMarker(id, projectId, { documentId, page, x, y }, user);
      if (snapshot) priorPaths = replaceIssueDrawingSnapshot(id, snapshot, user);
    });
  } catch (error) {
    if (snapshot) await removeStoredFile(snapshot.storedPath);
    throw error;
  }
  for (const p of priorPaths) await removeStoredFile(p);
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  revalidatePath(`/portal/projects/${projectId}/drawings/${documentId}`);
  redirect(`/portal/projects/${projectId}/drawings/${documentId}?page=${page}&issue=${id}`);
}

export async function clearIssueMarkerAction(data: FormData) {
  const { user, projectId } = await authorize(data);
  const id = issueId(data);
  let priorPaths: string[] = [];
  runTransaction(() => { clearIssueMarker(id, projectId, user); priorPaths = removeIssueDrawingSnapshot(id); });
  for (const p of priorPaths) await removeStoredFile(p);
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  redirect(`/portal/projects/${projectId}/issues/${id}?saved=1`);
}

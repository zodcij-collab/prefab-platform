"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { extname } from "node:path";
import { requireUser } from "../../../../../lib/auth";
import { canCaptureProjectIssues, canCommentProjectIssues, canManageProjectIssues } from "../../../../../lib/permissions";
import { getProject, runTransaction } from "../../../../../lib/repositories";
import { addIssueComment, addIssueMedia, assignIssue, cancelIssue, classifyIssue, closeIssue, createQuickCapture, getIssue, resolveIssue, setIssueStatus } from "../../../../../lib/issues-repo";
import { issueMediaKind, removeStoredFile, storeUpload } from "../../../../../lib/storage";
import { ISSUE_CAPTURE_MAX_FILES, isValidPriority, isValidType } from "../../../../../lib/issues";

export type CaptureState = { error: string };
const value = (data: FormData, key: string, max = 8000) => String(data.get(key) ?? "").trim().slice(0, max);

// Shared guard: authenticated, project exists, not archived, and the given capability holds.
async function authorize(data: FormData, check: (user: Awaited<ReturnType<typeof requireUser>>, projectId: string) => boolean) {
  const user = await requireUser();
  const projectId = value(data, "projectId", 100);
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only. Restore the project first.");
  if (!check(user, projectId)) throw new Error("You do not have permission for this action.");
  return { user, projectId };
}
// Store the uploaded media files (outside any DB transaction — file I/O is async), returning
// the stored descriptors. On any failure every already-stored file is removed.
async function storeIssueFiles(files: File[], role: "evidence" | "resolution") {
  const stored: Array<{ storedPath: string; role: string; kind: string; originalFilename: string; fileSize: number; mimeType: string }> = [];
  try {
    for (const file of files) {
      const result = await storeUpload(file, "issues");
      stored.push({ storedPath: result.storedPath, role, kind: issueMediaKind(extname(file.name)), originalFilename: file.name, fileSize: file.size, mimeType: file.type });
    }
  } catch (error) {
    for (const item of stored) await removeStoredFile(item.storedPath);
    throw error;
  }
  return stored;
}

// Quick site capture. Minimum friction: a short description and/or media. Persists only here
// (opening the form writes nothing). Returns {error} for recoverable errors so the on-site
// user does not lose typed text; redirects to the new issue on success.
export async function captureIssueAction(_state: CaptureState, data: FormData): Promise<CaptureState> {
  let projectId = "";
  try {
    const auth = await authorize(data, canCaptureProjectIssues);
    projectId = auth.projectId;
    const title = value(data, "title", 200);
    const details = value(data, "details", 8000);
    const intent = value(data, "intent", 20) === "Task" ? "Task" : "Defect";
    const files = data.getAll("media").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > ISSUE_CAPTURE_MAX_FILES) return { error: `You can attach at most ${ISSUE_CAPTURE_MAX_FILES} files per capture.` };
    if (!title && !details && !files.length) return { error: "Add a short description or at least one photo." };
    let stored;
    try { stored = await storeIssueFiles(files, "evidence"); } catch (error) { return { error: error instanceof Error ? error.message : "Media upload failed." }; }
    let issueId = 0;
    try {
      runTransaction(() => {
        issueId = createQuickCapture({ projectId, title: title || (details ? details.slice(0, 60) : ""), details, type: intent, actor: auth.user });
        for (const item of stored) addIssueMedia(issueId, projectId, { ...item, caption: "" }, auth.user);
      });
    } catch (error) {
      for (const item of stored) await removeStoredFile(item.storedPath);
      return { error: error instanceof Error ? error.message : "Could not save the capture." };
    }
    revalidatePath(`/portal/projects/${projectId}/issues`);
    redirect(`/portal/projects/${projectId}/issues/${issueId}?captured=1`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "Could not save the capture." };
  }
}

function issueId(data: FormData) { const id = Number(value(data, "issueId", 30)); if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid issue."); return id; }

// Classification is an explicit-save client form (useActionState). It revalidates IN PLACE
// (no redirect) and returns {error,saved} — so a recoverable validation error keeps the typed
// values, and saving never navigates away. Sibling actions likewise never navigate, so
// unsaved classification input is preserved across an Assign/Status/Comment/Media action.
export type ClassifyState = { error: string; saved: boolean };
export async function classifyIssueFormAction(_state: ClassifyState, data: FormData): Promise<ClassifyState> {
  try {
    const { user, projectId } = await authorize(data, canManageProjectIssues);
    const id = issueId(data);
    const type = value(data, "type", 40), priority = value(data, "priority", 20);
    if (!isValidType(type) || !isValidPriority(priority)) return { error: "Invalid classification.", saved: false };
    const zoneRaw = value(data, "installationZoneId", 30), elementRaw = value(data, "elementId", 30);
    runTransaction(() => classifyIssue(id, projectId, { type, title: value(data, "title", 200), details: value(data, "details", 8000), priority, installationZoneId: zoneRaw ? Number(zoneRaw) : null, elementId: elementRaw ? Number(elementRaw) : null, dueDate: value(data, "dueDate", 10) }, user));
    revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
    revalidatePath(`/portal/projects/${projectId}/issues`);
    return { error: "", saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save classification.", saved: false };
  }
}

export async function assignIssueAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectIssues);
  const id = issueId(data);
  const employeeId = value(data, "assignedToId", 60) || null;
  runTransaction(() => assignIssue(id, projectId, employeeId, user));
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  revalidatePath(`/portal/projects/${projectId}/issues`);
}

export async function statusIssueAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectIssues);
  const id = issueId(data);
  runTransaction(() => setIssueStatus(id, projectId, value(data, "status", 20), user));
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  revalidatePath(`/portal/projects/${projectId}/issues`);
}

// Resolve with a mandatory description and optional 'after' media (before/after evidence).
export async function resolveIssueAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectIssues);
  const id = issueId(data);
  const resolution = value(data, "resolution", 8000);
  if (!resolution) throw new Error("A resolution description is required.");
  const files = data.getAll("media").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > ISSUE_CAPTURE_MAX_FILES) throw new Error(`You can attach at most ${ISSUE_CAPTURE_MAX_FILES} files.`);
  const stored = await storeIssueFiles(files, "resolution");
  try {
    runTransaction(() => {
      for (const item of stored) addIssueMedia(id, projectId, { ...item, caption: "" }, user);
      resolveIssue(id, projectId, resolution, user);
    });
  } catch (error) {
    for (const item of stored) await removeStoredFile(item.storedPath);
    throw error;
  }
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  revalidatePath(`/portal/projects/${projectId}/issues`);
}

export async function closeIssueAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectIssues);
  const id = issueId(data);
  runTransaction(() => closeIssue(id, projectId, user));
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  revalidatePath(`/portal/projects/${projectId}/issues`);
}

export async function cancelIssueAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectIssues);
  const id = issueId(data);
  const reason = value(data, "reason", 2000);
  if (!reason) throw new Error("A cancellation reason is required.");
  runTransaction(() => cancelIssue(id, projectId, reason, user));
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  revalidatePath(`/portal/projects/${projectId}/issues`);
}

export async function commentIssueAction(data: FormData) {
  const { user, projectId } = await authorize(data, canCommentProjectIssues);
  const id = issueId(data);
  const text = value(data, "comment", 4000);
  if (!text) throw new Error("A comment cannot be empty.");
  runTransaction(() => addIssueComment(id, projectId, text, user));
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
}

// Add more evidence media to an existing issue (one or more files).
export async function addIssueMediaAction(data: FormData) {
  const { user, projectId } = await authorize(data, canCaptureProjectIssues);
  const id = issueId(data);
  const role = value(data, "role", 20) === "resolution" ? "resolution" : "evidence";
  const files = data.getAll("media").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Select at least one file.");
  if (files.length > ISSUE_CAPTURE_MAX_FILES) throw new Error(`You can attach at most ${ISSUE_CAPTURE_MAX_FILES} files.`);
  if (!getIssue(id)) throw new Error("Issue not found.");
  const stored = await storeIssueFiles(files, role);
  try {
    runTransaction(() => { for (const item of stored) addIssueMedia(id, projectId, { ...item, caption: "" }, user); });
  } catch (error) {
    for (const item of stored) await removeStoredFile(item.storedPath);
    throw error;
  }
  revalidatePath(`/portal/projects/${projectId}/issues/${id}`);
  revalidatePath(`/portal/projects/${projectId}/issues`);
}

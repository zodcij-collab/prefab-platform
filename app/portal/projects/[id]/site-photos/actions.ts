"use server";
import { revalidatePath } from "next/cache";
import { extname } from "node:path";
import { requireUser } from "../../../../../lib/auth";
import { canCaptureSitePhotos } from "../../../../../lib/permissions";
import { getInstallationZone, getProject, getProjectPhoto } from "../../../../../lib/repositories";
import { addSitePhoto, setPhotoIncludeInDaily, updateSitePhoto } from "../../../../../lib/daily-ops-repo";
import { removeStoredFile, storeUpload } from "../../../../../lib/storage";
import { runSave, type SaveState } from "../../../../../lib/form-state";

const clean = (data: FormData, key: string, max = 500) => String(data.get(key) ?? "").trim().slice(0, max);
async function authorize(data: FormData) {
  const user = await requireUser();
  const projectId = clean(data, "projectId", 100);
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only.");
  if (!canCaptureSitePhotos(user, projectId)) throw new Error("You do not have permission to capture site photos.");
  return { user, projectId };
}
// Revalidate the current page IN PLACE — never redirect() from a multipart file-upload server
// action. A redirect response races the still-streaming request body and the browser aborts it
// (net::ERR_ABORTED), leaving the page hung indefinitely. The form is already on this page, so
// revalidatePath re-renders it with the new photo (the pattern used by every other upload action).
const back = (projectId: string) => revalidatePath(`/portal/projects/${projectId}/site-photos`);
// A checkbox posts its value only when checked, so inclusion is presence of "1" — an unchecked box
// is absent and must read as excluded (previously "!== 0" wrongly kept it included when unchecked).
const isIncluded = (data: FormData) => clean(data, "includeInDaily", 5) === "1";
// Resolve the Zone/Floor: a chosen saved zone (scoped to this project & active) wins and its name is
// mirrored into `area`; otherwise keep the free-text `area`. Shared by capture and edit.
function resolveZone(data: FormData, projectId: string): { area: string; installationZoneId: number | null } {
  const area = clean(data, "area", 120);
  const zoneRaw = clean(data, "installationZoneId", 20);
  if (zoneRaw) {
    const zone = getInstallationZone(Number(zoneRaw));
    if (zone && zone.projectId === projectId && zone.active) return { area: zone.name, installationZoneId: zone.id };
  }
  return { area, installationZoneId: null };
}

export async function captureSitePhotoAction(data: FormData) {
  const { user, projectId } = await authorize(data);
  const file = data.get("photo");
  if (!(file instanceof File) || file.size <= 0) throw new Error("Select a photo.");
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(extname(file.name).toLowerCase())) throw new Error("The file must be an image.");
  const stored = await storeUpload(file, "photos");
  try {
    const issueRaw = clean(data, "issueId", 20);
    const { area, installationZoneId } = resolveZone(data, projectId);
    addSitePhoto({ projectId, photoDate: clean(data, "photoDate", 10) || new Date().toISOString().slice(0, 10), area, caption: clean(data, "caption", 500), author: user.name, originalFilename: file.name, storedPath: stored.storedPath, fileSize: file.size, mimeType: file.type, includeInDaily: isIncluded(data), issueId: issueRaw ? Number(issueRaw) : null, installationZoneId, uploadedById: user.id }, user);
  } catch (e) { await removeStoredFile(stored.storedPath); throw e; }
  back(projectId);
}
export async function togglePhotoIncludeAction(data: FormData) {
  const { user, projectId } = await authorize(data);
  setPhotoIncludeInDaily(Number(clean(data, "photoId", 20)), clean(data, "include", 5) === "1", user);
  back(projectId);
}
// Edit an existing site photo's metadata + Daily Report inclusion (the "Save changes" button in the
// photo lightbox). The stored image file is never modified — only its metadata row. Project-scoped.
export async function updateSitePhotoAction(data: FormData) {
  const { user, projectId } = await authorize(data);
  const photoId = Number(clean(data, "photoId", 20));
  const photo = getProjectPhoto(photoId);
  if (!photo || photo.projectId !== projectId) throw new Error("Photo not found.");
  const { area, installationZoneId } = resolveZone(data, projectId);
  updateSitePhoto(photoId, projectId, { photoDate: clean(data, "photoDate", 10) || photo.photoDate, area, caption: clean(data, "caption", 500), includeInDaily: isIncluded(data), installationZoneId }, user);
  back(projectId);
}
// State-returning wrapper for the SaveForm primitive (SAVE → SAVING… → ✓ Changes saved / error).
export async function updateSitePhotoFormAction(_state: SaveState, data: FormData): Promise<SaveState> {
  return runSave(() => updateSitePhotoAction(data));
}

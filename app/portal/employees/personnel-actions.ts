"use server";
import { revalidatePath } from "next/cache";
import { extname } from "node:path";
import { requireUser } from "../../../lib/auth";
import { canManagePersonnel, canManagePersonnelDocuments, canManageWorkwear } from "../../../lib/permissions";
import { getEmployee } from "../../../lib/repositories";
import { addOneYear, DEFAULT_OFFBOARDING_ITEMS, isValidSeverity, offboardingUnresolvedCount } from "../../../lib/personnel";
import { addEmployeeDocument, addEmployeeOvp, addEmployeeQualification, addSafetyRecord, completeOffboarding, getEmployeeDocumentById, getOffboardingById, listOffboardingItems, removeEmployeeDocument, removeEmployeeQualification, setEmployeePhoto, setEmployeeSkills, startOffboarding, updateEmployeeOvp, updateEmployeeProfile, updateEmployeeQualification, updateEmployeeWorkwear, updateOffboardingItem } from "../../../lib/personnel-repo";
import { removeStoredFile, storeUpload } from "../../../lib/storage";
import { runSave, type SaveState } from "../../../lib/form-state";

const clean = (data: FormData, key: string, max = 500) => String(data.get(key) ?? "").trim().slice(0, max);
async function manager() { const user = await requireUser(); if (!canManagePersonnel(user)) throw new Error("You do not have permission to manage personnel."); return user; }
async function workwearManager() { const user = await requireUser(); if (!canManageWorkwear(user)) throw new Error("You do not have permission to manage workwear sizes."); return user; }
async function docManager() { const user = await requireUser(); if (!canManagePersonnelDocuments(user)) throw new Error("You do not have permission to manage personnel documents."); return user; }
function employee(data: FormData) { const id = clean(data, "employeeId", 100); if (!getEmployee(id)) throw new Error("Employee not found."); return id; }
const revalidate = (id: string) => revalidatePath(`/portal/employees/${id}`);

export async function updateEmployeeProfileAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  updateEmployeeProfile(id, { dateOfBirth: clean(data, "dateOfBirth", 10), personalCode: clean(data, "personalCode", 40), emergencyContact: clean(data, "emergencyContact", 120), emergencyContactPhone: clean(data, "emergencyContactPhone", 60), jacketSize: clean(data, "jacketSize", 20), trousersSize: clean(data, "trousersSize", 20), shoeSize: clean(data, "shoeSize", 20) }, user);
  revalidate(id);
}
// State-returning wrapper for the SaveForm primitive (employee profile edit revalidates in place).
export async function updateEmployeeProfileFormAction(_state: SaveState, data: FormData): Promise<SaveState> {
  return runSave(() => updateEmployeeProfileAction(data));
}
// Operational workwear sizing — editable by Foreman+ (canManageWorkwear). Updates ONLY the three
// size columns via a workwear-only repo path, so it can never reach sensitive HR fields even if
// extra fields were posted. Scope is the same as personnel visibility.
export async function updateWorkwearAction(data: FormData) {
  const user = await workwearManager(); const id = employee(data);
  updateEmployeeWorkwear(id, { jacketSize: clean(data, "jacketSize", 20), trousersSize: clean(data, "trousersSize", 20), shoeSize: clean(data, "shoeSize", 20) }, user);
  revalidate(id);
}
export async function updateWorkwearFormAction(_state: SaveState, data: FormData): Promise<SaveState> {
  return runSave(() => updateWorkwearAction(data));
}
export async function setSkillsAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  const skills = String(data.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  setEmployeeSkills(id, skills, user); revalidate(id);
}
export async function addOvpAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  const examDate = clean(data, "examDate", 10);
  const validUntil = clean(data, "validUntil", 10) || (examDate ? addOneYear(examDate) : "");
  const file = data.get("document"); let stored: { storedPath: string } | null = null;
  if (file instanceof File && file.size > 0) stored = await storeUpload(file, "documents");
  try {
    const ovpId = addEmployeeOvp(id, { examDate, validUntil, provider: clean(data, "provider", 160), comment: clean(data, "comment", 1000) }, user);
    if (stored && file instanceof File) addEmployeeDocument(id, { relationType: "ovp", relationId: ovpId, title: "OVP", originalFilename: file.name, storedPath: stored.storedPath, fileSize: file.size, mimeType: file.type }, user);
  } catch (e) { if (stored) await removeStoredFile(stored.storedPath); throw e; }
  revalidate(id);
}
export async function updateOvpAction(data: FormData) {
  const user = await manager(); const id = employee(data); const ovpId = Number(clean(data, "ovpId", 20));
  const examDate = clean(data, "examDate", 10);
  updateEmployeeOvp(ovpId, { examDate, validUntil: clean(data, "validUntil", 10) || (examDate ? addOneYear(examDate) : ""), provider: clean(data, "provider", 160), comment: clean(data, "comment", 1000) }, user);
  revalidate(id);
}
export async function addQualificationAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  const file = data.get("document"); let stored: { storedPath: string } | null = null;
  if (file instanceof File && file.size > 0) stored = await storeUpload(file, "documents");
  try {
    const qid = addEmployeeQualification(id, { category: clean(data, "category", 60), customTitle: clean(data, "customTitle", 120), certNumber: clean(data, "certNumber", 80), organization: clean(data, "organization", 160), issueDate: clean(data, "issueDate", 10), validUntil: clean(data, "validUntil", 10), comment: clean(data, "comment", 1000) }, user);
    if (stored && file instanceof File) addEmployeeDocument(id, { relationType: "qualification", relationId: qid, title: clean(data, "category", 60), originalFilename: file.name, storedPath: stored.storedPath, fileSize: file.size, mimeType: file.type }, user);
  } catch (e) { if (stored) await removeStoredFile(stored.storedPath); throw e; }
  revalidate(id);
}
export async function updateQualificationAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  updateEmployeeQualification(Number(clean(data, "qualificationId", 20)), { category: clean(data, "category", 60), customTitle: clean(data, "customTitle", 120), certNumber: clean(data, "certNumber", 80), organization: clean(data, "organization", 160), issueDate: clean(data, "issueDate", 10), validUntil: clean(data, "validUntil", 10), comment: clean(data, "comment", 1000) }, user);
  revalidate(id);
}
export async function removeQualificationAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  removeEmployeeQualification(Number(clean(data, "qualificationId", 20)), user); revalidate(id);
}
export async function uploadEmployeeDocumentAction(data: FormData) {
  const user = await docManager(); const id = employee(data);
  const file = data.get("document"); if (!(file instanceof File) || file.size <= 0) throw new Error("Select a document to upload.");
  const stored = await storeUpload(file, "documents");
  try { addEmployeeDocument(id, { relationType: clean(data, "relationType", 20) || "general", relationId: null, title: clean(data, "title", 160) || file.name, originalFilename: file.name, storedPath: stored.storedPath, fileSize: file.size, mimeType: file.type }, user); }
  catch (e) { await removeStoredFile(stored.storedPath); throw e; }
  revalidate(id);
}
export async function removeEmployeeDocumentAction(data: FormData) {
  const user = await docManager(); const id = employee(data);
  const docId = Number(clean(data, "documentId", 20)); const doc = getEmployeeDocumentById(docId);
  if (doc && doc.employeeId === id) { const path = removeEmployeeDocument(docId, user); if (path) await removeStoredFile(path); }
  revalidate(id);
}
export async function uploadEmployeePhotoAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  const file = data.get("photo"); if (!(file instanceof File) || file.size <= 0) throw new Error("Select a photo.");
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(extname(file.name).toLowerCase())) throw new Error("The photo must be an image.");
  const stored = await storeUpload(file, "photos");
  try { setEmployeePhoto(id, stored.storedPath, file.type, user); } catch (e) { await removeStoredFile(stored.storedPath); throw e; }
  revalidate(id);
}
export async function addSafetyRecordAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  const severity = clean(data, "severity", 20); if (!isValidSeverity(severity)) throw new Error("Select a valid severity.");
  const file = data.get("document"); let stored: { storedPath: string } | null = null;
  if (file instanceof File && file.size > 0) stored = await storeUpload(file, "documents");
  try {
    addSafetyRecord({ employeeId: id, projectId: clean(data, "projectId", 100), occurredAt: clean(data, "occurredAt", 20), category: clean(data, "category", 80), severity, description: clean(data, "description", 2000), actionTaken: clean(data, "actionTaken", 2000) }, user);
    if (stored && file instanceof File) addEmployeeDocument(id, { relationType: "safety", relationId: null, title: "Safety evidence", originalFilename: file.name, storedPath: stored.storedPath, fileSize: file.size, mimeType: file.type }, user);
  } catch (e) { if (stored) await removeStoredFile(stored.storedPath); throw e; }
  revalidate(id);
}
export async function startOffboardingAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  startOffboarding(id, DEFAULT_OFFBOARDING_ITEMS, user); revalidate(id);
}
export async function updateOffboardingItemAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  updateOffboardingItem(Number(clean(data, "itemId", 20)), clean(data, "state", 20), clean(data, "comment", 1000), user); revalidate(id);
}
export async function completeOffboardingAction(data: FormData) {
  const user = await manager(); const id = employee(data);
  const offboardingId = Number(clean(data, "offboardingId", 20));
  const ob = getOffboardingById(offboardingId); if (!ob || ob.employeeId !== id) throw new Error("Offboarding not found.");
  const unresolved = offboardingUnresolvedCount(listOffboardingItems(offboardingId));
  completeOffboarding(offboardingId, { terminationDate: clean(data, "terminationDate", 10), reason: clean(data, "reason", 80), reasonComment: clean(data, "reasonComment", 1000), unresolved }, user);
  revalidate(id);
}

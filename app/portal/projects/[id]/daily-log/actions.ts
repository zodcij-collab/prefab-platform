"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../../lib/auth";
import { canConfirmDailyLog, canCreateDailyLog, canManageProjectAttendance } from "../../../../../lib/permissions";
import { getProject } from "../../../../../lib/repositories";
import { confirmDailyLog, getOrCreateDailyLog, markCrewPresent, removeAttendance, reopenDailyLog, setDailyLogShift, updateDailyLogFields, upsertAttendance } from "../../../../../lib/daily-ops-repo";
import { isValidAttendanceStatus } from "../../../../../lib/daily-ops";
import { listProjectAssignedEmployees as listAssigned } from "../../../../../lib/personnel-repo";
import { runSave, type SaveState } from "../../../../../lib/form-state";

const clean = (data: FormData, key: string, max = 500) => String(data.get(key) ?? "").trim().slice(0, max);
async function authorize(data: FormData, check: (u: Awaited<ReturnType<typeof requireUser>>, p: string) => boolean) {
  const user = await requireUser();
  const projectId = clean(data, "projectId", 100);
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only.");
  if (!check(user, projectId)) throw new Error("You do not have permission for this action.");
  return { user, projectId };
}
const back = (projectId: string, date: string) => { revalidatePath(`/portal/projects/${projectId}/daily-log`); redirect(`/portal/projects/${projectId}/daily-log?date=${date}`); };
function logId(data: FormData) { const id = Number(clean(data, "dailyLogId", 20)); if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid daily log."); return id; }

export async function openDailyLogAction(data: FormData) {
  const { user, projectId } = await authorize(data, canCreateDailyLog);
  const date = clean(data, "date", 10) || new Date().toISOString().slice(0, 10);
  getOrCreateDailyLog(projectId, date, user); back(projectId, date);
}
export async function setShiftAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectAttendance);
  setDailyLogShift(logId(data), clean(data, "shiftStart", 5), clean(data, "shiftEnd", 5), user); back(projectId, clean(data, "date", 10));
}
export async function markAllPresentAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectAttendance);
  const ids = listAssigned(projectId, true).map((a) => a.employeeId);
  markCrewPresent(logId(data), ids, user); back(projectId, clean(data, "date", 10));
}
export async function upsertAttendanceAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectAttendance);
  const status = clean(data, "status", 20); if (!isValidAttendanceStatus(status)) throw new Error("Invalid attendance status.");
  upsertAttendance(logId(data), clean(data, "employeeId", 100), { status, startTime: clean(data, "startTime", 5), endTime: clean(data, "endTime", 5), comment: clean(data, "comment", 500) }, user);
  back(projectId, clean(data, "date", 10));
}
export async function removeAttendanceAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectAttendance);
  removeAttendance(logId(data), clean(data, "employeeId", 100), user); back(projectId, clean(data, "date", 10));
}
export async function updateDailyLogFieldsAction(data: FormData) {
  const { user, projectId } = await authorize(data, canCreateDailyLog);
  updateDailyLogFields(logId(data), { workPerformed: clean(data, "workPerformed", 8000), delays: clean(data, "delays", 4000), delayReason: clean(data, "delayReason", 2000), siteEvents: clean(data, "siteEvents", 4000), equipmentNote: clean(data, "equipmentNote", 2000), materialsNote: clean(data, "materialsNote", 2000), foremanComment: clean(data, "foremanComment", 4000) }, user);
  back(projectId, clean(data, "date", 10));
}
// State-returning wrapper for the SaveForm primitive. Ordinary manual-field saves stay IN PLACE
// (revalidate only, no redirect) so the SaveForm can show ✓ Changes saved without navigating.
// Confirm/Reopen are intentionally NOT this — their lifecycle messaging stays distinct.
export async function updateDailyLogFieldsFormAction(_state: SaveState, data: FormData): Promise<SaveState> {
  return runSave(async () => {
    const { user, projectId } = await authorize(data, canCreateDailyLog);
    updateDailyLogFields(logId(data), { workPerformed: clean(data, "workPerformed", 8000), delays: clean(data, "delays", 4000), delayReason: clean(data, "delayReason", 2000), siteEvents: clean(data, "siteEvents", 4000), equipmentNote: clean(data, "equipmentNote", 2000), materialsNote: clean(data, "materialsNote", 2000), foremanComment: clean(data, "foremanComment", 4000) }, user);
    revalidatePath(`/portal/projects/${projectId}/daily-log`);
  });
}
export async function confirmDailyLogAction(data: FormData) {
  const { user, projectId } = await authorize(data, canConfirmDailyLog);
  confirmDailyLog(logId(data), user); back(projectId, clean(data, "date", 10));
}
export async function reopenDailyLogAction(data: FormData) {
  const { user, projectId } = await authorize(data, canConfirmDailyLog);
  reopenDailyLog(logId(data), user); back(projectId, clean(data, "date", 10));
}

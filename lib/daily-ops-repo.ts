// Sprint 15 — Daily Site Operations V1: DB repository.
// The Daily Log AGGREGATES facts already in PREFAB.LV (attendance, installed elements, loads,
// issues, safety, site photos). DRAFT reflects live facts; CONFIRMED persists an immutable JSON
// snapshot so the historical report never changes when live data later changes. Site attendance
// is the operational source (shift + man-hours, no payroll) — kept factually clean so it can
// later converge with the timesheet source without requiring double entry.
import { db } from "./db.ts";
import { getProject, logActivity } from "./repositories.ts";
import { listIssues } from "./issues-repo.ts";
import { computeWorkedHours, attendanceRollup, type DailyLogSnapshot } from "./daily-ops.ts";
import { OPEN_STATUSES } from "./issues.ts";

type Actor = { id: number; name: string };

export type DailyLog = {
  id: number; projectId: string; logDate: string; status: string; shiftStart: string; shiftEnd: string;
  workPerformed: string; delays: string; delayReason: string; siteEvents: string; equipmentNote: string;
  materialsNote: string; foremanComment: string; responsibleUserId: number | null; responsibleName: string;
  snapshotJson: string; createdBy: string; createdAt: string; confirmedBy: string; confirmedAt: string;
};
const LOG_COLS = `id,project_id AS projectId,log_date AS logDate,status,shift_start AS shiftStart,shift_end AS shiftEnd,work_performed AS workPerformed,delays,delay_reason AS delayReason,site_events AS siteEvents,equipment_note AS equipmentNote,materials_note AS materialsNote,foreman_comment AS foremanComment,responsible_user_id AS responsibleUserId,responsible_name AS responsibleName,snapshot_json AS snapshotJson,created_by AS createdBy,created_at AS createdAt,confirmed_by AS confirmedBy,confirmed_at AS confirmedAt`;

export function getDailyLog(projectId: string, logDate: string): DailyLog | undefined {
  return db.prepare(`SELECT ${LOG_COLS} FROM daily_logs WHERE project_id=? AND log_date=?`).get(projectId, logDate) as DailyLog | undefined;
}
export function getDailyLogById(id: number): DailyLog | undefined {
  return db.prepare(`SELECT ${LOG_COLS} FROM daily_logs WHERE id=?`).get(id) as DailyLog | undefined;
}
export function listDailyLogs(projectId: string): DailyLog[] {
  return db.prepare(`SELECT ${LOG_COLS} FROM daily_logs WHERE project_id=? ORDER BY log_date DESC, id DESC`).all(projectId) as DailyLog[];
}
// One log per (project, date). Opening a project's day materialises a Draft (idempotent).
export function getOrCreateDailyLog(projectId: string, logDate: string, actor: Actor): DailyLog {
  const existing = getDailyLog(projectId, logDate);
  if (existing) return existing;
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  db.prepare("INSERT INTO daily_logs(project_id,log_date,status,responsible_user_id,responsible_name,created_by_id,created_by) VALUES(?,?,?,?,?,?,?)")
    .run(projectId, logDate, "Draft", actor.id, actor.name, actor.id, actor.name);
  logActivity({ userId: actor.id, actor: actor.name, action: "Daily log opened", entityType: "project", entityId: projectId, details: logDate });
  return getDailyLog(projectId, logDate)!;
}
function assertDraft(log: DailyLog) { if (log.status === "Confirmed") throw new Error("This daily log is confirmed and read-only. Reopen it to edit."); }

export function updateDailyLogFields(id: number, fields: { workPerformed: string; delays: string; delayReason: string; siteEvents: string; equipmentNote: string; materialsNote: string; foremanComment: string }, actor: Actor) {
  const log = getDailyLogById(id); if (!log) throw new Error("Daily log not found."); assertDraft(log);
  db.prepare("UPDATE daily_logs SET work_performed=?,delays=?,delay_reason=?,site_events=?,equipment_note=?,materials_note=?,foreman_comment=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(fields.workPerformed, fields.delays, fields.delayReason, fields.siteEvents, fields.equipmentNote, fields.materialsNote, fields.foremanComment, id);
  void actor;
}
export function setDailyLogShift(id: number, start: string, end: string, actor: Actor) {
  const log = getDailyLogById(id); if (!log) throw new Error("Daily log not found."); assertDraft(log);
  db.prepare("UPDATE daily_logs SET shift_start=?,shift_end=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(start, end, id);
  void actor;
}

// ── Attendance (per daily log) ───────────────────────────────────────────────
export type AttendanceEntry = { id: number; dailyLogId: number; employeeId: string; employeeName: string; status: string; startTime: string; endTime: string; workedHours: number; comment: string };
export function listDailyLogAttendance(dailyLogId: number): AttendanceEntry[] {
  return db.prepare(`SELECT a.id,a.daily_log_id AS dailyLogId,a.employee_id AS employeeId,TRIM(e.first_name||' '||e.last_name) AS employeeName,a.status,a.start_time AS startTime,a.end_time AS endTime,a.worked_hours AS workedHours,a.comment FROM daily_log_attendance a JOIN employees e ON e.id=a.employee_id WHERE a.daily_log_id=? ORDER BY employeeName`).all(dailyLogId) as AttendanceEntry[];
}
export function upsertAttendance(dailyLogId: number, employeeId: string, input: { status: string; startTime: string; endTime: string; comment: string }, actor: Actor) {
  const log = getDailyLogById(dailyLogId); if (!log) throw new Error("Daily log not found."); assertDraft(log);
  const worked = computeWorkedHours({ status: input.status, startTime: input.startTime, endTime: input.endTime }, { start: log.shiftStart, end: log.shiftEnd });
  db.prepare(`INSERT INTO daily_log_attendance(daily_log_id,employee_id,status,start_time,end_time,worked_hours,comment) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(daily_log_id,employee_id) DO UPDATE SET status=excluded.status,start_time=excluded.start_time,end_time=excluded.end_time,worked_hours=excluded.worked_hours,comment=excluded.comment,updated_at=CURRENT_TIMESTAMP`)
    .run(dailyLogId, employeeId, input.status, input.startTime, input.endTime, worked, input.comment);
  void actor;
}
// Fast "mark all present": every given employee not yet recorded gets Present + the crew shift.
export function markCrewPresent(dailyLogId: number, employeeIds: string[], actor: Actor): number {
  const log = getDailyLogById(dailyLogId); if (!log) throw new Error("Daily log not found."); assertDraft(log);
  const worked = computeWorkedHours({ status: "Present" }, { start: log.shiftStart, end: log.shiftEnd });
  const insert = db.prepare("INSERT OR IGNORE INTO daily_log_attendance(daily_log_id,employee_id,status,worked_hours) VALUES(?,?,?,?)");
  let n = 0; for (const id of employeeIds) n += Number(insert.run(dailyLogId, id, "Present", worked).changes);
  logActivity({ userId: actor.id, actor: actor.name, action: "Crew marked present", entityType: "project", entityId: log.projectId, details: `${n} added · ${log.logDate}` });
  return n;
}
export function removeAttendance(dailyLogId: number, employeeId: string, actor: Actor) {
  const log = getDailyLogById(dailyLogId); if (!log) throw new Error("Daily log not found."); assertDraft(log);
  db.prepare("DELETE FROM daily_log_attendance WHERE daily_log_id=? AND employee_id=?").run(dailyLogId, employeeId);
  void actor;
}

// ── Live aggregation → snapshot shape ────────────────────────────────────────
// Builds the Daily Log content from existing PREFAB.LV facts. Used for the DRAFT view and, at
// confirmation, frozen into snapshot_json. Photos are referenced by id (one media fact, never a
// duplicated binary).
export function aggregateDailyLog(log: DailyLog): DailyLogSnapshot {
  const project = getProject(log.projectId);
  const attendance = listDailyLogAttendance(log.id);
  const roll = attendanceRollup(attendance.map((a) => ({ status: a.status, workedHours: a.workedHours })));
  const installed = db.prepare("SELECT code,element_type AS elementType,COALESCE(zone,'') AS zone FROM project_elements WHERE project_id=? AND installation_date=? AND status='Installed' AND active=1 ORDER BY code").all(log.projectId, log.logDate) as { code: string; elementType: string; zone: string }[];
  const zones = [...new Set(installed.map((e) => e.zone).filter(Boolean))];
  const deliveries = (db.prepare("SELECT load_number AS loadNumber,status FROM loads WHERE project_id=? AND planned_date=? ORDER BY load_number").all(log.projectId, log.logDate) as { loadNumber: number; status: string }[]).map((l) => ({ loadNumber: l.loadNumber, status: l.status, supplier: "", plannedDate: log.logDate }));
  const openIssues = listIssues(log.projectId, {}).filter((i) => OPEN_STATUSES.includes(i.status as (typeof OPEN_STATUSES)[number]));
  const defects = openIssues.filter((i) => i.type !== "Task").map((i) => ({ issueNumber: i.issueNumber, title: i.title, status: i.status, priority: i.priority }));
  const tasks = openIssues.filter((i) => i.type === "Task").map((i) => ({ issueNumber: i.issueNumber, title: i.title, status: i.status, priority: i.priority }));
  const critical = openIssues.filter((i) => i.priority === "Critical").map((i) => ({ issueNumber: i.issueNumber, title: i.title, status: i.status }));
  const safety = (db.prepare("SELECT TRIM(e.first_name||' '||e.last_name) AS employee,r.severity,r.category,r.description FROM employee_safety_records r JOIN employees e ON e.id=r.employee_id WHERE r.project_id=? AND substr(r.occurred_at,1,10)=? ORDER BY r.id").all(log.projectId, log.logDate) as { employee: string; severity: string; category: string; description: string }[]);
  const photos = (db.prepare("SELECT id,caption,area FROM project_photos WHERE project_id=? AND photo_date=? AND include_in_daily=1 ORDER BY id").all(log.projectId, log.logDate) as { id: number; caption: string; area: string }[]);
  const weatherRow = db.prepare("SELECT weather FROM reports WHERE project_id=? AND report_date=? AND weather<>'' ORDER BY id DESC LIMIT 1").get(log.projectId, log.logDate) as { weather: string } | undefined;
  return {
    version: 1, projectId: log.projectId, projectName: project?.name ?? log.projectId, logDate: log.logDate,
    shift: { start: log.shiftStart, end: log.shiftEnd }, responsible: log.responsibleName,
    manual: { workPerformed: log.workPerformed, delays: log.delays, delayReason: log.delayReason, siteEvents: log.siteEvents, equipmentNote: log.equipmentNote, materialsNote: log.materialsNote, foremanComment: log.foremanComment },
    workforce: { present: roll.present, absent: roll.absent, manHours: roll.manHours, crew: attendance.map((a) => ({ name: a.employeeName, status: a.status, startTime: a.startTime, endTime: a.endTime, workedHours: a.workedHours })) },
    installedElements: installed, zones, deliveries, defects, tasks, critical, safety, photos,
    weather: weatherRow?.weather ?? "", confirmedBy: log.confirmedBy, confirmedAt: log.confirmedAt,
  };
}
// The snapshot that drives a report/PDF: the frozen JSON for a confirmed log, else the live one.
export function dailyLogSnapshot(log: DailyLog): DailyLogSnapshot {
  if (log.status === "Confirmed" && log.snapshotJson) {
    try { return JSON.parse(log.snapshotJson) as DailyLogSnapshot; } catch { /* fall through to live */ }
  }
  return aggregateDailyLog(log);
}

export function confirmDailyLog(id: number, actor: Actor) {
  const log = getDailyLogById(id); if (!log) throw new Error("Daily log not found.");
  if (log.status === "Confirmed") throw new Error("This daily log is already confirmed.");
  const snapshot = aggregateDailyLog(log);
  snapshot.confirmedBy = actor.name; snapshot.confirmedAt = new Date().toISOString();
  db.prepare("UPDATE daily_logs SET status='Confirmed',snapshot_json=?,confirmed_by_id=?,confirmed_by=?,confirmed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(JSON.stringify(snapshot), actor.id, actor.name, snapshot.confirmedAt, id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Daily log confirmed", entityType: "project", entityId: log.projectId, details: log.logDate });
}
// Reopen a confirmed log to Draft — permission-gated (caller) and audited. The historical
// snapshot_json is retained until the log is confirmed again (which rebuilds it).
export function reopenDailyLog(id: number, actor: Actor) {
  const log = getDailyLogById(id); if (!log) throw new Error("Daily log not found.");
  if (log.status !== "Confirmed") throw new Error("Only a confirmed daily log can be reopened.");
  db.prepare("UPDATE daily_logs SET status='Draft',confirmed_by_id=NULL,confirmed_by='',confirmed_at='',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Daily log reopened", entityType: "project", entityId: log.projectId, details: `${log.logDate} · historical modification` });
}

// ── Site photos (one private media fact; reuses project_photos) ──────────────
export type SitePhoto = { id: number; projectId: string; photoDate: string; area: string; caption: string; author: string; storedPath: string; mimeType: string; includeInDaily: number; issueId: number | null };
export function listSitePhotos(projectId: string, opts: { date?: string } = {}): SitePhoto[] {
  const where = ["project_id=?", "stored_path<>''"], params: (string | number)[] = [projectId];
  if (opts.date) { where.push("photo_date=?"); params.push(opts.date); }
  return db.prepare(`SELECT id,project_id AS projectId,photo_date AS photoDate,area,caption,author,stored_path AS storedPath,mime_type AS mimeType,include_in_daily AS includeInDaily,issue_id AS issueId FROM project_photos WHERE ${where.join(" AND ")} ORDER BY photo_date DESC, id DESC`).all(...params) as SitePhoto[];
}
export function addSitePhoto(input: { projectId: string; photoDate: string; area: string; caption: string; author: string; originalFilename: string; storedPath: string; fileSize: number; mimeType: string; includeInDaily: boolean; issueId: number | null; installationZoneId: number | null; uploadedById: number }, actor: Actor): number {
  const id = Number(db.prepare(`INSERT INTO project_photos(project_id,photo_date,area,caption,author,notes,original_filename,stored_path,file_size,mime_type,uploaded_by_id,uploaded_at,include_in_daily,issue_id,installation_zone_id) VALUES(?,?,?,?,?,'',?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?)`)
    .run(input.projectId, input.photoDate, input.area, input.caption, input.author, input.originalFilename, input.storedPath, input.fileSize, input.mimeType, input.uploadedById, input.includeInDaily ? 1 : 0, input.issueId, input.installationZoneId).lastInsertRowid);
  logActivity({ userId: actor.id, actor: actor.name, action: "Site photo added", entityType: "project", entityId: input.projectId, details: input.photoDate });
  return id;
}
export function setPhotoIncludeInDaily(id: number, include: boolean, actor: Actor) {
  const row = db.prepare("SELECT project_id AS p FROM project_photos WHERE id=?").get(id) as { p: string } | undefined;
  if (!row) return;
  db.prepare("UPDATE project_photos SET include_in_daily=? WHERE id=?").run(include ? 1 : 0, id);
  void actor;
}
// Edit a site photo's metadata (date, zone/floor, caption) and Daily Report inclusion in one save.
// Project-scoped so a photo can never be edited across projects. The stored image file is never
// touched — only its metadata. Returns false if the photo is not in the given project.
export function updateSitePhoto(id: number, projectId: string, input: { photoDate: string; area: string; caption: string; includeInDaily: boolean; installationZoneId: number | null }, actor: Actor): boolean {
  const row = db.prepare("SELECT project_id AS p FROM project_photos WHERE id=?").get(id) as { p: string } | undefined;
  if (!row || row.p !== projectId) return false;
  db.prepare("UPDATE project_photos SET photo_date=?,area=?,caption=?,include_in_daily=?,installation_zone_id=? WHERE id=?")
    .run(input.photoDate, input.area, input.caption, input.includeInDaily ? 1 : 0, input.installationZoneId, id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Site photo updated", entityType: "project", entityId: projectId, details: input.photoDate });
  return true;
}

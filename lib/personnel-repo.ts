// Sprint 15 — Personnel & Competency V1: DB repository.
// Extends the existing `employees` entity (never a second person table) with competency and
// lifecycle satellites. Two projections enforce the privacy guardrail server-side: a SAFE
// operational projection (identity, position, status — for Foreman+) and a FULL projection
// (adds personal code, DOB, emergency contact — Project Manager+ only). Sensitive fields never
// appear in the safe projection, so an operational caller can never receive them.
import { db } from "./db.ts";
import { logActivity } from "./repositories.ts";
import { expiryStatus, safetySummary, type ExpiryStatus, type SafetySummary } from "./personnel.ts";

type Actor = { id: number; name: string };

export type PersonnelSafe = {
  id: string; name: string; firstName: string; lastName: string; position: string; status: string;
  phone: string; email: string; employmentStartDate: string; employmentEndDate: string;
  photoStoredPath: string; jacketSize: string; trousersSize: string; shoeSize: string; notes: string;
};
export type PersonnelFull = PersonnelSafe & {
  dateOfBirth: string; personalCode: string; emergencyContact: string; emergencyContactPhone: string;
  terminationReason: string; terminationComment: string;
};

const SAFE_COLS = `e.id,e.first_name AS firstName,e.last_name AS lastName,TRIM(e.first_name||' '||e.last_name) AS name,e.role AS position,e.employment_status AS status,e.phone,e.email,e.employment_start_date AS employmentStartDate,e.employment_end_date AS employmentEndDate,e.photo_stored_path AS photoStoredPath,e.jacket_size AS jacketSize,e.trousers_size AS trousersSize,e.shoe_size AS shoeSize,e.notes`;
const FULL_COLS = `${SAFE_COLS},e.date_of_birth AS dateOfBirth,e.personal_code AS personalCode,e.emergency_contact AS emergencyContact,e.emergency_contact_phone AS emergencyContactPhone,e.termination_reason AS terminationReason,e.termination_comment AS terminationComment`;

export function getEmployeeSafe(id: string): PersonnelSafe | undefined {
  return db.prepare(`SELECT ${SAFE_COLS} FROM employees e WHERE e.id=?`).get(id) as PersonnelSafe | undefined;
}
export function getEmployeeFull(id: string): PersonnelFull | undefined {
  return db.prepare(`SELECT ${FULL_COLS} FROM employees e WHERE e.id=?`).get(id) as PersonnelFull | undefined;
}

// Update the Sprint 15 extended profile fields (personal + workwear). Position / employment
// lifecycle stay on the existing updateEmployee path; this only touches the new columns.
export function updateEmployeeProfile(id: string, input: { dateOfBirth: string; personalCode: string; emergencyContact: string; emergencyContactPhone: string; jacketSize: string; trousersSize: string; shoeSize: string }, actor: Actor) {
  db.prepare(`UPDATE employees SET date_of_birth=?,personal_code=?,emergency_contact=?,emergency_contact_phone=?,jacket_size=?,trousers_size=?,shoe_size=? WHERE id=?`)
    .run(input.dateOfBirth, input.personalCode, input.emergencyContact, input.emergencyContactPhone, input.jacketSize, input.trousersSize, input.shoeSize, id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee updated", entityType: "employee", entityId: id, details: "profile/workwear" });
}
// Update ONLY the operational workwear sizes (jacket / trousers / footwear). Separate from the
// personal-fields path so an operational (Foreman) editor can never reach sensitive HR columns.
export function updateEmployeeWorkwear(id: string, input: { jacketSize: string; trousersSize: string; shoeSize: string }, actor: Actor) {
  db.prepare(`UPDATE employees SET jacket_size=?,trousers_size=?,shoe_size=? WHERE id=?`)
    .run(input.jacketSize, input.trousersSize, input.shoeSize, id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee updated", entityType: "employee", entityId: id, details: "workwear" });
}
export function setEmployeePhoto(id: string, storedPath: string, mimeType: string, actor: Actor) {
  db.prepare("UPDATE employees SET photo_stored_path=?,photo_mime_type=? WHERE id=?").run(storedPath, mimeType, id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee photo updated", entityType: "employee", entityId: id });
}
export function getEmployeePhoto(id: string): { storedPath: string; mimeType: string } | undefined {
  const row = db.prepare("SELECT photo_stored_path AS storedPath, photo_mime_type AS mimeType FROM employees WHERE id=?").get(id) as { storedPath: string; mimeType: string } | undefined;
  return row && row.storedPath ? row : undefined;
}

// ── Skills (multiple per employee; position ≠ skill) ─────────────────────────
export function listEmployeeSkills(employeeId: string): { id: number; skill: string }[] {
  return db.prepare("SELECT id, skill FROM employee_skills WHERE employee_id=? ORDER BY skill").all(employeeId) as { id: number; skill: string }[];
}
export function setEmployeeSkills(employeeId: string, skills: string[], actor: Actor) {
  const clean = [...new Set(skills.map((s) => s.trim()).filter(Boolean))].slice(0, 40);
  db.prepare("DELETE FROM employee_skills WHERE employee_id=?").run(employeeId);
  const insert = db.prepare("INSERT OR IGNORE INTO employee_skills(employee_id,skill) VALUES(?,?)");
  for (const s of clean) insert.run(employeeId, s);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee skills updated", entityType: "employee", entityId: employeeId, details: clean.join(", ") });
}
export function listEmployeesBySkill(skill: string): string[] {
  return (db.prepare("SELECT DISTINCT employee_id AS id FROM employee_skills WHERE skill=?").all(skill) as { id: string }[]).map((r) => r.id);
}

// ── OVP (mandatory health examination) ───────────────────────────────────────
export type OvpRecord = { id: number; employeeId: string; examDate: string; validUntil: string; provider: string; comment: string; createdBy: string; createdAt: string };
export function listEmployeeOvp(employeeId: string): OvpRecord[] {
  return db.prepare("SELECT id,employee_id AS employeeId,exam_date AS examDate,valid_until AS validUntil,provider,comment,created_by AS createdBy,created_at AS createdAt FROM employee_ovp WHERE employee_id=? ORDER BY valid_until DESC, id DESC").all(employeeId) as OvpRecord[];
}
export function addEmployeeOvp(employeeId: string, input: { examDate: string; validUntil: string; provider: string; comment: string }, actor: Actor): number {
  const id = Number(db.prepare("INSERT INTO employee_ovp(employee_id,exam_date,valid_until,provider,comment,created_by_id,created_by) VALUES(?,?,?,?,?,?,?)")
    .run(employeeId, input.examDate, input.validUntil, input.provider, input.comment, actor.id, actor.name).lastInsertRowid);
  logActivity({ userId: actor.id, actor: actor.name, action: "OVP added", entityType: "employee", entityId: employeeId, details: `valid until ${input.validUntil || "—"}` });
  return id;
}
export function updateEmployeeOvp(id: number, input: { examDate: string; validUntil: string; provider: string; comment: string }, actor: Actor) {
  const row = db.prepare("SELECT employee_id AS e FROM employee_ovp WHERE id=?").get(id) as { e: string } | undefined;
  if (!row) throw new Error("OVP record not found.");
  db.prepare("UPDATE employee_ovp SET exam_date=?,valid_until=?,provider=?,comment=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(input.examDate, input.validUntil, input.provider, input.comment, id);
  logActivity({ userId: actor.id, actor: actor.name, action: "OVP updated", entityType: "employee", entityId: row.e, details: `valid until ${input.validUntil || "—"}` });
}
// The employee's current OVP status = the status of the latest (max valid-until) record.
export function employeeOvpStatus(employeeId: string, today: string, thresholdDays = 30): { status: ExpiryStatus; validUntil: string } {
  const latest = db.prepare("SELECT valid_until AS v FROM employee_ovp WHERE employee_id=? ORDER BY valid_until DESC, id DESC LIMIT 1").get(employeeId) as { v: string } | undefined;
  const validUntil = latest?.v ?? "";
  return { status: latest ? expiryStatus(validUntil, today, thresholdDays) : "none", validUntil };
}

// ── Qualifications / certificates / courses ──────────────────────────────────
export type QualificationRecord = { id: number; employeeId: string; category: string; customTitle: string; certNumber: string; organization: string; issueDate: string; validUntil: string; comment: string; createdBy: string; createdAt: string };
export function listEmployeeQualifications(employeeId: string): QualificationRecord[] {
  return db.prepare("SELECT id,employee_id AS employeeId,category,custom_title AS customTitle,cert_number AS certNumber,organization,issue_date AS issueDate,valid_until AS validUntil,comment,created_by AS createdBy,created_at AS createdAt FROM employee_qualifications WHERE employee_id=? ORDER BY category, id").all(employeeId) as QualificationRecord[];
}
export function addEmployeeQualification(employeeId: string, input: { category: string; customTitle: string; certNumber: string; organization: string; issueDate: string; validUntil: string; comment: string }, actor: Actor): number {
  const id = Number(db.prepare("INSERT INTO employee_qualifications(employee_id,category,custom_title,cert_number,organization,issue_date,valid_until,comment,created_by_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(employeeId, input.category, input.customTitle, input.certNumber, input.organization, input.issueDate, input.validUntil, input.comment, actor.id, actor.name).lastInsertRowid);
  logActivity({ userId: actor.id, actor: actor.name, action: "Qualification added", entityType: "employee", entityId: employeeId, details: input.category === "Other" ? input.customTitle : input.category });
  return id;
}
export function updateEmployeeQualification(id: number, input: { category: string; customTitle: string; certNumber: string; organization: string; issueDate: string; validUntil: string; comment: string }, actor: Actor) {
  const row = db.prepare("SELECT employee_id AS e FROM employee_qualifications WHERE id=?").get(id) as { e: string } | undefined;
  if (!row) throw new Error("Qualification not found.");
  db.prepare("UPDATE employee_qualifications SET category=?,custom_title=?,cert_number=?,organization=?,issue_date=?,valid_until=?,comment=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(input.category, input.customTitle, input.certNumber, input.organization, input.issueDate, input.validUntil, input.comment, id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Qualification updated", entityType: "employee", entityId: row.e });
}
export function removeEmployeeQualification(id: number, actor: Actor) {
  const row = db.prepare("SELECT employee_id AS e FROM employee_qualifications WHERE id=?").get(id) as { e: string } | undefined;
  if (!row) return;
  db.prepare("DELETE FROM employee_qualifications WHERE id=?").run(id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Qualification removed", entityType: "employee", entityId: row.e });
}
// Worst expiry status across the employee's dated qualifications (for the overview warning).
export function employeeQualificationWarning(employeeId: string, today: string, thresholdDays = 30): { expiring: number; expired: number } {
  const rows = db.prepare("SELECT valid_until AS v FROM employee_qualifications WHERE employee_id=? AND valid_until<>''").all(employeeId) as { v: string }[];
  let expiring = 0, expired = 0;
  for (const r of rows) { const s = expiryStatus(r.v, today, thresholdDays); if (s === "expiring") expiring++; else if (s === "expired") expired++; }
  return { expiring, expired };
}

// ── Private employee documents (OVP / qualification / induction / safety / general) ──
export type EmployeeDocument = { id: number; employeeId: string; relationType: string; relationId: number | null; title: string; originalFilename: string; storedPath: string; fileSize: number; mimeType: string; uploadedBy: string; createdAt: string };
export function listEmployeeDocuments(employeeId: string, relationType?: string, relationId?: number): EmployeeDocument[] {
  const where = ["employee_id=?"], params: (string | number)[] = [employeeId];
  if (relationType) { where.push("relation_type=?"); params.push(relationType); }
  if (relationId !== undefined) { where.push("relation_id=?"); params.push(relationId); }
  return db.prepare(`SELECT id,employee_id AS employeeId,relation_type AS relationType,relation_id AS relationId,title,original_filename AS originalFilename,stored_path AS storedPath,file_size AS fileSize,mime_type AS mimeType,uploaded_by AS uploadedBy,created_at AS createdAt FROM employee_documents WHERE ${where.join(" AND ")} ORDER BY id DESC`).all(...params) as EmployeeDocument[];
}
export function addEmployeeDocument(employeeId: string, input: { relationType: string; relationId: number | null; title: string; originalFilename: string; storedPath: string; fileSize: number; mimeType: string }, actor: Actor): number {
  const id = Number(db.prepare("INSERT INTO employee_documents(employee_id,relation_type,relation_id,title,original_filename,stored_path,file_size,mime_type,uploaded_by_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(employeeId, input.relationType, input.relationId, input.title, input.originalFilename, input.storedPath, input.fileSize, input.mimeType, actor.id, actor.name).lastInsertRowid);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee document added", entityType: "employee", entityId: employeeId, details: input.relationType });
  return id;
}
export function getEmployeeDocumentById(id: number): EmployeeDocument | undefined {
  return db.prepare("SELECT id,employee_id AS employeeId,relation_type AS relationType,relation_id AS relationId,title,original_filename AS originalFilename,stored_path AS storedPath,file_size AS fileSize,mime_type AS mimeType,uploaded_by AS uploadedBy,created_at AS createdAt FROM employee_documents WHERE id=?").get(id) as EmployeeDocument | undefined;
}
export function removeEmployeeDocument(id: number, actor: Actor): string {
  const row = db.prepare("SELECT employee_id AS e, stored_path AS p FROM employee_documents WHERE id=?").get(id) as { e: string; p: string } | undefined;
  if (!row) return "";
  db.prepare("DELETE FROM employee_documents WHERE id=?").run(id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee document removed", entityType: "employee", entityId: row.e });
  return row.p;
}

// ── Project safety induction (Employee × Project — never satisfies another project) ──
export type Induction = { id: number; projectId: string; employeeId: string; completed: number; completionDate: string; conductedBy: string; comment: string };
export function getProjectInduction(projectId: string, employeeId: string): Induction | undefined {
  return db.prepare("SELECT id,project_id AS projectId,employee_id AS employeeId,completed,completion_date AS completionDate,conducted_by AS conductedBy,comment FROM project_safety_inductions WHERE project_id=? AND employee_id=?").get(projectId, employeeId) as Induction | undefined;
}
export function setProjectInduction(projectId: string, employeeId: string, input: { completed: boolean; completionDate: string; conductedBy: string; comment: string }, actor: Actor) {
  db.prepare(`INSERT INTO project_safety_inductions(project_id,employee_id,completed,completion_date,conducted_by,comment,created_by_id) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(project_id,employee_id) DO UPDATE SET completed=excluded.completed,completion_date=excluded.completion_date,conducted_by=excluded.conducted_by,comment=excluded.comment,updated_at=CURRENT_TIMESTAMP`)
    .run(projectId, employeeId, input.completed ? 1 : 0, input.completionDate, input.conductedBy, input.comment, actor.id);
  logActivity({ userId: actor.id, actor: actor.name, action: input.completed ? "Safety induction completed" : "Safety induction updated", entityType: "project", entityId: projectId, details: `employee ${employeeId}` });
}
export function listProjectInductions(projectId: string): Induction[] {
  return db.prepare("SELECT id,project_id AS projectId,employee_id AS employeeId,completed,completion_date AS completionDate,conducted_by AS conductedBy,comment FROM project_safety_inductions WHERE project_id=?").all(projectId) as Induction[];
}

// ── Employee project assignment (crew — independent of platform user access) ─────────
export type Assignment = { id: number; employeeId: string; projectId: string; projectRole: string; startDate: string; endDate: string };
export function listEmployeeAssignments(employeeId: string): (Assignment & { projectName: string })[] {
  return db.prepare("SELECT a.id,a.employee_id AS employeeId,a.project_id AS projectId,a.project_role AS projectRole,a.start_date AS startDate,a.end_date AS endDate,p.name AS projectName FROM employee_project_assignments a JOIN projects p ON p.id=a.project_id WHERE a.employee_id=? ORDER BY a.end_date='' DESC, a.start_date DESC").all(employeeId) as (Assignment & { projectName: string })[];
}
export function listProjectAssignedEmployees(projectId: string, activeOnly = true): Assignment[] {
  const where = activeOnly ? "AND a.end_date=''" : "";
  return db.prepare(`SELECT a.id,a.employee_id AS employeeId,a.project_id AS projectId,a.project_role AS projectRole,a.start_date AS startDate,a.end_date AS endDate FROM employee_project_assignments a WHERE a.project_id=? ${where} ORDER BY a.id`).all(projectId) as Assignment[];
}
// Canonical "project participation" for the whole register: every active employee↔project
// assignment (the SAME source as Project Personnel and the Daily Log crew). The Employees list
// derives its project column, project filter and Foreman visibility from this — so the three
// operational surfaces cannot disagree. Project participation is role-agnostic (a Project
// Manager assigned to a project is a participant just like an installer); who may see SENSITIVE
// personnel data remains a separate concern (canViewPersonnelSensitive).
export function listActiveAssignments(): { employeeId: string; projectId: string; projectName: string }[] {
  return db.prepare("SELECT a.employee_id AS employeeId, a.project_id AS projectId, p.name AS projectName FROM employee_project_assignments a JOIN projects p ON p.id=a.project_id WHERE a.end_date='' ORDER BY p.name").all() as { employeeId: string; projectId: string; projectName: string }[];
}
export function assignEmployeeToProject(projectId: string, employeeId: string, projectRole: string, startDate: string, actor: Actor): number {
  // An active assignment (no end date) is unique per (employee, project); re-assigning reactivates.
  const existing = db.prepare("SELECT id FROM employee_project_assignments WHERE employee_id=? AND project_id=? AND end_date=''").get(employeeId, projectId) as { id: number } | undefined;
  if (existing) { db.prepare("UPDATE employee_project_assignments SET project_role=? WHERE id=?").run(projectRole, existing.id); return existing.id; }
  const id = Number(db.prepare("INSERT INTO employee_project_assignments(employee_id,project_id,project_role,start_date) VALUES(?,?,?,?)").run(employeeId, projectId, projectRole, startDate).lastInsertRowid);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee assigned to project", entityType: "project", entityId: projectId, details: `employee ${employeeId}` });
  return id;
}
export function endProjectAssignment(id: number, endDate: string, actor: Actor) {
  const row = db.prepare("SELECT project_id AS p, employee_id AS e FROM employee_project_assignments WHERE id=?").get(id) as { p: string; e: string } | undefined;
  if (!row) return;
  db.prepare("UPDATE employee_project_assignments SET end_date=? WHERE id=?").run(endDate || "9999-12-31", id);
  logActivity({ userId: actor.id, actor: actor.name, action: "Employee unassigned from project", entityType: "project", entityId: row.p, details: `employee ${row.e}` });
}

// ── Safety records ───────────────────────────────────────────────────────────
export type SafetyRecord = { id: number; employeeId: string; projectId: string; occurredAt: string; category: string; severity: string; description: string; actionTaken: string; recordedBy: string; createdAt: string };
export function listEmployeeSafetyRecords(employeeId: string): SafetyRecord[] {
  return db.prepare("SELECT id,employee_id AS employeeId,project_id AS projectId,occurred_at AS occurredAt,category,severity,description,action_taken AS actionTaken,recorded_by AS recordedBy,created_at AS createdAt FROM employee_safety_records WHERE employee_id=? ORDER BY occurred_at DESC, id DESC").all(employeeId) as SafetyRecord[];
}
export function listProjectSafetyRecords(projectId: string): (SafetyRecord & { employeeName: string })[] {
  return db.prepare("SELECT r.id,r.employee_id AS employeeId,r.project_id AS projectId,r.occurred_at AS occurredAt,r.category,r.severity,r.description,r.action_taken AS actionTaken,r.recorded_by AS recordedBy,r.created_at AS createdAt,TRIM(e.first_name||' '||e.last_name) AS employeeName FROM employee_safety_records r JOIN employees e ON e.id=r.employee_id WHERE r.project_id=? ORDER BY r.occurred_at DESC, r.id DESC").all(projectId) as (SafetyRecord & { employeeName: string })[];
}
export function addSafetyRecord(input: { employeeId: string; projectId: string; occurredAt: string; category: string; severity: string; description: string; actionTaken: string }, actor: Actor): number {
  const id = Number(db.prepare("INSERT INTO employee_safety_records(employee_id,project_id,occurred_at,category,severity,description,action_taken,recorded_by_id,recorded_by) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(input.employeeId, input.projectId, input.occurredAt, input.category, input.severity, input.description, input.actionTaken, actor.id, actor.name).lastInsertRowid);
  logActivity({ userId: actor.id, actor: actor.name, action: "Safety observation recorded", entityType: "employee", entityId: input.employeeId, details: `${input.severity}${input.projectId ? ` · ${input.projectId}` : ""}` });
  return id;
}
export function employeeSafetySummary(employeeId: string, today: string): SafetySummary {
  return safetySummary(listEmployeeSafetyRecords(employeeId).map((r) => ({ occurredAt: r.occurredAt, severity: r.severity })), today);
}

// ── Offboarding V1 (Active → Offboarding → Inactive; never hard-deletes) ─────────────
export type Offboarding = { id: number; employeeId: string; status: string; startedBy: string; startedAt: string; terminationDate: string; reason: string; reasonComment: string; completedBy: string; completedAt: string };
export type OffboardingItem = { id: number; offboardingId: number; label: string; state: string; comment: string; checkedBy: string };
export function getActiveOffboarding(employeeId: string): Offboarding | undefined {
  return db.prepare("SELECT id,employee_id AS employeeId,status,started_by AS startedBy,started_at AS startedAt,termination_date AS terminationDate,reason,reason_comment AS reasonComment,completed_by AS completedBy,completed_at AS completedAt FROM employee_offboarding WHERE employee_id=? AND status='In progress' ORDER BY id DESC LIMIT 1").get(employeeId) as Offboarding | undefined;
}
export function getOffboardingById(id: number): Offboarding | undefined {
  return db.prepare("SELECT id,employee_id AS employeeId,status,started_by AS startedBy,started_at AS startedAt,termination_date AS terminationDate,reason,reason_comment AS reasonComment,completed_by AS completedBy,completed_at AS completedAt FROM employee_offboarding WHERE id=?").get(id) as Offboarding | undefined;
}
export function listOffboardingItems(offboardingId: number): OffboardingItem[] {
  return db.prepare("SELECT id,offboarding_id AS offboardingId,label,state,comment,checked_by AS checkedBy FROM employee_offboarding_items WHERE offboarding_id=? ORDER BY id").all(offboardingId) as OffboardingItem[];
}
export function startOffboarding(employeeId: string, defaultItems: readonly string[], actor: Actor): number {
  const existing = getActiveOffboarding(employeeId);
  if (existing) return existing.id;
  const id = Number(db.prepare("INSERT INTO employee_offboarding(employee_id,status,started_by_id,started_by) VALUES(?,?,?,?)").run(employeeId, "In progress", actor.id, actor.name).lastInsertRowid);
  const insert = db.prepare("INSERT INTO employee_offboarding_items(offboarding_id,label) VALUES(?,?)");
  for (const label of defaultItems) insert.run(id, label);
  db.prepare("UPDATE employees SET employment_status='Offboarding' WHERE id=?").run(employeeId);
  logActivity({ userId: actor.id, actor: actor.name, action: "Offboarding started", entityType: "employee", entityId: employeeId });
  return id;
}
export function updateOffboardingItem(id: number, state: string, comment: string, actor: Actor) {
  db.prepare("UPDATE employee_offboarding_items SET state=?,comment=?,checked_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(state, comment, actor.name, id);
}
// Complete offboarding. Unresolved checklist items are PRESERVED (never auto-closed); the
// completion is always audited so a Director's override of open items is on record.
export function completeOffboarding(id: number, input: { terminationDate: string; reason: string; reasonComment: string; unresolved: number }, actor: Actor) {
  const row = getOffboardingById(id);
  if (!row) throw new Error("Offboarding not found.");
  db.prepare("UPDATE employee_offboarding SET status='Completed',termination_date=?,reason=?,reason_comment=?,completed_by_id=?,completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(input.terminationDate, input.reason, input.reasonComment, actor.id, actor.name, id);
  db.prepare("UPDATE employees SET employment_status='Inactive',employment_end_date=?,termination_reason=?,termination_comment=? WHERE id=?").run(input.terminationDate, input.reason, input.reasonComment, row.employeeId);
  logActivity({ userId: actor.id, actor: actor.name, action: "Offboarding completed", entityType: "employee", entityId: row.employeeId, details: `${input.reason || "—"}${input.unresolved ? ` · ${input.unresolved} unresolved item(s)` : ""}` });
}

import { db } from "./db";

export type Project = { id: string; name: string; location: string; client: string; status: string; progress: number; peopleToday: number; nextDelivery: string; manager: string };
export type Employee = { id: string; name: string; role: string; project: string; phone: string; status: string; certificates: string[] };
export type DocumentRow = { id: string; name: string; category: string; project: string; revision: string; updated: string; status: string };
export type DailyReport = { id: number; projectId: string; project: string; date: string; people: number; work: string; deliveries: number; issues: number; weather: string; notes: string; author: string };

const projectSelect = `SELECT id, name, location, client, status, progress, people_today AS peopleToday, next_delivery AS nextDelivery, manager FROM projects`;

export function listProjects(): Project[] { return db.prepare(`${projectSelect} ORDER BY CASE status WHEN 'Active' THEN 0 WHEN 'Planning' THEN 1 ELSE 2 END, name`).all() as unknown as Project[]; }
export function getProject(id: string): Project | undefined { return db.prepare(`${projectSelect} WHERE id = ?`).get(id) as Project | undefined; }
export function listEmployees(): Employee[] {
  const rows = db.prepare("SELECT id, name, role, project, phone, status, certificates FROM employees ORDER BY name").all() as unknown as (Omit<Employee,"certificates"> & { certificates: string })[];
  return rows.map((r) => ({ ...r, certificates: JSON.parse(r.certificates) as string[] }));
}
export function listDocuments(): DocumentRow[] { return db.prepare("SELECT id, name, category, project, revision, updated, status FROM documents ORDER BY updated DESC").all() as unknown as DocumentRow[]; }
export function listReports(): DailyReport[] {
  return db.prepare(`SELECT id, project_id AS projectId, project_name AS project, report_date AS date, people, work, deliveries, issues, weather, notes, author FROM reports ORDER BY report_date DESC, id DESC`).all() as unknown as DailyReport[];
}
export function createReport(input: Omit<DailyReport, "id" | "project"> & { project: string }) {
  return db.prepare(`INSERT INTO reports (project_id, project_name, report_date, people, work, deliveries, issues, weather, notes, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.projectId, input.project, input.date, input.people, input.work, input.deliveries, input.issues, input.weather, input.notes, input.author);
}

export type ProjectEvent = { id: number; projectId: string; date: string; time: string; type: string; title: string; details: string; author: string };
export type ActivityLog = { id: number; actor: string; action: string; entityType: string; entityId: string; details: string; createdAt: string };
export type UserAccess = { id: number; name: string; email: string; role: string; active: number; createdAt: string };

export function listProjectEvents(projectId: string): ProjectEvent[] {
  return db.prepare(`SELECT id, project_id AS projectId, event_date AS date, event_time AS time, event_type AS type, title, details, author FROM project_events WHERE project_id = ? ORDER BY event_date DESC, event_time DESC, id DESC`).all(projectId) as unknown as ProjectEvent[];
}

export function addProjectEvent(input: Omit<ProjectEvent, "id">) {
  return db.prepare(`INSERT INTO project_events (project_id, event_date, event_time, event_type, title, details, author) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(input.projectId, input.date, input.time, input.type, input.title, input.details, input.author);
}

export function logActivity(input: { userId?: number; actor: string; action: string; entityType: string; entityId?: string; details?: string }) {
  return db.prepare(`INSERT INTO activity_log (user_id, actor, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`).run(input.userId ?? null, input.actor, input.action, input.entityType, input.entityId ?? "", input.details ?? "");
}

export function listActivity(limit = 20): ActivityLog[] {
  return db.prepare(`SELECT id, actor, action, entity_type AS entityType, entity_id AS entityId, details, created_at AS createdAt FROM activity_log ORDER BY id DESC LIMIT ?`).all(limit) as unknown as ActivityLog[];
}

export function listUsers(): UserAccess[] {
  return db.prepare(`SELECT id, name, email, role, active, created_at AS createdAt FROM users ORDER BY CASE role WHEN 'Director' THEN 0 WHEN 'Administrator' THEN 1 WHEN 'Project Manager' THEN 2 WHEN 'Foreman' THEN 3 ELSE 4 END, name`).all() as unknown as UserAccess[];
}

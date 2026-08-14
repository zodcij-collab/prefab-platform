// Sprint 13 — Site issues / tasks / defects: database access. Reuses the shared db handle
// and the existing project/element/zone/member + audit helpers. Callers (server actions)
// wrap multi-step mutations in runTransaction; every mutation records an append-only event.
import { db } from "./db.ts";
import { getInstallationZone, getProject, getProjectElement, listProjectMembers, logActivity } from "./repositories.ts";
import { attentionReasons, canTransition, isValidPriority, isValidType, visibleAttentionReasons, OPEN_STATUSES } from "./issues.ts";

export type Issue = {
  id: number; projectId: string; issueNumber: number; type: string; title: string; details: string;
  priority: string; status: string; classified: number;
  installationZoneId: number | null; installationZoneName: string;
  elementId: number | null; elementCode: string;
  documentId: number | null; drawingPage: number | null; drawingX: number | null; drawingY: number | null;
  assignedToId: string | null; assignedTo: string; dueDate: string;
  resolution: string; resolvedAt: string; resolvedById: number | null; resolvedBy: string;
  closedAt: string; closedById: number | null; closedBy: string; cancelReason: string;
  createdById: number | null; createdBy: string; createdAt: string; updatedAt: string;
};
export type IssueSummary = Issue & { mediaCount: number };
export type IssueMedia = { id: number; issueId: number; role: string; kind: string; originalFilename: string; storedPath: string; fileSize: number; mimeType: string; caption: string; uploadedById: number | null; uploadedBy: string; createdAt: string };
export type IssueEvent = { id: number; issueId: number; kind: string; detail: string; actorUserId: number | null; actor: string; createdAt: string };
export type Actor = { id: number; name: string };

const issueSelect = `SELECT i.id,i.project_id AS projectId,i.issue_number AS issueNumber,i.type,i.title,i.details,i.priority,i.status,i.classified,
  i.installation_zone_id AS installationZoneId,COALESCE(iz.name,'') AS installationZoneName,
  i.element_id AS elementId,COALESCE(e.code,'') AS elementCode,
  i.document_id AS documentId,i.drawing_page AS drawingPage,i.drawing_x AS drawingX,i.drawing_y AS drawingY,
  i.assigned_to_id AS assignedToId,i.assigned_to AS assignedTo,i.due_date AS dueDate,
  i.resolution,i.resolved_at AS resolvedAt,i.resolved_by_id AS resolvedById,i.resolved_by AS resolvedBy,
  i.closed_at AS closedAt,i.closed_by_id AS closedById,i.closed_by AS closedBy,i.cancel_reason AS cancelReason,
  i.created_by_id AS createdById,i.created_by AS createdBy,i.created_at AS createdAt,i.updated_at AS updatedAt
  FROM issues i LEFT JOIN installation_zones iz ON iz.id=i.installation_zone_id LEFT JOIN project_elements e ON e.id=i.element_id`;

export function nextIssueNumber(projectId: string): number {
  return Number((db.prepare("SELECT COALESCE(MAX(issue_number),0)+1 AS n FROM issues WHERE project_id=?").get(projectId) as { n: number }).n);
}

export function recordIssueEvent(issueId: number, kind: string, detail: string, actor: Actor) {
  db.prepare("INSERT INTO issue_events(issue_id,kind,detail,actor_user_id,actor) VALUES(?,?,?,?,?)").run(issueId, kind, detail, actor.id, actor.name);
}

// Archived projects are read-only. Returns the issue (project-scoped) for mutation helpers.
function loadIssueForMutation(id: number, projectId: string): Issue {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only. Restore the project first.");
  const issue = getIssue(id);
  if (!issue || issue.projectId !== projectId) throw new Error("Issue not found.");
  return issue;
}

export function getIssue(id: number): Issue | undefined {
  return db.prepare(`${issueSelect} WHERE i.id=?`).get(id) as Issue | undefined;
}

export function listIssues(projectId: string, filters: { status?: string; type?: string; priority?: string; assignedToId?: string; installationZoneId?: number; elementId?: number; needsClassification?: boolean; openOnly?: boolean } = {}): IssueSummary[] {
  const where = ["i.project_id=?"], params: (string | number)[] = [projectId];
  if (filters.status) { where.push("i.status=?"); params.push(filters.status); }
  if (filters.type) { where.push("i.type=?"); params.push(filters.type); }
  if (filters.priority) { where.push("i.priority=?"); params.push(filters.priority); }
  if (filters.assignedToId) { where.push("i.assigned_to_id=?"); params.push(filters.assignedToId); }
  if (filters.installationZoneId) { where.push("i.installation_zone_id=?"); params.push(filters.installationZoneId); }
  if (filters.elementId) { where.push("i.element_id=?"); params.push(filters.elementId); }
  if (filters.needsClassification) where.push("(i.classified=0 OR i.status='Captured')");
  if (filters.openOnly) where.push("i.status NOT IN ('Closed','Cancelled')");
  return db.prepare(`${issueSelect.replace("FROM issues i", ", (SELECT COUNT(*) FROM issue_media m WHERE m.issue_id=i.id) AS mediaCount FROM issues i")} WHERE ${where.join(" AND ")} ORDER BY (i.status IN ('Closed','Cancelled')),i.issue_number DESC`).all(...params) as unknown as IssueSummary[];
}

// Non-terminal issues for the Requires Attention service (attention reasons are derived in
// the pure domain from this authoritative state — issues are never duplicated to display).
export function listActiveIssues(projectId: string): Issue[] {
  return db.prepare(`${issueSelect} WHERE i.project_id=? AND i.status NOT IN ('Closed','Cancelled') ORDER BY i.issue_number DESC`).all(projectId) as unknown as Issue[];
}

// Quick site capture: minimum friction. Project + author + timestamp are automatic; the
// record is 'Captured' and flagged for later classification. Persists only when called
// (the editor route writes nothing until save — no phantom records / consumed numbers).
export function createQuickCapture(input: { projectId: string; title: string; details: string; type?: string; actor: Actor }): number {
  const project = getProject(input.projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only. Restore the project first.");
  // The on-site intent (Defect / Task) sets the initial type; full classification refines it.
  const type = input.type && isValidType(input.type) ? input.type : "Defect";
  const number = nextIssueNumber(input.projectId);
  const id = Number(db.prepare("INSERT INTO issues(project_id,issue_number,type,title,details,priority,status,classified,created_by_id,created_by) VALUES(?,?,?,?,?,?,?,0,?,?)")
    .run(input.projectId, number, type, input.title.slice(0, 200), input.details.slice(0, 8000), "Normal", "Captured", input.actor.id, input.actor.name).lastInsertRowid);
  recordIssueEvent(id, "created", `Quick capture #${number}`, input.actor);
  logActivity({ userId: input.actor.id, actor: input.actor.name, action: "Site issue captured", entityType: "project", entityId: input.projectId, details: `Issue #${number}` });
  return id;
}

// Enrich the SAME immutable record — never creates a second issue. A still-Captured issue
// moves to Open on classification.
export function classifyIssue(id: number, projectId: string, input: { type: string; title: string; details: string; priority: string; installationZoneId: number | null; elementId: number | null; dueDate: string }, actor: Actor) {
  const issue = loadIssueForMutation(id, projectId);
  const type = isValidType(input.type) ? input.type : issue.type;
  const priority = isValidPriority(input.priority) ? input.priority : issue.priority;
  if (input.installationZoneId !== null) { const zone = getInstallationZone(input.installationZoneId); if (!zone || zone.projectId !== projectId || !zone.active) throw new Error("Installation zone project scope mismatch."); }
  if (input.elementId !== null) {
    const element = getProjectElement(input.elementId);
    if (!element || element.projectId !== projectId || !element.active) throw new Error("Element project scope mismatch.");
    // Strict Sprint 13 V1 rule: when both a zone and an element are set, the element must be
    // assigned to that installation zone — never persist an element from a different zone.
    if (input.installationZoneId !== null && element.installationZoneId !== input.installationZoneId) throw new Error("The selected element does not belong to the selected installation zone.");
  }
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("Invalid due date.");
  const status = issue.status === "Captured" ? "Open" : issue.status;
  db.prepare(`UPDATE issues SET type=?,title=?,details=?,priority=?,installation_zone_id=?,element_id=?,due_date=?,classified=1,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?`)
    .run(type, input.title.slice(0, 200), input.details.slice(0, 8000), priority, input.installationZoneId, input.elementId, input.dueDate, status, id, projectId);
  recordIssueEvent(id, "classified", `${type} · ${priority}`, actor);
  logActivity({ userId: actor.id, actor: actor.name, action: "Issue classified", entityType: "project", entityId: projectId, details: `Issue #${issue.issueNumber} · ${type}` });
}

// Assign to a project participant (member) or clear (employeeId=null). Cross-project or
// non-member assignment is rejected.
export function assignIssue(id: number, projectId: string, employeeId: string | null, actor: Actor) {
  const issue = loadIssueForMutation(id, projectId);
  let name = "";
  if (employeeId) {
    const member = listProjectMembers(projectId).find((m) => m.id === employeeId);
    if (!member) throw new Error("Assignee must be a member of this project.");
    name = member.name;
  }
  const status = employeeId && (issue.status === "Captured" || issue.status === "Open") ? "Assigned" : issue.status;
  db.prepare("UPDATE issues SET assigned_to_id=?,assigned_to=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?").run(employeeId, name, status, id, projectId);
  recordIssueEvent(id, "assigned", employeeId ? name : "Unassigned", actor);
  logActivity({ userId: actor.id, actor: actor.name, action: "Issue assignment changed", entityType: "project", entityId: projectId, details: `Issue #${issue.issueNumber} → ${employeeId ? name : "Unassigned"}` });
}

// Plain status move (Open/Assigned/In progress + reopen). Resolution/closure/cancellation
// carry required data and use their dedicated operations.
export function setIssueStatus(id: number, projectId: string, nextStatus: string, actor: Actor) {
  const issue = loadIssueForMutation(id, projectId);
  if (["Resolved", "Closed", "Cancelled"].includes(nextStatus)) throw new Error("Use the resolve, close or cancel action for this status.");
  if (!canTransition(issue.status, nextStatus)) throw new Error(`Cannot move an issue from ${issue.status} to ${nextStatus}.`);
  db.prepare("UPDATE issues SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?").run(nextStatus, id, projectId);
  recordIssueEvent(id, "status", nextStatus, actor);
}

export function resolveIssue(id: number, projectId: string, resolution: string, actor: Actor) {
  const issue = loadIssueForMutation(id, projectId);
  if (!resolution.trim()) throw new Error("A resolution description is required.");
  if (!canTransition(issue.status, "Resolved")) throw new Error(`An issue in ${issue.status} cannot be resolved.`);
  db.prepare("UPDATE issues SET status='Resolved',resolution=?,resolved_at=CURRENT_TIMESTAMP,resolved_by_id=?,resolved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?").run(resolution.slice(0, 8000), actor.id, actor.name, id, projectId);
  recordIssueEvent(id, "resolved", resolution.slice(0, 400), actor);
  logActivity({ userId: actor.id, actor: actor.name, action: "Issue resolved", entityType: "project", entityId: projectId, details: `Issue #${issue.issueNumber}` });
}

export function closeIssue(id: number, projectId: string, actor: Actor) {
  const issue = loadIssueForMutation(id, projectId);
  if (!canTransition(issue.status, "Closed")) throw new Error("Only a resolved issue can be closed.");
  db.prepare("UPDATE issues SET status='Closed',closed_at=CURRENT_TIMESTAMP,closed_by_id=?,closed_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?").run(actor.id, actor.name, id, projectId);
  recordIssueEvent(id, "closed", "", actor);
  logActivity({ userId: actor.id, actor: actor.name, action: "Issue closed", entityType: "project", entityId: projectId, details: `Issue #${issue.issueNumber}` });
}

export function cancelIssue(id: number, projectId: string, reason: string, actor: Actor) {
  const issue = loadIssueForMutation(id, projectId);
  if (!reason.trim()) throw new Error("A cancellation reason is required.");
  if (!canTransition(issue.status, "Cancelled")) throw new Error("This issue cannot be cancelled.");
  db.prepare("UPDATE issues SET status='Cancelled',cancel_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?").run(reason.slice(0, 2000), id, projectId);
  recordIssueEvent(id, "cancelled", reason.slice(0, 400), actor);
  logActivity({ userId: actor.id, actor: actor.name, action: "Issue cancelled", entityType: "project", entityId: projectId, details: `Issue #${issue.issueNumber}` });
}

export function addIssueComment(id: number, projectId: string, text: string, actor: Actor) {
  const issue = loadIssueForMutation(id, projectId);
  if (!text.trim()) throw new Error("A comment cannot be empty.");
  recordIssueEvent(id, "comment", text.slice(0, 4000), actor);
  logActivity({ userId: actor.id, actor: actor.name, action: "Issue comment added", entityType: "project", entityId: projectId, details: `Issue #${issue.issueNumber}` });
}

// Media stays associated with the immutable issue id across every status change. Role is
// 'evidence' (the problem) or 'resolution' (the fix) so a later report can show before/after.
export function addIssueMedia(id: number, projectId: string, media: { role: string; kind: string; originalFilename: string; storedPath: string; fileSize: number; mimeType: string; caption: string }, actor: Actor): number {
  const issue = loadIssueForMutation(id, projectId);
  const role = media.role === "resolution" ? "resolution" : "evidence";
  const mediaId = Number(db.prepare("INSERT INTO issue_media(issue_id,role,kind,original_filename,stored_path,file_size,mime_type,caption,uploaded_by_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(id, role, media.kind, media.originalFilename.slice(0, 240), media.storedPath, media.fileSize, media.mimeType, media.caption.slice(0, 500), actor.id, actor.name).lastInsertRowid);
  recordIssueEvent(id, "media", `${role} · ${media.kind}`, actor);
  logActivity({ userId: actor.id, actor: actor.name, action: "Issue media added", entityType: "project", entityId: projectId, details: `Issue #${issue.issueNumber}` });
  return mediaId;
}

export function listIssueMedia(issueId: number): IssueMedia[] {
  return db.prepare("SELECT id,issue_id AS issueId,role,kind,original_filename AS originalFilename,stored_path AS storedPath,file_size AS fileSize,mime_type AS mimeType,caption,uploaded_by_id AS uploadedById,uploaded_by AS uploadedBy,created_at AS createdAt FROM issue_media WHERE issue_id=? ORDER BY (role='resolution'),id").all(issueId) as unknown as IssueMedia[];
}
export function getIssueMediaById(id: number): (IssueMedia & { projectId: string }) | undefined {
  return db.prepare("SELECT m.id,m.issue_id AS issueId,m.role,m.kind,m.original_filename AS originalFilename,m.stored_path AS storedPath,m.file_size AS fileSize,m.mime_type AS mimeType,m.caption,m.uploaded_by_id AS uploadedById,m.uploaded_by AS uploadedBy,m.created_at AS createdAt,i.project_id AS projectId FROM issue_media m JOIN issues i ON i.id=m.issue_id WHERE m.id=?").get(id) as (IssueMedia & { projectId: string }) | undefined;
}

export function listIssueEvents(issueId: number): IssueEvent[] {
  return db.prepare("SELECT id,issue_id AS issueId,kind,detail,actor_user_id AS actorUserId,actor,created_at AS createdAt FROM issue_events WHERE issue_id=? ORDER BY id").all(issueId) as unknown as IssueEvent[];
}

export type ProjectAttentionSummary = { attention: number; overdue: number; critical: number };
// Project-level Requires Attention aggregation for the portfolio (Projects page). Reuses the
// SAME derivation as the per-project Overview — the pure attentionReasons + role-scoped
// visibleAttentionReasons — so there is one source of truth, no duplicated rules. Issues are
// the only current attention source; future sources (loads/reports/RFI/permits/HSE) aggregate
// into these counts here, so the Projects page never needs redesigning. Counts respect the
// viewer's role: managers see project-wide overdue/critical, others see only personal items.
export function projectAttentionSummary(projectId: string, ctx: { today: string; employeeId: string | null; canManage: boolean; canCapture: boolean }): ProjectAttentionSummary {
  let attention = 0, overdue = 0, critical = 0;
  for (const issue of listActiveIssues(projectId)) { // terminal issues are already excluded
    const reasons = visibleAttentionReasons(attentionReasons({ status: issue.status, classified: issue.classified, priority: issue.priority, dueDate: issue.dueDate, assignedToId: issue.assignedToId }, { today: ctx.today, employeeId: ctx.employeeId }), { canManage: ctx.canManage, canCapture: ctx.canCapture });
    if (reasons.length) attention++;
    if (reasons.includes("overdue")) overdue++;
    if (reasons.includes("critical_unresolved")) critical++;
  }
  return { attention, overdue, critical };
}

// Counts for the Project Overview headline (open / critical-open / overdue).
export function projectIssueStats(projectId: string, today: string): { open: number; critical: number; overdue: number; needsClassification: number } {
  const row = db.prepare(`SELECT
    SUM(CASE WHEN status NOT IN ('Closed','Cancelled') THEN 1 ELSE 0 END) open,
    SUM(CASE WHEN priority='Critical' AND status IN (${OPEN_STATUSES.map(() => "?").join(",")}) THEN 1 ELSE 0 END) critical,
    SUM(CASE WHEN due_date<>'' AND due_date<? AND status IN (${OPEN_STATUSES.map(() => "?").join(",")}) THEN 1 ELSE 0 END) overdue,
    SUM(CASE WHEN (classified=0 OR status='Captured') AND status NOT IN ('Closed','Cancelled') THEN 1 ELSE 0 END) needsClassification
    FROM issues WHERE project_id=?`).get(...OPEN_STATUSES, today, ...OPEN_STATUSES, projectId) as { open: number | null; critical: number | null; overdue: number | null; needsClassification: number | null };
  return { open: Number(row.open || 0), critical: Number(row.critical || 0), overdue: Number(row.overdue || 0), needsClassification: Number(row.needsClassification || 0) };
}

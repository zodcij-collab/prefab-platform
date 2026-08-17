import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";
import { attentionReasons } from "../lib/issues.ts";

let ctx: TestDb; let repo: TestDb["repo"]; let issues: TestDb["issues"]; let db: TestDb["db"];
const actor = { id: 1, name: "Test" };

function newProject(id: string, name = id) {
  repo.createProject({ id, name, location: "Rīga", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}
function newElement(projectId: string, code: string, overrides: Record<string, unknown> = {}): number {
  return repo.saveProjectElement({ projectId, code, elementType: "Wall panel", floor: "1", zone: "A", drawingRef: "", description: "", weight: 10, length: 8000, width: 300, height: 3000, supplier: "", plannedDeliveryDate: "", actualDeliveryDate: "", status: "Planned", issueNote: "", notes: "", ...overrides }, actor) as number;
}
function newMember(projectId: string, id: string, firstName: string) {
  repo.createEmployee({ id, firstName, lastName: "T", role: "Foreman", phone: "", email: "", status: "Active", defaultProjectId: null, employmentStartDate: "", employmentEndDate: "", notes: "" });
  repo.assignProjectMember(projectId, id, "Team member");
}
const media = (over: Record<string, unknown> = {}) => ({ role: "evidence", kind: "image", originalFilename: "a.jpg", storedPath: `issues/${Math.random().toString(36).slice(2)}.jpg`, fileSize: 1000, mimeType: "image/jpeg", caption: "", ...over });

before(async () => { ctx = await setupTestDb(); repo = ctx.repo; issues = ctx.issues; db = ctx.db; });
after(() => ctx.cleanup());

test("A/B: quick capture creates exactly one immutable Captured issue; a number is consumed only on save", () => {
  newProject("is-a");
  assert.equal(issues.nextIssueNumber("is-a"), 1, "opening a capture form consumes no number");
  const id = issues.createQuickCapture({ projectId: "is-a", title: "Cracked panel", details: "north", actor });
  const issue = issues.getIssue(id)!;
  assert.equal(issue.issueNumber, 1); assert.equal(issue.status, "Captured"); assert.equal(issue.classified, 0);
  assert.equal(issue.createdBy, "Test");
  assert.equal(issues.nextIssueNumber("is-a"), 2, "only a persisted capture consumes a number");
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM issues WHERE project_id='is-a'").get() as { c: number }).c), 1);
});

test("C: multiple media attachments belong to the correct issue", () => {
  newProject("is-c");
  const a = issues.createQuickCapture({ projectId: "is-c", title: "A", details: "", actor });
  const b = issues.createQuickCapture({ projectId: "is-c", title: "B", details: "", actor });
  issues.addIssueMedia(a, "is-c", media(), actor); issues.addIssueMedia(a, "is-c", media(), actor);
  issues.addIssueMedia(b, "is-c", media(), actor);
  assert.equal(issues.listIssueMedia(a).length, 2);
  assert.equal(issues.listIssueMedia(b).length, 1);
});

test("D/E: cross-project issue and media mutations are rejected", () => {
  newProject("is-d1"); newProject("is-d2");
  const id = issues.createQuickCapture({ projectId: "is-d1", title: "X", details: "", actor });
  assert.throws(() => issues.addIssueMedia(id, "is-d2", media(), actor), /Issue not found/);
  assert.throws(() => issues.classifyIssue(id, "is-d2", { type: "Defect", title: "X", details: "", priority: "Normal", installationZoneId: null, elementId: null, dueDate: "" }, actor), /Issue not found/);
});

test("F: a quick capture is classified in place — no second issue is created", () => {
  newProject("is-f");
  const id = issues.createQuickCapture({ projectId: "is-f", title: "Loose fixing", details: "", actor });
  issues.classifyIssue(id, "is-f", { type: "Defect", title: "Loose fixing", details: "corridor", priority: "High", installationZoneId: null, elementId: null, dueDate: "2026-09-01" }, actor);
  const issue = issues.getIssue(id)!;
  assert.equal(issue.id, id, "same immutable record"); assert.equal(issue.classified, 1);
  assert.equal(issue.type, "Defect"); assert.equal(issue.priority, "High"); assert.equal(issue.status, "Open");
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM issues WHERE project_id='is-f'").get() as { c: number }).c), 1, "no duplicate issue");
});

test("G/H: installation zone relation uses an existing project zone; cross-project zone rejected", () => {
  newProject("is-g1"); newProject("is-g2");
  const zone = repo.createInstallationZone("is-g1", "1 Stāvs", "");
  const foreignZone = repo.createInstallationZone("is-g2", "Z", "");
  const id = issues.createQuickCapture({ projectId: "is-g1", title: "X", details: "", actor });
  issues.classifyIssue(id, "is-g1", { type: "Issue", title: "X", details: "", priority: "Normal", installationZoneId: zone, elementId: null, dueDate: "" }, actor);
  assert.equal(issues.getIssue(id)!.installationZoneId, zone);
  assert.equal(issues.getIssue(id)!.installationZoneName, "1 Stāvs");
  assert.throws(() => issues.classifyIssue(id, "is-g1", { type: "Issue", title: "X", details: "", priority: "Normal", installationZoneId: foreignZone, elementId: null, dueDate: "" }, actor), /zone project scope/);
});

test("I/J/K: element relation uses immutable id; repeated marks are distinct; cross-project element rejected", () => {
  newProject("is-i1"); newProject("is-i2");
  const e1 = newElement("is-i1", "DUP-1"), e2 = newElement("is-i1", "DUP-1"); // same mark, distinct ids
  assert.notEqual(e1, e2);
  const foreign = newElement("is-i2", "F-1");
  const id = issues.createQuickCapture({ projectId: "is-i1", title: "X", details: "", actor });
  issues.classifyIssue(id, "is-i1", { type: "Defect", title: "X", details: "", priority: "Normal", installationZoneId: null, elementId: e2, dueDate: "" }, actor);
  assert.equal(issues.getIssue(id)!.elementId, e2, "references the specific physical element, not the mark");
  assert.throws(() => issues.classifyIssue(id, "is-i1", { type: "Defect", title: "X", details: "", priority: "Normal", installationZoneId: null, elementId: foreign, dueDate: "" }, actor), /Element project scope/);
});

test("L/M: assignment requires a project participant; a non-member is rejected", () => {
  newProject("is-l");
  newMember("is-l", "emp-l1", "Anna");
  repo.createEmployee({ id: "emp-out", firstName: "Out", lastName: "T", role: "Foreman", phone: "", email: "", status: "Active", defaultProjectId: null, employmentStartDate: "", employmentEndDate: "", notes: "" });
  const id = issues.createQuickCapture({ projectId: "is-l", title: "X", details: "", actor });
  issues.assignIssue(id, "is-l", "emp-l1", actor);
  const issue = issues.getIssue(id)!;
  assert.equal(issue.assignedToId, "emp-l1"); assert.equal(issue.assignedTo, "Anna T"); assert.equal(issue.status, "Assigned");
  assert.throws(() => issues.assignIssue(id, "is-l", "emp-out", actor), /member of this project/);
});

test("N/O/P/Q/R: project issue stats derive open / critical / overdue / needs-classification; terminal excluded", () => {
  newProject("is-n");
  const cap = issues.createQuickCapture({ projectId: "is-n", title: "cap", details: "", actor }); // Captured → needsClassification
  const crit = issues.createQuickCapture({ projectId: "is-n", title: "crit", details: "", actor });
  issues.classifyIssue(crit, "is-n", { type: "Safety", title: "crit", details: "", priority: "Critical", installationZoneId: null, elementId: null, dueDate: "2026-08-01" }, actor); // Critical + overdue vs today 2026-08-13
  const done = issues.createQuickCapture({ projectId: "is-n", title: "done", details: "", actor });
  issues.classifyIssue(done, "is-n", { type: "Task", title: "done", details: "", priority: "Critical", installationZoneId: null, elementId: null, dueDate: "2026-08-01" }, actor);
  issues.resolveIssue(done, "is-n", "fixed", actor); issues.closeIssue(done, "is-n", actor); // terminal → excluded
  const stats = issues.projectIssueStats("is-n", "2026-08-13");
  assert.equal(stats.open, 2, "cap + crit still open; done is closed");
  assert.equal(stats.critical, 1, "only the open critical counts");
  assert.equal(stats.overdue, 1);
  assert.equal(stats.needsClassification, 1, "only the unclassified capture");
  // R: a closed issue yields no attention reasons even though it was critical + overdue.
  assert.deepEqual(attentionReasons({ status: "Closed", classified: 1, priority: "Critical", dueDate: "2026-08-01", assignedToId: null }, { today: "2026-08-13", employeeId: null }), []);
  void cap;
});

test("T/U/W: resolution requires a description, resolution media is preserved, history survives closure", () => {
  newProject("is-t");
  const id = issues.createQuickCapture({ projectId: "is-t", title: "Gap", details: "", actor });
  issues.addIssueMedia(id, "is-t", media({ role: "evidence" }), actor); // before
  issues.classifyIssue(id, "is-t", { type: "Defect", title: "Gap", details: "", priority: "Normal", installationZoneId: null, elementId: null, dueDate: "" }, actor);
  assert.throws(() => issues.resolveIssue(id, "is-t", "   ", actor), /resolution description is required/);
  issues.addIssueMedia(id, "is-t", media({ role: "resolution" }), actor); // after
  issues.resolveIssue(id, "is-t", "Sealed and repainted", actor);
  issues.closeIssue(id, "is-t", actor);
  const issue = issues.getIssue(id)!;
  assert.equal(issue.status, "Closed"); assert.equal(issue.resolution, "Sealed and repainted"); assert.ok(issue.resolvedBy && issue.closedBy);
  assert.equal(issues.listIssueMedia(id).filter((m) => m.role === "resolution").length, 1, "resolution media preserved after closure");
  // W: full history remains — created, media, classified, resolved, closed all recorded.
  const kinds = issues.listIssueEvents(id).map((e) => e.kind);
  assert.deepEqual(kinds, ["created", "media", "classified", "media", "resolved", "closed"]);
  assert.ok(issues.getIssue(id), "closed issue is not deleted");
});

test("V: cancellation requires a reason and preserves the record", () => {
  newProject("is-v");
  const id = issues.createQuickCapture({ projectId: "is-v", title: "Wrong", details: "", actor });
  assert.throws(() => issues.cancelIssue(id, "is-v", "  ", actor), /cancellation reason is required/);
  issues.cancelIssue(id, "is-v", "Duplicate of #3", actor);
  const issue = issues.getIssue(id)!;
  assert.equal(issue.status, "Cancelled"); assert.equal(issue.cancelReason, "Duplicate of #3");
  assert.ok(issues.getIssue(id), "cancelled issue is preserved, not deleted");
});

test("status: dedicated actions gate resolve/close/cancel; closing requires a resolved issue", () => {
  newProject("is-s");
  const id = issues.createQuickCapture({ projectId: "is-s", title: "X", details: "", actor });
  assert.throws(() => issues.setIssueStatus(id, "is-s", "Resolved", actor), /resolve, close or cancel/);
  assert.throws(() => issues.closeIssue(id, "is-s", actor), /resolved issue can be closed/);
  issues.setIssueStatus(id, "is-s", "In progress", actor);
  assert.equal(issues.getIssue(id)!.status, "In progress");
});

test("X: mutations on an archived project are rejected", () => {
  newProject("is-x");
  const id = issues.createQuickCapture({ projectId: "is-x", title: "X", details: "", actor });
  repo.archiveProject("is-x", actor.id);
  assert.throws(() => issues.classifyIssue(id, "is-x", { type: "Defect", title: "X", details: "", priority: "Normal", installationZoneId: null, elementId: null, dueDate: "" }, actor), /Archived projects are read-only/);
  assert.throws(() => issues.createQuickCapture({ projectId: "is-x", title: "Y", details: "", actor }), /Archived projects are read-only/);
});

test("F/G/H: element must belong to the selected installation zone; cross-zone is rejected server-side", () => {
  newProject("iz-zone");
  const zoneA = repo.createInstallationZone("iz-zone", "Zone A", ""), zoneB = repo.createInstallationZone("iz-zone", "Zone B", "");
  const inA = newElement("iz-zone", "A-1"), inB = newElement("iz-zone", "B-1");
  repo.assignElementsToInstallationZone("iz-zone", [inA], zoneA);
  repo.assignElementsToInstallationZone("iz-zone", [inB], zoneB);
  // F: the picker's candidate source is zone-scoped — only zone A elements for zone A.
  assert.deepEqual(repo.listProjectElements("iz-zone", { installationZoneId: zoneA }).map((r) => r.id), [inA]);
  assert.deepEqual(repo.listProjectElements("iz-zone", { installationZoneId: zoneB }).map((r) => r.id), [inB]);
  const id = issues.createQuickCapture({ projectId: "iz-zone", title: "X", details: "", actor });
  // Matching zone + element succeeds.
  issues.classifyIssue(id, "iz-zone", { type: "Defect", title: "X", details: "", priority: "Normal", installationZoneId: zoneA, elementId: inA, dueDate: "" }, actor);
  assert.equal(issues.getIssue(id)!.elementId, inA);
  // G/H: an element from a different zone is rejected — never silently persisted.
  assert.throws(() => issues.classifyIssue(id, "iz-zone", { type: "Defect", title: "X", details: "", priority: "Normal", installationZoneId: zoneB, elementId: inA, dueDate: "" }, actor), /does not belong to the selected installation zone/);
  assert.equal(issues.getIssue(id)!.elementId, inA, "the rejected classification did not change the stored element");
});

test("I/J/K: list scopes — openOnly excludes terminal; priority filter narrows correctly", () => {
  newProject("iz-list");
  const open = issues.createQuickCapture({ projectId: "iz-list", title: "open", details: "", actor });
  const crit = issues.createQuickCapture({ projectId: "iz-list", title: "crit", details: "", actor });
  issues.classifyIssue(crit, "iz-list", { type: "Safety", title: "crit", details: "", priority: "Critical", installationZoneId: null, elementId: null, dueDate: "" }, actor);
  const done = issues.createQuickCapture({ projectId: "iz-list", title: "done", details: "", actor });
  issues.classifyIssue(done, "iz-list", { type: "Task", title: "done", details: "", priority: "Normal", installationZoneId: null, elementId: null, dueDate: "" }, actor);
  issues.resolveIssue(done, "iz-list", "fixed", actor); issues.closeIssue(done, "iz-list", actor);
  const openIds = issues.listIssues("iz-list", { openOnly: true }).map((i) => i.id).sort((a, b) => a - b);
  assert.deepEqual(openIds, [open, crit].sort((a, b) => a - b), "scope=open hides the closed issue");
  assert.deepEqual(issues.listIssues("iz-list", { priority: "Critical" }).map((i) => i.id), [crit], "priority=Critical link filter");
});

test("§1C/D: a PDF attachment stays associated with its issue; cross-project media mutation is rejected", () => {
  newProject("pdf-1"); newProject("pdf-2");
  const id = issues.createQuickCapture({ projectId: "pdf-1", title: "X", details: "", actor });
  const mid = issues.addIssueMedia(id, "pdf-1", { role: "evidence", kind: "document", originalFilename: "drawing-section-A.pdf", storedPath: "issues/doc-a.pdf", fileSize: 2000, mimeType: "application/pdf", caption: "" }, actor);
  const list = issues.listIssueMedia(id);
  assert.ok(list.some((m) => m.id === mid && m.kind === "document" && m.mimeType === "application/pdf"), "PDF is stored as a document attachment on the issue");
  assert.equal(issues.getIssueMediaById(mid)!.projectId, "pdf-1", "serving authorization is keyed to the owning project");
  assert.throws(() => issues.addIssueMedia(id, "pdf-2", { role: "evidence", kind: "document", originalFilename: "y.pdf", storedPath: "issues/y.pdf", fileSize: 1, mimeType: "application/pdf", caption: "" }, actor), /Issue not found/);
});

test("§3: a quick capture records the chosen intent as its type (Defect default / Task)", () => {
  newProject("intent-1");
  const defectId = issues.createQuickCapture({ projectId: "intent-1", title: "d", details: "", actor });
  assert.equal(issues.getIssue(defectId)!.type, "Defect", "default intent is Defect, not a generic 'Issue'");
  const taskId = issues.createQuickCapture({ projectId: "intent-1", title: "t", details: "", type: "Task", actor });
  assert.equal(issues.getIssue(taskId)!.type, "Task");
});

test("§11 A/B/G: portfolio attention summary counts actionable items; zero when calm; terminal excluded", () => {
  newProject("pa-1");
  const mgr = { today: "2026-08-14", employeeId: null as string | null, canManage: true, canCapture: true };
  assert.deepEqual(issues.projectAttentionSummary("pa-1", mgr), { attention: 0, overdue: 0, critical: 0 }, "calm project → all zero");
  const crit = issues.createQuickCapture({ projectId: "pa-1", title: "c", details: "", actor });
  issues.classifyIssue(crit, "pa-1", { type: "Safety", title: "c", details: "", priority: "Critical", installationZoneId: null, elementId: null, dueDate: "2026-08-01" }, actor); // overdue + critical
  issues.createQuickCapture({ projectId: "pa-1", title: "cap", details: "", actor }); // Captured → needs classification
  let s = issues.projectAttentionSummary("pa-1", mgr);
  assert.deepEqual([s.attention, s.overdue, s.critical], [2, 1, 1]);
  // G: resolving + closing removes it from actionable attention.
  issues.resolveIssue(crit, "pa-1", "fixed", actor); issues.closeIssue(crit, "pa-1", actor);
  s = issues.projectAttentionSummary("pa-1", mgr);
  assert.deepEqual([s.attention, s.overdue, s.critical], [1, 0, 0], "terminal issue no longer counts; only the capture remains");
});

test("§11 F: attention is role-scoped — a non-manager sees only personal items, not project-wide overdue/critical", () => {
  newProject("pa-2");
  newMember("pa-2", "emp-pa", "Bob");
  const crit = issues.createQuickCapture({ projectId: "pa-2", title: "c", details: "", actor });
  issues.classifyIssue(crit, "pa-2", { type: "Safety", title: "c", details: "", priority: "Critical", installationZoneId: null, elementId: null, dueDate: "2026-08-01" }, actor);
  const foreman = { today: "2026-08-14", employeeId: "emp-pa", canManage: false, canCapture: false };
  assert.deepEqual(issues.projectAttentionSummary("pa-2", foreman), { attention: 0, overdue: 0, critical: 0 }, "not assigned + no manage → sees nothing");
  issues.assignIssue(crit, "pa-2", "emp-pa", actor);
  const s = issues.projectAttentionSummary("pa-2", foreman);
  assert.equal(s.attention, 1, "their assigned item requires attention");
  assert.deepEqual([s.overdue, s.critical], [0, 0], "project-wide overdue/critical remain a manager view");
});

test("§11 C/D/E: the overdue/critical summary counts equal what the deep-link filtered list returns", () => {
  newProject("pa-3");
  const c = issues.createQuickCapture({ projectId: "pa-3", title: "c", details: "", actor });
  issues.classifyIssue(c, "pa-3", { type: "Safety", title: "c", details: "", priority: "Critical", installationZoneId: null, elementId: null, dueDate: "2026-08-01" }, actor);
  const s = issues.projectAttentionSummary("pa-3", { today: "2026-08-14", employeeId: null, canManage: true, canCapture: true });
  // Critical deep-link (?priority=Critical) and overdue deep-link (?attention=overdue → openOnly + isOverdue).
  assert.equal(issues.listIssues("pa-3", { priority: "Critical", openOnly: true }).length, s.critical);
  assert.equal(issues.listIssues("pa-3", { openOnly: true }).filter((i) => i.dueDate && i.dueDate < "2026-08-14").length, s.overdue);
});

function newDoc(projectId: string, over: Record<string, unknown> = {}): number {
  return Number(repo.createProjectDocument({ projectId, title: "Plan A", category: "Drawings", revision: "", documentDate: "", status: "Current", description: "", originalFilename: "plan.pdf", storedPath: `documents/${Math.random().toString(36).slice(2)}.pdf`, fileSize: 1000, mimeType: "application/pdf", uploadedById: 1, uploadedBy: "T", ...over }).lastInsertRowid);
}

test("§14 H/I/J: an existing issue receives / moves / loses a drawing marker on the SAME record, audited", () => {
  newProject("mk-1");
  const doc = newDoc("mk-1", { title: "Level 2 GA" });
  const id = issues.createQuickCapture({ projectId: "mk-1", title: "Cracked panel", details: "", actor });
  issues.setIssueMarker(id, "mk-1", { documentId: doc, page: 2, x: 0.4, y: 0.6 }, actor);
  let issue = issues.getIssue(id)!;
  assert.equal(issue.documentId, doc); assert.equal(issue.drawingPage, 2); assert.equal(issue.drawingX, 0.4); assert.equal(issue.drawingY, 0.6);
  assert.equal(issue.documentTitle, "Level 2 GA");
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM issues WHERE project_id='mk-1'").get() as { c: number }).c), 1, "no duplicate issue");
  // Moving the marker records a 'marker_changed' event.
  issues.setIssueMarker(id, "mk-1", { documentId: doc, page: 3, x: 0.1, y: 0.2 }, actor);
  issue = issues.getIssue(id)!;
  assert.deepEqual([issue.drawingPage, issue.drawingX], [3, 0.1]);
  // Clearing removes it and records 'marker_removed'; issue itself is preserved.
  issues.clearIssueMarker(id, "mk-1", actor);
  issue = issues.getIssue(id)!;
  assert.equal(issue.documentId, null); assert.equal(issue.drawingPage, null);
  assert.deepEqual(issues.listIssueEvents(id).map((e) => e.kind), ["created", "marker", "marker_changed", "marker_removed"]);
  assert.throws(() => issues.clearIssueMarker(id, "mk-1", actor), /no drawing location/);
});

test("§14 C/D/E: cross-project document, non-PDF, and out-of-bounds markers are rejected server-side", () => {
  newProject("mk-c1"); newProject("mk-c2");
  const localDoc = newDoc("mk-c1"), foreignDoc = newDoc("mk-c2"), nonPdf = newDoc("mk-c1", { mimeType: "image/png", originalFilename: "x.png" });
  const id = issues.createQuickCapture({ projectId: "mk-c1", title: "X", details: "", actor });
  assert.throws(() => issues.setIssueMarker(id, "mk-c1", { documentId: foreignDoc, page: 1, x: 0.5, y: 0.5 }, actor), /not part of this project/);
  assert.throws(() => issues.setIssueMarker(id, "mk-c1", { documentId: nonPdf, page: 1, x: 0.5, y: 0.5 }, actor), /only be placed on PDF/);
  assert.throws(() => issues.setIssueMarker(id, "mk-c1", { documentId: localDoc, page: 0, x: 0.5, y: 0.5 }, actor), /Invalid drawing marker/);
  assert.throws(() => issues.setIssueMarker(id, "mk-c1", { documentId: localDoc, page: 1, x: 1.5, y: 0.5 }, actor), /Invalid drawing marker/);
});

test("§14 F: capture-from-drawing creates exactly one issue carrying the marker", () => {
  newProject("mk-f");
  const doc = newDoc("mk-f");
  const id = issues.createQuickCapture({ projectId: "mk-f", title: "From drawing", details: "", type: "Task", marker: { documentId: doc, page: 1, x: 0.3, y: 0.7 }, actor });
  const issue = issues.getIssue(id)!;
  assert.equal(issue.type, "Task"); assert.equal(issue.documentId, doc); assert.equal(issue.drawingPage, 1); assert.equal(issue.drawingX, 0.3);
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM issues WHERE project_id='mk-f'").get() as { c: number }).c), 1);
  assert.deepEqual(issues.listIssueEvents(id).map((e) => e.kind), ["created", "marker"]);
});

test("§14 M: marker list is scoped to a document (and page), lightweight projection", () => {
  newProject("mk-m");
  const doc = newDoc("mk-m"), other = newDoc("mk-m", { title: "Other" });
  const a = issues.createQuickCapture({ projectId: "mk-m", title: "a", details: "", actor });
  const b = issues.createQuickCapture({ projectId: "mk-m", title: "b", details: "", actor });
  const c = issues.createQuickCapture({ projectId: "mk-m", title: "c", details: "", actor });
  issues.setIssueMarker(a, "mk-m", { documentId: doc, page: 1, x: 0.1, y: 0.1 }, actor);
  issues.setIssueMarker(b, "mk-m", { documentId: doc, page: 2, x: 0.2, y: 0.2 }, actor);
  issues.setIssueMarker(c, "mk-m", { documentId: other, page: 1, x: 0.3, y: 0.3 }, actor);
  assert.deepEqual(issues.listDocumentMarkers("mk-m", doc).map((m) => m.id).sort((x, y) => x - y), [a, b].sort((x, y) => x - y), "scoped to document");
  assert.deepEqual(issues.listDocumentMarkers("mk-m", doc, 1).map((m) => m.id), [a], "scoped to document + page");
  const marker = issues.listDocumentMarkers("mk-m", doc, 1)[0];
  assert.deepEqual([marker.issueNumber, marker.type, marker.status, marker.drawingX], [issues.getIssue(a)!.issueNumber, "Defect", "Captured", 0.1]);
});

test("§14 K: drawing-marker mutations on an archived project are rejected", () => {
  newProject("mk-k");
  const doc = newDoc("mk-k");
  const id = issues.createQuickCapture({ projectId: "mk-k", title: "X", details: "", actor });
  issues.setIssueMarker(id, "mk-k", { documentId: doc, page: 1, x: 0.5, y: 0.5 }, actor);
  repo.archiveProject("mk-k", actor.id);
  assert.throws(() => issues.setIssueMarker(id, "mk-k", { documentId: doc, page: 1, x: 0.6, y: 0.6 }, actor), /Archived projects are read-only/);
  assert.throws(() => issues.clearIssueMarker(id, "mk-k", actor), /Archived projects are read-only/);
});

test("cross-device: an issue captured by one session is the same server record read by another", () => {
  newProject("is-cd");
  const zone = repo.createInstallationZone("is-cd", "Z1", "");
  // Session A (e.g. a phone) captures and enriches.
  const id = issues.createQuickCapture({ projectId: "is-cd", title: "Site capture 27", details: "voice note text", actor });
  issues.addIssueMedia(id, "is-cd", media(), actor);
  issues.classifyIssue(id, "is-cd", { type: "Defect", title: "Site capture 27", details: "voice note text", priority: "High", installationZoneId: zone, elementId: null, dueDate: "" }, actor);
  // Session B (e.g. a laptop) lists the project and reads the SAME record + media — no export.
  const listed = issues.listIssues("is-cd").find((i) => i.id === id)!;
  assert.equal(listed.title, "Site capture 27"); assert.equal(listed.mediaCount, 1); assert.equal(listed.installationZoneName, "Z1");
  assert.equal(issues.getIssue(id)!.details, "voice note text");
});

// ── Sprint 14 acceptance fix pack ─────────────────────────────────────────────
test("§fp-F/G/H: role never auto-grants project access; explicit access enables visibility; a Foreman with full project access is NOT an admin", async () => {
  const perms = await import("../lib/permissions.ts");
  const access = await import("../lib/project-access.ts");
  newProject("fp-rbac");
  const uid = Number(repo.createUserAccess({ name: "Klim", email: "klim.fp@prefab.lv", role: "Foreman", active: 1, passwordHash: "s:h" }).lastInsertRowid);
  const user = { id: uid, email: "klim.fp@prefab.lv", name: "Klim", role: "Foreman" };
  // F: a fresh Foreman with default role permissions and no membership sees no project.
  assert.equal(perms.canViewProjectIssues(user, "fp-rbac"), false, "F: role alone grants no project access");
  assert.equal(repo.listUserProjectIds(uid).length, 0, "no implicit project membership from role");
  // H (part 1): a Foreman is never a global access admin, regardless of project grants.
  assert.equal(perms.canManageAccess(user), false, "Foreman cannot administer users/access");
  // G: grant explicit Full project access → the project becomes visible and manageable.
  repo.setProjectPermission(uid, "fp-rbac", access.presetCapabilities("full")!, 1);
  assert.equal(perms.canViewProjectIssues(user, "fp-rbac"), true, "G: explicit project access enables visibility");
  assert.equal(perms.canManageProjectIssues(user, "fp-rbac"), true, "G: full access includes project issue management");
  // H (part 2): full PROJECT access does not elevate the Foreman to Director/Administrator.
  assert.equal(perms.canManageAccess(user), false, "H: full project access ≠ admin/global role");
  assert.equal(access.isGlobalRole(user.role), false, "H: the Foreman stays a role-scoped, non-global user");
  // and access remains project-scoped — a different project is still invisible.
  newProject("fp-other");
  assert.equal(perms.canViewProjectIssues(user, "fp-other"), false, "access granted to one project does not leak to others");
});

test("§fp-I: deactivation blocks sign-in and invalidates active sessions (password stays intact)", async () => {
  const { hashPassword, verifyPassword, hashToken } = await import("../lib/security.ts");
  const uid = Number(repo.createUserAccess({ name: "Temp", email: "temp.fp@prefab.lv", role: "Foreman", active: 1, passwordHash: hashPassword("Sup3rSecret!x") }).lastInsertRowid);
  // A live session exists before deactivation.
  const token = "fp-token-i"; db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)").run(uid, hashToken(token), "2999-01-01T00:00:00.000Z");
  const sessionQuery = "SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1";
  assert.ok(db.prepare(sessionQuery).get(hashToken(token), "2026-08-17T00:00:00.000Z"), "session valid while active");
  repo.setUserActiveState(uid, 0, actor);
  // Login gate (authenticate requires active) and session gate (getSessionUser requires active=1).
  const row = repo.getUserAccess(uid)!; assert.equal(Number(row.active), 0);
  assert.ok(verifyPassword("Sup3rSecret!x", (db.prepare("SELECT password_hash AS h FROM users WHERE id=?").get(uid) as { h: string }).h), "password unchanged — deactivation is not a credential reset");
  assert.equal(db.prepare(sessionQuery).get(hashToken(token), "2026-08-17T00:00:00.000Z"), undefined, "the active session is immediately invalidated");
});

test("§fp-J: deactivation preserves history and attribution (no rows deleted)", () => {
  const uid = Number(repo.createUserAccess({ name: "Author", email: "author.fp@prefab.lv", role: "Foreman", active: 1, passwordHash: "s:h" }).lastInsertRowid);
  newProject("fp-hist");
  const author = { id: uid, name: "Author" };
  const issueId = issues.createQuickCapture({ projectId: "fp-hist", title: "Chip", details: "beam", actor: author });
  issues.addIssueComment(issueId, "fp-hist", "on it", author);
  repo.setUserActiveState(uid, 0, actor);
  // The user row still exists; the issue, its attribution and its events are intact.
  assert.ok(repo.getUserAccess(uid), "the user is disabled, not deleted");
  const issue = issues.getIssue(issueId)!;
  assert.equal(issue.createdBy, "Author", "authorship/attribution survives deactivation");
  assert.ok(issues.listIssueEvents(issueId).length >= 2, "history (create + comment) survives deactivation");
});

test("§fp-K: the lifecycle action is audited and idempotent", () => {
  const uid = Number(repo.createUserAccess({ name: "Audit", email: "audit.fp@prefab.lv", role: "Foreman", active: 1, passwordHash: "s:h" }).lastInsertRowid);
  const userActions = () => repo.listActivity(200).filter((a) => a.entityType === "user" && a.entityId === String(uid)).map((a) => a.action);
  assert.equal(repo.setUserActiveState(uid, 0, actor), true, "deactivation changes state");
  assert.equal(repo.setUserActiveState(uid, 0, actor), false, "idempotent — a no-op second time");
  assert.equal(repo.setUserActiveState(uid, 1, actor), true, "reactivation changes state");
  const actions = userActions();
  assert.ok(actions.includes("Deactivated user"), "deactivation is audited");
  assert.ok(actions.includes("Reactivated user"), "reactivation is audited");
  assert.equal(actions.filter((a) => a === "Deactivated user").length, 1, "the no-op did not write a duplicate audit entry");
});

test("§fp: drawing-location snapshot media is a single replaceable record, excluded from evidence", () => {
  newProject("fp-snap");
  const id = issues.createQuickCapture({ projectId: "fp-snap", title: "Snap", details: "", actor });
  // Real evidence + a first snapshot.
  issues.addIssueMedia(id, "fp-snap", media(), actor);
  const prior1 = issues.replaceIssueDrawingSnapshot(id, { storedPath: "issues/snap-1.png", fileSize: 10 }, actor);
  assert.deepEqual(prior1, [], "no prior snapshot to remove on first set");
  // Replacing returns the previous snapshot's stored path (so the caller deletes the old file).
  const prior2 = issues.replaceIssueDrawingSnapshot(id, { storedPath: "issues/snap-2.png", fileSize: 12 }, actor);
  assert.deepEqual(prior2, ["issues/snap-1.png"], "replacement returns the prior snapshot path");
  const all = issues.listIssueMedia(id);
  assert.equal(all.filter((m) => m.role === "drawing-location").length, 1, "exactly one snapshot row is kept");
  assert.equal(all.filter((m) => m.role === "evidence").length, 1, "the evidence photo is untouched");
  // The issue-list media count ignores the snapshot (it is not an attachment the user added).
  const summary = issues.listIssues("fp-snap").find((i) => i.id === id)!;
  assert.equal(summary.mediaCount, 1, "media count excludes the drawing-location snapshot");
  // Removing returns the current snapshot path and clears the row.
  assert.deepEqual(issues.removeIssueDrawingSnapshot(id), ["issues/snap-2.png"]);
  assert.equal(issues.listIssueMedia(id).filter((m) => m.role === "drawing-location").length, 0);
});

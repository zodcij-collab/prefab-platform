import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";
import type { SessionUser } from "../lib/auth.ts";

// DB-backed tests for the Sprint 11.3 project-scoped access model. They run against
// a disposable temporary database and never touch data/prefab.db.

let ctx: TestDb;
let repo: TestDb["repo"];
let perms: typeof import("../lib/permissions.ts");

function sessionUser(id: number, role: string): SessionUser {
  return { id, email: `user${id}@test`, name: `User ${id}`, role };
}
function makeUser(role: string, email: string): SessionUser {
  repo.createUserAccess({ name: email, email, role, active: 1, passwordHash: "x:y" });
  const row = repo.getUserAccessByEmail(email)!;
  return sessionUser(row.id, role);
}
function newProject(id: string, name: string) {
  repo.createProject({ id, name, location: "Rīga", client: "Client", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}

before(async () => {
  ctx = await setupTestDb();
  repo = ctx.repo;
  perms = await import("../lib/permissions.ts");
});
after(() => ctx.cleanup());

test("Director and Administrator see every project without membership", () => {
  newProject("acc-global", "Global Access");
  const director = sessionUser(1, "Director");
  const admin = makeUser("Administrator", "admin-acc@test");
  assert.equal(perms.canAccessProject(director, "acc-global"), true);
  assert.equal(perms.canAccessProject(admin, "acc-global"), true);
  assert.equal(perms.projectCapabilities(director, "acc-global")["elements.manage"], true);
});

test("a PM with no membership or override sees nothing; an override grants and revokes access", () => {
  newProject("acc-a", "Project A");
  newProject("acc-b", "Project B");
  const pm = makeUser("Project Manager", "pm-acc@test");
  // No membership, no override → no access to either project.
  assert.equal(perms.canAccessProject(pm, "acc-a"), false);
  assert.equal(perms.canAccessProject(pm, "acc-b"), false);
  assert.deepEqual(perms.permittedProjectIds(pm, ["acc-a", "acc-b"]), []);

  // Grant access to A only.
  repo.setProjectPermission(pm.id, "acc-a", { "project.view": true }, 1);
  assert.equal(perms.canAccessProject(pm, "acc-a"), true);
  assert.equal(perms.canAccessProject(pm, "acc-b"), false);
  assert.deepEqual(perms.permittedProjectIds(pm, ["acc-a", "acc-b"]), ["acc-a"]);

  // Revoke by removing the override row.
  repo.removeProjectPermission(pm.id, "acc-a");
  assert.equal(perms.canAccessProject(pm, "acc-a"), false);
});

test("project override restriction blocks an action the base role would allow", () => {
  newProject("acc-restrict", "Restricted");
  const pm = makeUser("Project Manager", "pm-restrict@test");
  repo.setProjectPermission(pm.id, "acc-restrict", { "project.view": true, "reports.approve": false }, 1);
  assert.equal(perms.canAccessProject(pm, "acc-restrict"), true);
  assert.equal(perms.canApproveProjectReports(pm, "acc-restrict"), false, "override denies approval despite PM base role");
  assert.equal(perms.canProject(pm, "acc-restrict", "elements.manage"), true, "unspecified capability keeps base PM default");
});

test("project override grant lets a Foreman perform an action the base role forbids", () => {
  newProject("acc-grant", "Granted");
  const foreman = makeUser("Foreman", "foreman-grant@test");
  assert.equal(perms.canApproveProjectReports(foreman, "acc-grant"), false);
  repo.setProjectPermission(foreman.id, "acc-grant", { "project.view": true, "reports.approve": true }, 1);
  assert.equal(perms.canApproveProjectReports(foreman, "acc-grant"), true);
});

test("a 'none' override explicitly revokes access even if a row exists", () => {
  newProject("acc-none", "None");
  const foreman = makeUser("Foreman", "foreman-none@test");
  repo.setProjectPermission(foreman.id, "acc-none", { "project.view": false }, 1);
  assert.equal(perms.canAccessProject(foreman, "acc-none"), false);
});

test("archived projects are hidden from non-global roles but visible to Director/Admin", () => {
  newProject("acc-archived", "Archivable");
  const pm = makeUser("Project Manager", "pm-archived@test");
  repo.setProjectPermission(pm.id, "acc-archived", { "project.view": true }, 1);
  assert.equal(perms.canAccessProject(pm, "acc-archived"), true);
  repo.archiveProject("acc-archived", 1);
  assert.equal(perms.canAccessProject(pm, "acc-archived"), false, "archived hidden from PM");
  assert.equal(perms.canAccessProject(sessionUser(1, "Director"), "acc-archived"), true, "still visible to Director");
  repo.restoreProject("acc-archived");
  assert.equal(perms.canAccessProject(pm, "acc-archived"), true);
});

test("revoking access does not erase historical attribution", () => {
  newProject("acc-history", "History");
  const foreman = makeUser("Foreman", "foreman-history@test");
  repo.setProjectPermission(foreman.id, "acc-history", { "project.view": true }, 1);
  const reportId = repo.saveDailyReport({ projectId: "acc-history", project: "History", date: "2026-08-11", work: "x", weather: "", materials: "", equipment: "", problems: "", safety: "", additionalNotes: "", author: foreman.name, reporterUserId: foreman.id, reporterEmployeeId: null, status: "Submitted", attendance: [] });
  repo.logActivity({ userId: foreman.id, actor: foreman.name, action: "Submitted daily report", entityType: "project", entityId: "acc-history" });

  // Revoke access.
  repo.removeProjectPermission(foreman.id, "acc-history");
  assert.equal(perms.canAccessProject(foreman, "acc-history"), false);

  // Historical records remain attributed to the foreman.
  const report = repo.getReport(reportId)!;
  assert.equal(report.author, foreman.name);
  assert.equal(report.reporterUserId, foreman.id);
  assert.ok(repo.listActivity(20).some((entry) => entry.actor === foreman.name && entry.action === "Submitted daily report"));
});

test("project permission rows round-trip through the repository", () => {
  newProject("acc-round", "Round");
  const pm = makeUser("Project Manager", "pm-round@test");
  repo.setProjectPermission(pm.id, "acc-round", { "project.view": true, "reports.create": false }, 1);
  const stored = repo.getProjectPermission(pm.id, "acc-round")!;
  assert.deepEqual(stored.capabilities, { "project.view": true, "reports.create": false });
  assert.equal(stored.grantedById, 1);
  assert.ok(repo.listProjectPermissions("acc-round").some((row) => row.userId === pm.id));
  assert.ok(repo.listUserProjectPermissions(pm.id).some((row) => row.projectId === "acc-round"));
});

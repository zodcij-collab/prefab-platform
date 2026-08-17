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

// ── Fix pack: "Default for role" project-access grant (A–J) ───────────────────
// The Access & Roles editor stores each preset as an explicit project_permissions row. "Default
// for role" is an EMPTY capability map (membership granted, permissions inherited from the role)
// — mirroring setUserProjectAccessAction. These prove the grant is effective, role-scoped, and
// does not regress the other modes.
const asRoleDefault = (userId: number, projectId: string) => repo.setProjectPermission(userId, projectId, {}, 1);

test("§fp A/B/C/D/E/I: 'Default for role' grants effective, role-scoped project access", () => {
  newProject("fp-def", "Default For Role");
  const foreman = makeUser("Foreman", "fp-def-foreman@test");
  // A: role alone (no grant) → no visibility.
  assert.equal(perms.canAccessProject(foreman, "fp-def"), false, "A: role alone grants nothing");
  assert.deepEqual(perms.permittedProjectIds(foreman, ["fp-def"]), [], "A: no project permitted before a grant");
  // B: Default-for-role creates an explicit membership row.
  asRoleDefault(foreman.id, "fp-def");
  const row = repo.getProjectPermission(foreman.id, "fp-def");
  assert.ok(row, "B: explicit project-permission row exists (membership)");
  assert.deepEqual(row!.capabilities, {}, "B: stored as an empty capability map (role-derived)");
  // C: the project is now visible.
  assert.equal(perms.canAccessProject(foreman, "fp-def"), true, "C: user can see the granted project");
  // I: the 'No project access yet' flag is driven by effective access → now non-empty.
  assert.deepEqual(perms.permittedProjectIds(foreman, ["fp-def"]), ["fp-def"], "I: badge clears — project is permitted");
  // D: effective capabilities are exactly the Foreman role preset.
  const caps = perms.projectCapabilities(foreman, "fp-def");
  assert.equal(caps["issues.manage"], true, "D: Foreman capabilities apply");
  assert.equal(caps["reports.create"], true);
  assert.equal(caps["reports.approve"], false, "D: no capability the role lacks");
  assert.equal(caps["elements.manage"], false);
  // E: still a role-scoped, non-admin user.
  assert.equal(perms.canManageAccess(foreman), false, "E: not an access administrator");
  assert.equal(perms.canManageProjectLifecycle(foreman), false, "E: not a global project admin");
});

test("§fp F/G: Full and Read-only presets resolve correctly", async () => {
  const access = await import("../lib/project-access.ts");
  newProject("fp-fg", "FG");
  const full = makeUser("Foreman", "fp-fg-full@test");
  const ro = makeUser("Foreman", "fp-fg-ro@test");
  repo.setProjectPermission(full.id, "fp-fg", access.presetCapabilities("full")!, 1);
  repo.setProjectPermission(ro.id, "fp-fg", access.presetCapabilities("read-only")!, 1);
  // F: Full access.
  assert.equal(perms.canAccessProject(full, "fp-fg"), true, "F: full access is visible");
  assert.equal(perms.canProject(full, "fp-fg", "elements.manage"), true, "F: full access grants management");
  // G: Read-only.
  assert.equal(perms.canAccessProject(ro, "fp-fg"), true, "G: read-only is visible");
  assert.equal(perms.canProject(ro, "fp-fg", "issues.view"), true, "G: read-only can view");
  assert.equal(perms.canProject(ro, "fp-fg", "elements.manage"), false, "G: read-only cannot manage");
  assert.equal(perms.canProject(ro, "fp-fg", "reports.create"), false, "G: read-only cannot create");
});

test("§fp H/J: removing access removes visibility; a grant persists across re-reads (refresh/re-login)", async () => {
  const access = await import("../lib/project-access.ts");
  newProject("fp-hj", "HJ");
  const foreman = makeUser("Foreman", "fp-hj@test");
  asRoleDefault(foreman.id, "fp-hj");
  assert.equal(perms.canAccessProject(foreman, "fp-hj"), true);
  // J: a fresh SessionUser (as a new request/login would build) still resolves the grant.
  const relogin = { id: foreman.id, email: foreman.email, name: foreman.name, role: "Foreman" };
  assert.equal(perms.canAccessProject(relogin, "fp-hj"), true, "J: grant survives re-login/refresh (persisted)");
  // H: 'No project access' (explicit none) removes visibility while the row remains.
  repo.setProjectPermission(foreman.id, "fp-hj", access.presetCapabilities("none")!, 1);
  assert.equal(perms.canAccessProject(foreman, "fp-hj"), false, "H: 'none' revokes visibility");
  // H (row-delete path also removes visibility).
  repo.removeProjectPermission(foreman.id, "fp-hj");
  assert.equal(perms.canAccessProject(foreman, "fp-hj"), false);
});

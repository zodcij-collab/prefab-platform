import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";
import { portalText } from "../data/portal-i18n.ts";

let ctx: TestDb; let repo: TestDb["repo"];
let perms: typeof import("../lib/permissions.ts");
function newProject(id: string) {
  repo.createProject({ id, name: id, location: "Rīga", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}
before(async () => { ctx = await setupTestDb(); repo = ctx.repo; perms = await import("../lib/permissions.ts"); });
after(() => ctx.cleanup());

test("§AS/AT: Foreman daily-ops capabilities are project-scoped and require explicit project access", () => {
  newProject("rb-a"); newProject("rb-b");
  const uid = Number(repo.createUserAccess({ name: "F", email: "f-s15@test", role: "Foreman", active: 1, passwordHash: "s:h" }).lastInsertRowid);
  const foreman = { id: uid, email: "f-s15@test", name: "F", role: "Foreman" };
  // §AT: no project access anywhere yet → no daily-ops on any project.
  assert.equal(perms.canViewDailyLog(foreman, "rb-a"), false, "role alone grants no project daily-ops access");
  assert.equal(perms.canManageProjectAttendance(foreman, "rb-a"), false);
  // Grant Default-for-role (empty override = membership + role caps) on A only.
  repo.setProjectPermission(uid, "rb-a", {}, 1);
  assert.equal(perms.canViewDailyLog(foreman, "rb-a"), true, "§AS: Foreman gets daily-log on the granted project");
  assert.equal(perms.canManageProjectAttendance(foreman, "rb-a"), true);
  assert.equal(perms.canConfirmDailyLog(foreman, "rb-a"), true);
  assert.equal(perms.canCaptureSitePhotos(foreman, "rb-a"), true);
  assert.equal(perms.canAssignProjectPersonnel(foreman, "rb-a"), true);
  assert.equal(perms.canManageProjectInduction(foreman, "rb-a"), true);
  // §AS: strictly scoped — project B (no grant) remains closed.
  assert.equal(perms.canViewDailyLog(foreman, "rb-b"), false, "access to A does not leak to B");
});

test("§AU/§25: Foreman is NOT an HR manager and cannot see sensitive personnel data or manage personnel", () => {
  const foreman = { id: 5, email: "f2@test", name: "F2", role: "Foreman" };
  assert.equal(perms.canViewPersonnel(foreman), true, "operational personnel visibility");
  assert.equal(perms.canViewPersonnelSensitive(foreman), false, "§25: NO sensitive HR data");
  assert.equal(perms.canViewPersonnelDocuments(foreman), false, "§25: NO private HR documents");
  assert.equal(perms.canManagePersonnel(foreman), false, "§AU: cannot manage personnel");
});

test("§AV: Director / Administrator have full personnel lifecycle + sensitive access", () => {
  for (const role of ["Director", "Administrator"]) {
    const u = { id: 1, email: "a@test", name: "A", role };
    assert.equal(perms.canManagePersonnel(u), true);
    assert.equal(perms.canViewPersonnelSensitive(u), true);
    assert.equal(perms.canManagePersonnelDocuments(u), true);
    assert.equal(perms.canViewDailyLog(u, "rb-a"), true, "global roles access every project");
  }
  // Project Manager also manages personnel (company HR), Employee does not view.
  assert.equal(perms.canManagePersonnel({ id: 2, email: "p@test", name: "P", role: "Project Manager" }), true);
  assert.equal(perms.canViewPersonnel({ id: 3, email: "e@test", name: "E", role: "Employee" }), false);
});

test("§AW/§AX: all Sprint 15 surfaces are localized in LV and RU (no English fallback)", () => {
  const keys = [
    "Personnel", "Personnel register", "Daily log", "Daily site log", "Daily report", "Site photos", "Today", "Project personnel", "Safety induction", "Attendance", "Safety record", "Offboarding",
    "Qualifications", "Qualifications / Certificates", "Documents", "Skills", "Workwear", "Health examination (OVP)", "Emergency contact",
    "Date of birth", "Personal code", "Jacket size", "Trousers size", "Shoe size", "Upload photo",
    "Examination date", "Valid until", "Add OVP", "OVP status", "Category", "Custom title", "Certificate number", "Add qualification", "Remove", "Attach document",
    "Valid", "Expiring soon", "Expired", "No expiry",
    "Assign to project", "Project role", "Assigned employees", "Unassign", "Induction completed", "Induction not completed", "Completed", "Not completed", "Record induction",
    "Shift start", "Shift end", "Mark all present", "Present", "Absent", "Late", "Left early", "Worked hours", "Workers present", "Total man-hours", "Man-hours", "Workers on site", "Start time", "End time",
    "Severity", "Observation", "Minor", "Major", "Critical", "Description", "Action taken", "Record observation", "Last 12 months",
    "Start offboarding", "Complete offboarding", "Checklist", "Not checked", "Closed", "Problem", "Termination date", "Termination reason", "Unresolved items remain", "Employee resignation", "End of contract", "Employer termination", "Other",
    "Work performed", "Delays / downtime", "Delay reason", "Site events", "Temporary equipment", "Materials note", "Foreman comments", "Save daily log",
    "Draft", "Confirmed", "Confirm daily log", "Reopen to draft", "Open daily log", "Open Daily Report PDF", "Confirming freezes this report as a historical snapshot.", "Reopening a confirmed report is a historical modification and is audited.",
    "Installed elements", "Deliveries", "Defects", "Tasks", "Critical items", "Safety observations", "Automatically aggregated", "Manual entry",
    "Capture site photo", "Include in daily report", "Included", "Not included", "Zone / floor", "Caption", "No site photos yet.",
    "Weather", "Load", "Responsible", "Confirmed by", "Report status", "Open Tasks", "Open Defects", "Sensitive personnel data is visible to managers only.",
  ];
  for (const key of keys) {
    assert.notEqual(portalText("lv", key), key, `LV missing: ${key}`);
    assert.notEqual(portalText("ru", key), key, `RU missing: ${key}`);
  }
});

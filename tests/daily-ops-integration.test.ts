import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";

let ctx: TestDb; let repo: TestDb["repo"]; let issues: TestDb["issues"];
let ops: typeof import("../lib/daily-ops-repo.ts");
const actor = { id: 1, name: "Foreman" };
let seq = 0;
function newProject(id: string) {
  repo.createProject({ id, name: id.toUpperCase(), location: "Rīga", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}
function newEmployee(): string {
  const id = `emp-d-${++seq}`;
  repo.createEmployee({ id, firstName: "Emp", lastName: String(seq), role: "Assembler", phone: "1", email: "", status: "Active", defaultProjectId: null, employmentStartDate: "2026-01-01", employmentEndDate: "", notes: "" });
  return id;
}

before(async () => {
  ctx = await setupTestDb(); repo = ctx.repo; issues = ctx.issues;
  ops = await import("../lib/daily-ops-repo.ts");
});
after(() => ctx.cleanup());

test("§AG: exactly one daily log per (project, date) — reopening the day returns the same log", () => {
  newProject("dl-1");
  const a = ops.getOrCreateDailyLog("dl-1", "2026-08-17", actor);
  const b = ops.getOrCreateDailyLog("dl-1", "2026-08-17", actor);
  assert.equal(a.id, b.id, "same log identity for the same project+date");
  assert.equal(a.status, "Draft");
});

test("§S–Y: crew default shift + Mark all present + late/early/absent exceptions → man-hours", () => {
  newProject("dl-att");
  const e1 = newEmployee(), e2 = newEmployee(), e3 = newEmployee(), e4 = newEmployee();
  const log = ops.getOrCreateDailyLog("dl-att", "2026-08-17", actor);
  ops.setDailyLogShift(log.id, "07:00", "16:00", actor);
  ops.markCrewPresent(log.id, [e1, e2, e3, e4], actor); // all 9h
  ops.upsertAttendance(log.id, e2, { status: "Late", startTime: "09:00", endTime: "", comment: "traffic" }, actor); // 7h
  ops.upsertAttendance(log.id, e3, { status: "Left early", startTime: "", endTime: "12:00", comment: "" }, actor); // 5h
  ops.upsertAttendance(log.id, e4, { status: "Absent", startTime: "", endTime: "", comment: "sick" }, actor); // 0h
  const rows = ops.listDailyLogAttendance(log.id);
  const byId = Object.fromEntries(rows.map((r) => [r.employeeId, r.workedHours]));
  assert.equal(byId[e1], 9); assert.equal(byId[e2], 7); assert.equal(byId[e3], 5); assert.equal(byId[e4], 0);
  const agg = ops.aggregateDailyLog(ops.getDailyLogById(log.id)!);
  assert.equal(agg.workforce.present, 3); assert.equal(agg.workforce.absent, 1);
  assert.equal(agg.workforce.manHours, 21, "§Y: 9+7+5+0 total man-hours");
});

test("§AH: the daily log aggregates existing project facts (installed elements, loads, issues)", () => {
  newProject("dl-agg");
  const elId = repo.saveProjectElement({ projectId: "dl-agg", code: "W-1", elementType: "Wall panel", floor: "1", zone: "A", drawingRef: "", description: "", weight: 1, length: 1, width: 1, height: 1, supplier: "", plannedDeliveryDate: "", actualDeliveryDate: "", status: "Planned", issueNote: "", notes: "" }, actor) as number;
  ctx.db.prepare("UPDATE project_elements SET status='Installed', installation_date='2026-08-17' WHERE id=?").run(elId);
  issues.createQuickCapture({ projectId: "dl-agg", title: "Cracked", details: "", type: "Defect", actor });
  issues.createQuickCapture({ projectId: "dl-agg", title: "Fix rail", details: "", type: "Task", actor });
  const log = ops.getOrCreateDailyLog("dl-agg", "2026-08-17", actor);
  const agg = ops.aggregateDailyLog(log);
  assert.equal(agg.installedElements.length, 1, "installed element on the date is aggregated");
  assert.equal(agg.installedElements[0].code, "W-1");
  assert.equal(agg.defects.length, 1); assert.equal(agg.tasks.length, 1);
});

test("§AJ/AK: confirmation persists an immutable snapshot; later live changes do NOT alter it", () => {
  newProject("dl-snap");
  issues.createQuickCapture({ projectId: "dl-snap", title: "Open defect", details: "", type: "Defect", actor });
  const log = ops.getOrCreateDailyLog("dl-snap", "2026-08-17", actor);
  ops.updateDailyLogFields(log.id, { workPerformed: "Poured slab", delays: "", delayReason: "", siteEvents: "", equipmentNote: "", materialsNote: "", foremanComment: "" }, actor);
  ops.confirmDailyLog(log.id, actor);
  const confirmed = ops.getDailyLogById(log.id)!;
  assert.equal(confirmed.status, "Confirmed");
  const snapAtConfirm = ops.dailyLogSnapshot(confirmed);
  assert.equal(snapAtConfirm.defects.length, 1);
  assert.equal(snapAtConfirm.manual.workPerformed, "Poured slab");
  // A live change AFTER confirmation: another defect is captured (live open defects becomes 2).
  issues.createQuickCapture({ projectId: "dl-snap", title: "New later defect", details: "", type: "Defect", actor });
  assert.equal(ops.aggregateDailyLog(ops.getDailyLogById(log.id)!).defects.length, 2, "the LIVE aggregate reflects the new defect");
  const snapAfter = ops.dailyLogSnapshot(ops.getDailyLogById(log.id)!);
  assert.equal(snapAfter.defects.length, 1, "§AK: the confirmed snapshot is frozen — the new defect does not appear");
  assert.equal(snapAfter.manual.workPerformed, "Poured slab");
});

test("§AI/AL/AM: draft reflects live data; reopen is audited; reconfirm rebuilds the snapshot", () => {
  newProject("dl-reopen");
  const log = ops.getOrCreateDailyLog("dl-reopen", "2026-08-17", actor);
  ops.confirmDailyLog(log.id, actor);
  assert.throws(() => ops.updateDailyLogFields(log.id, { workPerformed: "x", delays: "", delayReason: "", siteEvents: "", equipmentNote: "", materialsNote: "", foremanComment: "" }, actor), /confirmed/i, "confirmed is read-only");
  ops.reopenDailyLog(log.id, actor);
  assert.equal(ops.getDailyLogById(log.id)!.status, "Draft", "§AL: reopened to draft");
  assert.ok(repo.listActivity(50).some((a) => a.action === "Daily log reopened"), "§AL: reopen is audited");
  // §AI: draft now editable + reflects a fresh fact; §AM: reconfirm produces the updated snapshot.
  ops.updateDailyLogFields(log.id, { workPerformed: "Revised note", delays: "", delayReason: "", siteEvents: "", equipmentNote: "", materialsNote: "", foremanComment: "" }, actor);
  ops.confirmDailyLog(log.id, actor);
  assert.equal(ops.dailyLogSnapshot(ops.getDailyLogById(log.id)!).manual.workPerformed, "Revised note");
});

test("§AN/AO: a site photo is project-scoped/private and carries the include-in-daily flag", () => {
  newProject("dl-photo");
  const inDaily = ops.addSitePhoto({ projectId: "dl-photo", photoDate: "2026-08-17", area: "Zone A", caption: "rebar", author: "F", originalFilename: "p.jpg", storedPath: "photos/p.jpg", fileSize: 10, mimeType: "image/jpeg", includeInDaily: true, issueId: null, installationZoneId: null, uploadedById: 1 }, actor);
  ops.addSitePhoto({ projectId: "dl-photo", photoDate: "2026-08-17", area: "", caption: "private", author: "F", originalFilename: "q.jpg", storedPath: "photos/q.jpg", fileSize: 10, mimeType: "image/jpeg", includeInDaily: false, issueId: null, installationZoneId: null, uploadedById: 1 }, actor);
  assert.equal(ops.listSitePhotos("dl-photo", { date: "2026-08-17" }).length, 2, "§AN: project-scoped photos");
  const log = ops.getOrCreateDailyLog("dl-photo", "2026-08-17", actor);
  const agg = ops.aggregateDailyLog(log);
  assert.equal(agg.photos.length, 1, "§AO: only include-in-daily photos reach the report");
  assert.equal(agg.photos[0].id, inDaily, "referenced by id (one media fact, no duplicate binary)");
});

// Regression — Site Photos hang blocker (Sprint 15 manual acceptance).
// A server action that processes a multipart FILE UPLOAD must NOT call redirect(): the redirect
// response races the still-streaming request body and the browser aborts it (net::ERR_ABORTED),
// hanging the page indefinitely (F5 cannot recover). Upload actions must revalidatePath in place.
test("§blocker: the Site Photos upload actions revalidate in place and never redirect() (prevents the multipart-upload hang)", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(process.cwd(), "app/portal/projects/[id]/site-photos/actions.ts"), "utf8");
  // redirect() is imported from next/navigation — its absence proves no redirect can be issued
  // (robust to explanatory comments that mention the word). The page revalidates in place instead.
  assert.doesNotMatch(src, /from ["']next\/navigation["']/, "site-photos actions must not import redirect from next/navigation");
  assert.match(src, /revalidatePath\(/, "they revalidate the page in place instead");
  // The personnel upload actions (also multipart) must follow the same in-place pattern.
  const personnel = readFileSync(join(process.cwd(), "app/portal/employees/personnel-actions.ts"), "utf8");
  assert.doesNotMatch(personnel, /from ["']next\/navigation["']/, "personnel upload actions must not redirect either");
});

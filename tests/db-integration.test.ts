import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";

// Integration tests run against a disposable temporary SQLite database created by
// setupTestDb(). They never touch the real data/prefab.db. Each test uses its own
// project id so the shared temporary database stays deterministic and independent.

let ctx: TestDb;
let repo: TestDb["repo"];
let db: TestDb["db"];
const actor = { id: 1, name: "Test Director" };

before(async () => {
  ctx = await setupTestDb();
  repo = ctx.repo;
  db = ctx.db;
});

after(() => ctx.cleanup());

function must<T>(value: T | undefined | null): T {
  assert.ok(value !== undefined && value !== null, "expected a value");
  return value as T;
}

function historyCount(elementId: number): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM element_status_history WHERE element_id=?").get(elementId) as { c: number }).c;
}

function newProject(id: string, name: string) {
  repo.createProject({ id, name, location: "Rīga, LV", client: "Test Client", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}

function newElement(projectId: string, code: string, overrides: Partial<Parameters<typeof repo.saveProjectElement>[0]> = {}): number {
  return repo.saveProjectElement({ projectId, code, elementType: "Wall panel", floor: "1", zone: "A", drawingRef: "", description: "", weight: 1000, length: null, width: null, height: null, supplier: "", plannedDeliveryDate: "", actualDeliveryDate: "", status: "Planned", issueNote: "", notes: "", ...overrides }, actor) as number;
}

function submitReport(projectId: string, projectName: string, date: string): number {
  return repo.saveDailyReport({ projectId, project: projectName, date, work: "Installation", weather: "", materials: "", equipment: "", problems: "", safety: "", additionalNotes: "", author: "Test", reporterUserId: 1, reporterEmployeeId: null, status: "Submitted", attendance: [] });
}

function installElement(projectId: string, projectName: string, elementId: number, date: string): number {
  const reportId = submitReport(projectId, projectName, date);
  repo.syncReportElements(reportId, projectId, [elementId]);
  repo.runTransaction(() => {
    const result = repo.approveDailyReport(reportId, actor.id);
    if (!result.changes) throw new Error("report was not approved");
    repo.finalizeReportElements(reportId, date, actor);
  });
  return reportId;
}

// A. Approved Daily Report finalizes installation atomically with correct state and history.
test("A: approved Daily Report finalizes element installation atomically", () => {
  const projectId = "it-a-install";
  newProject(projectId, "IT A Install");
  const elementId = newElement(projectId, "A-1");
  const beforeHistory = historyCount(elementId);
  const date = "2026-08-11";

  const reportId = installElement(projectId, "IT A Install", elementId, date);

  const element = must(repo.getProjectElement(elementId));
  assert.equal(element.status, "Installed");
  assert.equal(element.installedReportId, reportId);
  assert.equal(element.installationDate, date);
  assert.equal(historyCount(elementId), beforeHistory + 1);
  const history = repo.listElementHistory(elementId);
  assert.equal(history[0].toStatus, "Installed");
  assert.equal(history[0].reportId, reportId);
  const report = must(repo.getReport(reportId));
  assert.equal(report.status, "Approved");
});

// B. If one linked element cannot be finalized, the whole approval rolls back — no partial install.
test("B: installation finalization rolls back completely when one element is blocked", () => {
  const projectId = "it-b-rollback";
  newProject(projectId, "IT B Rollback");
  const good = newElement(projectId, "B-1");
  const blocked = newElement(projectId, "B-2");
  const date = "2026-08-11";
  const reportId = submitReport(projectId, "IT B Rollback", date);
  repo.syncReportElements(reportId, projectId, [good, blocked]);
  // Make the second element non-installable after linking, forcing finalize to abort mid-batch.
  db.prepare("UPDATE project_elements SET status='Issue' WHERE id=?").run(blocked);
  const goodHistoryBefore = historyCount(good);

  assert.throws(() =>
    repo.runTransaction(() => {
      repo.approveDailyReport(reportId, actor.id);
      repo.finalizeReportElements(reportId, date, actor);
    }),
  );

  const goodElement = must(repo.getProjectElement(good));
  assert.equal(goodElement.status, "Planned");
  assert.equal(goodElement.installedReportId, null);
  assert.equal(historyCount(good), goodHistoryBefore, "no installation history is left behind after rollback");
  const report = must(repo.getReport(reportId));
  assert.equal(report.status, "Submitted", "approval rolled back with the failed finalization");
});

// C. The database trigger rejects a direct status change away from Installed; the correction workflow still works.
test("C: installed correction guard blocks direct mutation but allows the correction workflow", () => {
  const projectId = "it-c-guard";
  newProject(projectId, "IT C Guard");
  const elementId = newElement(projectId, "C-1");
  installElement(projectId, "IT C Guard", elementId, "2026-08-11");
  assert.equal(must(repo.getProjectElement(elementId)).status, "Installed");

  assert.throws(
    () => db.prepare("UPDATE project_elements SET status='On site' WHERE id=?").run(elementId),
    /correction workflow/,
    "trigger rejects a raw downgrade of an installed element",
  );
  assert.equal(must(repo.getProjectElement(elementId)).status, "Installed");

  repo.correctInstalledElement(elementId, "On site", "Panel damaged during inspection", actor);
  const corrected = must(repo.getProjectElement(elementId));
  assert.equal(corrected.status, "On site");
  assert.equal(corrected.installedReportId, null);
  assert.equal(repo.listElementHistory(elementId)[0].toStatus, "On site");
});

// D. A valid Preview -> Applying -> Applied synchronization lifecycle inserts new elements transactionally.
test("D: XLSX synchronization apply completes the Preview→Applying→Applied lifecycle", () => {
  const projectId = "it-d-apply";
  newProject(projectId, "IT D Apply");
  const importId = repo.createElementImport({ projectId, originalFilename: "register.xlsx", sourceRevision: "Rev A", sourceHash: "hash-d", worksheetName: "Sheet1", mappingJson: "{}", payloadJson: "[]", summaryJson: "{}", status: "Preview", notes: "", importedById: 1, importedBy: "Test" });
  const rows = [
    { row: 2, code: "D-1", elementType: "Wall panel", floor: "1", zone: "A", drawingRef: "", description: "", weight: 1000, length: null, width: null, height: null, supplier: "", plannedDeliveryDate: "" },
    { row: 3, code: "D-2", elementType: "Beam", floor: "1", zone: "A", drawingRef: "", description: "", weight: 800, length: null, width: null, height: null, supplier: "", plannedDeliveryDate: "" },
  ];

  repo.runTransaction(() => {
    assert.equal(Number(repo.beginElementImportApply(importId, projectId).changes), 1);
    repo.applyElementImport(importId, projectId, "Rev A", rows, {}, actor);
  });

  const applied = must(repo.getElementImport(importId));
  assert.equal(applied.status, "Applied");
  assert.equal(applied.appliedBy, actor.name);
  const elements = repo.listProjectElements(projectId);
  assert.equal(elements.length, 2);
  assert.ok(elements.every((element) => element.status === "Planned"));
  for (const element of elements) {
    const history = repo.listElementHistory(element.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].toStatus, "Planned");
    assert.match(history[0].note, /XLSX synchronization/);
  }
});

// E. Re-applying an already-applied synchronization produces no duplicate elements or history.
test("E: an already-applied synchronization is not applied again and creates no duplicates", () => {
  const projectId = "it-e-duplicate";
  newProject(projectId, "IT E Duplicate");
  const hash = "hash-e";
  const firstImport = repo.createElementImport({ projectId, originalFilename: "register.xlsx", sourceRevision: "Rev A", sourceHash: hash, worksheetName: "Sheet1", mappingJson: "{}", payloadJson: "[]", summaryJson: "{}", status: "Preview", notes: "", importedById: 1, importedBy: "Test" });
  const rows = [{ row: 2, code: "E-1", elementType: "Wall panel", floor: "1", zone: "A", drawingRef: "", description: "", weight: 1000, length: null, width: null, height: null, supplier: "", plannedDeliveryDate: "" }];
  repo.runTransaction(() => {
    repo.beginElementImportApply(firstImport, projectId);
    repo.applyElementImport(firstImport, projectId, "Rev A", rows, {}, actor);
  });

  const elementCountAfterFirst = repo.listProjectElements(projectId).length;
  const elementId = repo.listProjectElements(projectId)[0].id;
  const historyAfterFirst = historyCount(elementId);
  assert.equal(elementCountAfterFirst, 1);

  // The applied import is detectable and its lifecycle cannot be re-entered.
  assert.equal(repo.hasAppliedElementImport(projectId, hash), true);
  assert.equal(must(repo.getAppliedElementImport(projectId, hash)).id, firstImport);
  assert.equal(Number(repo.beginElementImportApply(firstImport, projectId).changes), 0, "an Applied import cannot re-enter the Applying state");

  // A fresh Preview with the same source hash must be short-circuited by the guard the apply action relies on.
  const secondImport = repo.createElementImport({ projectId, originalFilename: "register.xlsx", sourceRevision: "Rev A", sourceHash: hash, worksheetName: "Sheet1", mappingJson: "{}", payloadJson: JSON.stringify(rows), summaryJson: "{}", status: "Preview", notes: "", importedById: 1, importedBy: "Test" });
  const guard = repo.getAppliedElementImport(projectId, hash);
  assert.ok(guard, "guard detects the prior applied import so the caller must not re-apply");
  assert.notEqual(guard.id, secondImport);

  assert.equal(repo.listProjectElements(projectId).length, elementCountAfterFirst, "no duplicate elements were created");
  assert.equal(historyCount(elementId), historyAfterFirst, "no duplicate history was created");
});

// F. Two physical elements may share the same code in one project while keeping distinct immutable IDs.
test("F: repeated physical marks are separate elements with distinct immutable IDs", () => {
  const projectId = "it-f-repeated";
  newProject(projectId, "IT F Repeated");
  const first = newElement(projectId, "VS-101");
  const second = newElement(projectId, "VS-101");

  assert.notEqual(first, second);
  assert.equal(must(repo.getProjectElement(first)).code, "VS-101");
  assert.equal(must(repo.getProjectElement(second)).code, "VS-101");
  assert.equal(repo.listProjectElements(projectId).length, 2);
});

// G. Design synchronization updates design fields but never overwrites operational state or history.
test("G: synchronization updates design data and preserves operational state", () => {
  const projectId = "it-g-preserve";
  newProject(projectId, "IT G Preserve");
  const elementId = newElement(projectId, "G-1", { status: "On site", actualDeliveryDate: "2026-07-30" });
  const date = "2026-08-11";
  const reportId = installElement(projectId, "IT G Preserve", elementId, date);

  const beforeHistory = historyCount(elementId);
  const installed = must(repo.getProjectElement(elementId));
  assert.equal(installed.status, "Installed");

  const importId = repo.createElementImport({ projectId, originalFilename: "register.xlsx", sourceRevision: "Rev B", sourceHash: "hash-g", worksheetName: "Sheet1", mappingJson: "{}", payloadJson: "[]", summaryJson: "{}", status: "Preview", notes: "", importedById: 1, importedBy: "Test" });
  const syncedRow = { row: 2, matchedElementId: elementId, code: "G-1", elementType: "Beam", floor: "2", zone: "Z", drawingRef: "DR-9", description: "Synced description", weight: 5000, length: null, width: null, height: null, supplier: "ACME", plannedDeliveryDate: "2026-09-01" };
  repo.runTransaction(() => {
    repo.beginElementImportApply(importId, projectId);
    repo.applyElementImport(importId, projectId, "Rev B", [syncedRow], {}, actor);
  });

  const after = must(repo.getProjectElement(elementId));
  // Design data updated:
  assert.equal(after.elementType, "Beam");
  assert.equal(after.floor, "2");
  assert.equal(after.description, "Synced description");
  assert.equal(after.weight, 5000);
  assert.equal(after.supplier, "ACME");
  assert.equal(after.plannedDeliveryDate, "2026-09-01");
  // Operational state preserved:
  assert.equal(after.status, "Installed");
  assert.equal(after.actualDeliveryDate, "2026-07-30");
  assert.equal(after.installationDate, date);
  assert.equal(after.installedReportId, reportId);
  assert.equal(historyCount(elementId), beforeHistory, "synchronization appends no operational history to matched elements");
});

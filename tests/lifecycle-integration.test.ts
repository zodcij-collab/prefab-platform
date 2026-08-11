import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";

let ctx: TestDb;
let repo: TestDb["repo"];
let archive: typeof import("../lib/project-archive.ts");
const actor = { id: 1, name: "Test Director" };

function newProject(id: string, name: string) {
  repo.createProject({ id, name, location: "Rīga", client: "Client", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}
function newEmployee(id: string, first: string) {
  repo.createEmployee({ id, firstName: first, lastName: "Test", role: "Welder", phone: "", email: "", status: "Active", defaultProjectId: null, employmentStartDate: "", employmentEndDate: "", notes: "" });
}

before(async () => {
  ctx = await setupTestDb();
  repo = ctx.repo;
  archive = await import("../lib/project-archive.ts");
});
after(() => ctx.cleanup());

test("project archive and restore toggle the archived state", () => {
  newProject("lc-project", "Lifecycle");
  assert.equal(repo.getProject("lc-project")!.archivedAt, "");
  repo.archiveProject("lc-project", actor.id);
  assert.notEqual(repo.getProject("lc-project")!.archivedAt, "");
  assert.equal(repo.getProject("lc-project")!.archivedById, actor.id);
  repo.restoreProject("lc-project");
  assert.equal(repo.getProject("lc-project")!.archivedAt, "");
  assert.equal(repo.getProject("lc-project")!.archivedById, null);
});

test("archived (Inactive) employees drop out of active project workforce but stay in the register", () => {
  newProject("lc-wf", "Workforce");
  newEmployee("emp-lc-1", "Anna");
  repo.assignProjectMember("lc-wf", "emp-lc-1", "Team member");
  assert.ok(repo.listProjectWorkforce("lc-wf").some((e) => e.id === "emp-lc-1"));
  repo.setEmployeeStatus("emp-lc-1", "Inactive", "2026-08-11");
  assert.equal(repo.listProjectWorkforce("lc-wf").some((e) => e.id === "emp-lc-1"), false, "archived employee hidden from active workforce");
  assert.ok(repo.listEmployees().some((e) => e.id === "emp-lc-1"), "still present in the full register");
  repo.restoreEmployee("emp-lc-1");
  assert.equal(repo.getEmployee("emp-lc-1")!.status, "Active");
});

test("employee hard-delete is only safe without protected history", () => {
  newEmployee("emp-lc-clean", "Clean");
  assert.equal(repo.employeeProtectedHistoryCount("emp-lc-clean"), 0);
  repo.deleteEmployee("emp-lc-clean");
  assert.equal(repo.getEmployee("emp-lc-clean"), undefined);

  newProject("lc-hist", "History");
  newEmployee("emp-lc-hist", "Hist");
  const reportId = repo.saveDailyReport({ projectId: "lc-hist", project: "History", date: "2026-08-11", work: "x", weather: "", materials: "", equipment: "", problems: "", safety: "", additionalNotes: "", author: "R", reporterUserId: 1, reporterEmployeeId: null, status: "Draft", attendance: [{ employeeId: "emp-lc-hist", status: "Worked", regularHours: 8, overtimeHours: 0, comment: "" }] });
  assert.ok(reportId > 0);
  assert.ok(repo.employeeProtectedHistoryCount("emp-lc-hist") > 0, "attendance history blocks hard delete");
});

test("project archive package produces a manifest with record counts, data files and checksums", () => {
  newProject("lc-export", "Export Me");
  const elementId = repo.saveProjectElement({ projectId: "lc-export", code: "EX-1", elementType: "Wall panel", floor: "1", zone: "A", drawingRef: "", description: "", weight: 1000, length: null, width: null, height: null, supplier: "", plannedDeliveryDate: "", actualDeliveryDate: "", status: "Planned", issueNote: "", notes: "" }, actor) as number;
  repo.saveDailyReport({ projectId: "lc-export", project: "Export Me", date: "2026-08-11", work: "work", weather: "", materials: "", equipment: "", problems: "", safety: "", additionalNotes: "", author: "R", reporterUserId: 1, reporterEmployeeId: null, status: "Submitted", attendance: [] });

  const { manifest, files } = archive.collectProjectArchive("lc-export", "Test Director", "2026-08-11T00:00:00Z");
  assert.equal(manifest.projectId, "lc-export");
  assert.equal(manifest.schemaVersion, archive.ARCHIVE_SCHEMA_VERSION);
  assert.equal(manifest.exportedBy, "Test Director");
  assert.equal(manifest.recordCounts.elements, 1);
  assert.equal(manifest.recordCounts.reports, 1);
  assert.ok(files["manifest.json"]);
  assert.ok(files["data/project.json"]);
  assert.ok(files["data/elements.json"]);
  // Checksums cover every data file.
  for (const name of manifest.dataFiles) assert.match(manifest.checksums[name], /^[0-9a-f]{64}$/);
  // Physical stored paths are not exposed in the exported JSON.
  assert.equal(files["data/documents.json"].includes("storedPath"), false);
  assert.ok(elementId > 0);
});

// Sprint 11.3.2 §2 — a new project starts with zero project documents, and company
// Library records never leak into project documents (separate tables/queries).
test("project documents are strictly project-scoped and never include company Library records", () => {
  newProject("doc-a", "Doc A");
  newProject("doc-b", "Doc B");
  assert.equal(repo.listProjectDocuments("doc-a").length, 0, "a fresh project has no documents");

  const library = repo.listDocuments();
  assert.ok(library.length > 0, "seeded company Library exists and is separate");

  repo.createProjectDocument({ projectId: "doc-a", title: "Method Statement", category: "Method statements", revision: "Rev.0", documentDate: "2026-08-11", status: "Current", description: "", originalFilename: "ms.pdf", storedPath: "documents/ms-doc-a.pdf", fileSize: 1000, mimeType: "application/pdf", uploadedById: 1, uploadedBy: "Test" });

  const aDocs = repo.listProjectDocuments("doc-a");
  assert.equal(aDocs.length, 1);
  assert.ok(aDocs.every((d) => d.projectId === "doc-a"));
  assert.equal(repo.listProjectDocuments("doc-b").length, 0, "another project's list stays empty (no cross-project leak)");

  const libraryTitles = new Set(library.map((l) => l.name));
  assert.ok(aDocs.every((d) => !libraryTitles.has(d.title)), "no company Library record surfaces as a project document");
});

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";

// DB-backed Load Planning tests against a disposable database. Never the pilot DB.
let ctx: TestDb;
let repo: TestDb["repo"];
let db: TestDb["db"];
const actor = { id: 1, name: "Test" };

function newProject(id: string, name: string) {
  repo.createProject({ id, name, location: "Rīga", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}
function newElement(projectId: string, code: string, overrides: Record<string, unknown> = {}): number {
  return repo.saveProjectElement({ projectId, code, elementType: "Wall panel", floor: "1", zone: "A", drawingRef: "", description: "", weight: 10, length: 8000, width: 300, height: 3000, supplier: "", plannedDeliveryDate: "", actualDeliveryDate: "", status: "Planned", issueNote: "", notes: "", ...overrides }, actor) as number;
}
function draftLoad(projectId: string): number {
  const number = repo.nextProjectLoadNumber(projectId);
  return repo.createLoad({ projectId, loadNumber: number, status: "Draft", plannedDate: "", plannedTime: "", transportProfileId: null, recommendedProfileId: null, loadingDirection: "forward", orientationNote: "", note: "", createdById: actor.id, createdBy: actor.name });
}
const alloc = (elementId: number, position: number) => ({ elementId, position, orientation: "Vertical", intent: "Direct erection", note: "" });

before(async () => { ctx = await setupTestDb(); repo = ctx.repo; db = ctx.db; });
after(() => ctx.cleanup());

test("placeholder transport profiles are seeded and flagged as requiring carrier confirmation", () => {
  const profiles = repo.listTransportProfiles();
  assert.ok(profiles.length >= 3);
  assert.ok(profiles.every((p) => p.placeholder === 1));
  assert.match(profiles[0].note, /carrier confirmation/i);
});

test("A: a load holds multiple physical elements in persisted order", () => {
  newProject("ld-a", "A");
  const e1 = newElement("ld-a", "BPL-01"), e2 = newElement("ld-a", "BPL-02"), e3 = newElement("ld-a", "BPL-03");
  const loadId = draftLoad("ld-a");
  repo.replaceLoadElements(loadId, "ld-a", 1, [alloc(e3, 0), alloc(e1, 1), alloc(e2, 2)]);
  const rows = repo.listLoadElements(loadId);
  assert.deepEqual(rows.map((r) => r.elementId), [e3, e1, e2]);
  assert.deepEqual(rows.map((r) => r.code), ["BPL-03", "BPL-01", "BPL-02"]);
});

test("B: two elements sharing a code but distinct IDs are allocated independently", () => {
  newProject("ld-b", "B");
  const first = newElement("ld-b", "VS-101"), second = newElement("ld-b", "VS-101");
  assert.notEqual(first, second);
  const l1 = draftLoad("ld-b"); repo.replaceLoadElements(l1, "ld-b", 1, [alloc(first, 0)]);
  const l2 = draftLoad("ld-b"); repo.replaceLoadElements(l2, "ld-b", 1, [alloc(second, 0)]);
  assert.deepEqual(repo.listLoadElements(l1).map((r) => r.elementId), [first]);
  assert.deepEqual(repo.listLoadElements(l2).map((r) => r.elementId), [second]);
});

test("C: the same element ID cannot belong to two active loads (repo guard + DB index)", () => {
  newProject("ld-c", "C");
  const e = newElement("ld-c", "X-1");
  const l1 = draftLoad("ld-c"); repo.replaceLoadElements(l1, "ld-c", 1, [alloc(e, 0)]);
  const l2 = draftLoad("ld-c");
  assert.throws(() => repo.replaceLoadElements(l2, "ld-c", 1, [alloc(e, 0)]), /already allocated to another active load/);
  // Hard DB guarantee: a raw active insert of an already-allocated element is rejected by the partial unique index.
  assert.throws(() => db.prepare("INSERT INTO load_elements(load_id,element_id,active_alloc) VALUES(?,?,1)").run(l2, e));
});

test("D: cancelling a load releases its elements for another load", () => {
  newProject("ld-d", "D");
  const e = newElement("ld-d", "Y-1");
  const l1 = draftLoad("ld-d"); repo.replaceLoadElements(l1, "ld-d", 1, [alloc(e, 0)]);
  repo.cancelLoad(l1, "ld-d");
  assert.equal(repo.getLoad(l1)!.status, "Cancelled");
  const l2 = draftLoad("ld-d");
  repo.replaceLoadElements(l2, "ld-d", 1, [alloc(e, 0)]); // no throw — released
  assert.deepEqual(repo.listLoadElements(l2).map((r) => r.elementId), [e]);
});

test("I: project load numbering is monotonic and does not copy elements into new loads", () => {
  newProject("ld-i", "I");
  const e = newElement("ld-i", "N-1");
  const l1 = draftLoad("ld-i"); assert.equal(repo.getLoad(l1)!.loadNumber, 1);
  repo.replaceLoadElements(l1, "ld-i", 1, [alloc(e, 0)]);
  const next = repo.nextProjectLoadNumber("ld-i"); assert.equal(next, 2);
  const l2 = draftLoad("ld-i");
  assert.equal(repo.getLoad(l2)!.loadNumber, 2);
  assert.equal(repo.listLoadElements(l2).length, 0, "a freshly created next load starts empty");
});

test("J/K: manual element order persists exactly and survives re-read", () => {
  newProject("ld-j", "J");
  const ids = ["a", "b", "c", "d"].map((c) => newElement("ld-j", c));
  const loadId = draftLoad("ld-j");
  const order = [ids[2], ids[0], ids[3], ids[1]];
  repo.replaceLoadElements(loadId, "ld-j", 1, order.map((id, index) => alloc(id, index)));
  assert.deepEqual(repo.listLoadElements(loadId).map((r) => r.elementId), order);
});

test("L: an element from another project cannot be allocated", () => {
  newProject("ld-l1", "L1"); newProject("ld-l2", "L2");
  const foreign = newElement("ld-l2", "F-1");
  const loadId = draftLoad("ld-l1");
  assert.throws(() => repo.replaceLoadElements(loadId, "ld-l1", 1, [alloc(foreign, 0)]), /not available for this project/);
});

test("N: archived projects reject load mutations", () => {
  newProject("ld-n", "N");
  repo.archiveProject("ld-n", actor.id);
  assert.throws(() => repo.assertLoadMutationAllowed("ld-n"), /Archived projects are read-only/);
  repo.restoreProject("ld-n");
  assert.doesNotThrow(() => repo.assertLoadMutationAllowed("ld-n"));
});

test("O/P: load operations never change element installation status or history", () => {
  newProject("ld-o", "O");
  const e = newElement("ld-o", "INV-1");
  const before = repo.getProjectElement(e)!;
  const historyBefore = Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e) as { c: number }).c);
  const loadId = draftLoad("ld-o");
  repo.replaceLoadElements(loadId, "ld-o", 1, [alloc(e, 0)]);
  repo.cancelLoad(loadId, "ld-o");
  const after = repo.getProjectElement(e)!;
  assert.equal(after.status, before.status);
  assert.equal(after.status, "Planned");
  assert.equal(after.installedReportId, before.installedReportId);
  assert.equal(after.installationDate, before.installationDate);
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e) as { c: number }).c), historyBefore, "no element history rows added by load planning");
});

// Sprint 12.0.1 — Create-load contract (regression for the "Create load → 404" report).
// An authorized create produces a Draft whose returned id resolves, so the editor route
// (getLoad(Number(loadId))) renders instead of calling notFound(). The reported 404 was a
// stale .next build cache, not a data/route defect; this locks the data contract.
test("create-load contract: a new Draft load is created and its returned id resolves", () => {
  newProject("ld-create", "Create");
  assert.equal(repo.nextProjectLoadNumber("ld-create"), 1);
  const loadId = repo.createLoad({ projectId: "ld-create", loadNumber: 1, status: "Draft", plannedDate: "", plannedTime: "", transportProfileId: null, recommendedProfileId: null, loadingDirection: "forward", orientationNote: "", note: "", createdById: 1, createdBy: "T" });
  const load = repo.getLoad(loadId); // exactly what the editor page queries before rendering
  assert.ok(load, "the returned/redirected load id resolves (editor renders, not 404)");
  assert.equal(load.status, "Draft");
  assert.equal(load.projectId, "ld-create");
  assert.equal(load.loadNumber, 1);
  assert.equal(repo.nextProjectLoadNumber("ld-create"), 2, "the next create uses a fresh number");
});
test("create-load contract: archived project blocks load creation", () => {
  newProject("ld-create-arch", "Arch");
  repo.archiveProject("ld-create-arch", 1);
  assert.throws(() => repo.assertLoadMutationAllowed("ld-create-arch"), /Archived projects are read-only/);
});

// Sprint 12 fix pack — persistence-on-first-save, rollback, and numbering.
const mkLoad = (projectId: string, number: number, status = "Draft") => repo.createLoad({ projectId, loadNumber: number, status, plannedDate: "", plannedTime: "", transportProfileId: null, recommendedProfileId: null, loadingDirection: "forward", orientationNote: "", note: "", createdById: 1, createdBy: "T" });

test("E: a failed save inside a transaction persists no load and no allocations (full rollback)", () => {
  newProject("ld-e1", "E1"); newProject("ld-e2", "E2");
  const foreign = newElement("ld-e2", "FX");
  assert.throws(() => repo.runTransaction(() => {
    const id = mkLoad("ld-e1", 1);
    repo.replaceLoadElements(id, "ld-e1", 1, [alloc(foreign, 0)]); // throws: element from another project
  }), /not available for this project/);
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM loads WHERE project_id='ld-e1'").get() as { c: number }).c), 0, "no load persisted after rollback");
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM load_elements le JOIN loads l ON l.id=le.load_id WHERE l.project_id='ld-e1'").get() as { c: number }).c), 0, "no orphan allocations");
});

test("F/G: load numbers are consumed only by persisted loads (abandoning consumes nothing)", () => {
  newProject("ld-fg", "FG");
  assert.equal(repo.nextProjectLoadNumber("ld-fg"), 1);
  // Opening the editor never calls createLoad; abandoning it leaves the number free.
  assert.equal(repo.nextProjectLoadNumber("ld-fg"), 1);
  const id = mkLoad("ld-fg", repo.nextProjectLoadNumber("ld-fg"));
  assert.equal(repo.getLoad(id)!.loadNumber, 1);
  assert.equal(repo.nextProjectLoadNumber("ld-fg"), 2, "only a persisted load consumes a number");
});

test("K: two active loads cannot share a number (duplicate-click protection)", () => {
  newProject("ld-k", "K");
  mkLoad("ld-k", 1);
  assert.throws(() => mkLoad("ld-k", 1), /UNIQUE|constraint/i);
  // A cancelled load frees its number for reuse by an active load.
  const c = mkLoad("ld-k", 2); repo.cancelLoad(c, "ld-k");
  assert.doesNotThrow(() => mkLoad("ld-k", 2));
});

// ── Sprint 12 Improvement Pack: Installation Zones ──────────────────
test("Zone: create, bulk-assign, filter and clear — assignment never touches element status/history", () => {
  newProject("zn-a", "Zone A");
  const e1 = newElement("zn-a", "W-1"), e2 = newElement("zn-a", "W-2"), e3 = newElement("zn-a", "W-3");
  const historyBefore = Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e1) as { c: number }).c);
  const zoneId = repo.createInstallationZone("zn-a", "Level 1 – West", "First lift");
  assert.throws(() => repo.createInstallationZone("zn-a", "Level 1 – West", ""), /UNIQUE|constraint/i, "zone names are unique per project");
  assert.equal(repo.assignElementsToInstallationZone("zn-a", [e1, e2], zoneId), 2);
  assert.deepEqual(repo.listProjectElements("zn-a", { installationZoneId: zoneId }).map((r) => r.id).sort((a, b) => a - b), [e1, e2]);
  assert.deepEqual(repo.listProjectElements("zn-a", { unassignedZone: true }).map((r) => r.id), [e3]);
  assert.equal(repo.getProjectElement(e1)!.installationZoneName, "Level 1 – West");
  assert.equal(repo.listInstallationZones("zn-a").find((z) => z.id === zoneId)!.elementCount, 2);
  // Status + history untouched by zone assignment.
  assert.equal(repo.getProjectElement(e1)!.status, "Planned");
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e1) as { c: number }).c), historyBefore);
  // Deleting the zone clears the link but keeps the elements.
  repo.deleteInstallationZone(zoneId, "zn-a");
  assert.equal(repo.getProjectElement(e1)!.installationZoneId, null);
  assert.equal(repo.listInstallationZones("zn-a").length, 0);
});

test("Zone: an installation-zone assignment survives an XLSX re-sync (only design fields change)", () => {
  newProject("zn-b", "Zone B");
  const e1 = newElement("zn-b", "DPP-1", { zone: "A", floor: "1" });
  const zoneId = repo.createInstallationZone("zn-b", "Erection block 1", "");
  repo.assignElementsToInstallationZone("zn-b", [e1], zoneId);
  // Re-import the same element with a NEW design zone/floor — operational zone must persist.
  const importId = repo.createElementImport({ projectId: "zn-b", originalFilename: "sync.xlsx", sourceRevision: "rev-2", sourceHash: "h", worksheetName: "S", mappingJson: "{}", payloadJson: "[]", summaryJson: "{}", status: "Preview", notes: "", importedById: 1, importedBy: "T" });
  repo.beginElementImportApply(importId, "zn-b");
  repo.applyElementImport(importId, "zn-b", "rev-2", [{ row: 1, matchedElementId: e1, code: "DPP-1", elementType: "Wall panel", floor: "2", zone: "B", drawingRef: "", description: "updated", weight: 11, length: 8200, width: 300, height: 3000, supplier: "" , plannedDeliveryDate: "" }], {}, actor);
  const after = repo.getProjectElement(e1)!;
  assert.equal(after.zone, "B", "design zone updated by the sync");
  assert.equal(after.floor, "2", "design floor updated by the sync");
  assert.equal(after.installationZoneId, zoneId, "operational installation zone preserved across re-sync");
  assert.equal(after.installationZoneName, "Erection block 1");
});

test("Zone: elements/zones from another project cannot be cross-assigned", () => {
  newProject("zn-c1", "C1"); newProject("zn-c2", "C2");
  const foreign = newElement("zn-c2", "F-1");
  const zoneC1 = repo.createInstallationZone("zn-c1", "Z", "");
  assert.throws(() => repo.assignElementsToInstallationZone("zn-c1", [foreign], zoneC1), /project scope/);
  const localEl = newElement("zn-c1", "L-1");
  const zoneC2 = repo.createInstallationZone("zn-c2", "Z2", "");
  assert.throws(() => repo.assignElementsToInstallationZone("zn-c1", [localEl], zoneC2), /project scope/);
});

test("Natural order: listProjectElements returns marks in natural (not lexicographic) order", () => {
  newProject("nat-1", "Nat");
  // Insert in a deliberately scrambled order; ids are assigned in insert order.
  const marks = ["TSP-110-10", "TSP-110-2", "TSP-110-1", "TSP-110-20", "TSP-110-3", "TSP-110-9"];
  for (const code of marks) newElement("nat-1", code);
  assert.deepEqual(repo.listProjectElements("nat-1").map((r) => r.code), ["TSP-110-1", "TSP-110-2", "TSP-110-3", "TSP-110-9", "TSP-110-10", "TSP-110-20"]);
  // Repeated marks are kept and ordered deterministically by immutable id.
  const a = newElement("nat-1", "DUP-5"), b = newElement("nat-1", "DUP-5");
  const dups = repo.listProjectElements("nat-1").filter((r) => r.code === "DUP-5").map((r) => r.id);
  assert.deepEqual(dups, [a, b].sort((x, y) => x - y), "both duplicate-mark elements returned in id order");
});

// ── Closure Pack: logistics domain separation ──────────────────────
test("A/C/D: element loads and material deliveries are separate domains that never leak", () => {
  newProject("log-1", "Logistics");
  const e = newElement("log-1", "PC-1");
  const loadId = planLoad("log-1", [e]); // Sprint 12 loads domain (Element deliveries)
  repo.saveDelivery({ projectId: "log-1", deliveryDate: "2026-09-01", deliveryTime: "08:00", supplier: "SteelCo", loadRef: "PO-42", description: "Reinforcement steel", status: "Planned", notes: "" }); // legacy Material deliveries
  // Element deliveries source = loads; it must not surface the material delivery.
  const loads = repo.listProjectLoadSummaries("log-1");
  assert.equal(loads.length, 1); assert.equal(loads[0].id, loadId);
  // Material deliveries source = legacy deliveries; it must not surface the load.
  const deliveries = repo.listDeliveries("log-1");
  assert.equal(deliveries.length, 1); assert.equal(deliveries[0].description, "Reinforcement steel");
  // Distinct storage — neither write touched the other table's row count.
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM loads WHERE project_id='log-1'").get() as { c: number }).c), 1);
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM deliveries WHERE project_id='log-1'").get() as { c: number }).c), 1);
  // The physical element is allocated to the load and unaffected by the material delivery.
  assert.deepEqual(repo.listActiveAllocatedElementIds("log-1"), [e]);
});

// ── Final Fix Pack: overview, zones, cancellation regression ────────
test("L/M: nextProjectDelivery returns the earliest upcoming Planned load; cancelled/past excluded", () => {
  newProject("nd-1", "ND");
  const mk = (num: number, date: string, time: string, cancel = false) => {
    const loadId = repo.createLoad({ projectId: "nd-1", loadNumber: num, status: "Draft", plannedDate: "", plannedTime: "", transportProfileId: null, recommendedProfileId: null, loadingDirection: "forward", orientationNote: "", note: "", createdById: 1, createdBy: "T" });
    repo.updateLoadDetails(loadId, "nd-1", { status: "Planned", plannedDate: date, plannedTime: time, transportProfileId: null, recommendedProfileId: null, loadingDirection: "forward", orientationNote: "", note: "" });
    if (cancel) repo.cancelLoad(loadId, "nd-1");
    return loadId;
  };
  mk(1, "2026-11-03", "14:50"); mk(2, "2026-10-01", "09:00"); mk(3, "2026-09-21", "08:30");
  mk(4, "2026-08-01", "07:00"); // in the past → excluded
  mk(5, "2026-09-10", "06:00", true); // cancelled → excluded
  const next = repo.nextProjectDelivery("nd-1", "2026-08-13");
  assert.ok(next); assert.equal(next.loadNumber, 3); assert.equal(next.plannedDate, "2026-09-21");
  // With no upcoming Planned load, returns null.
  assert.equal(repo.nextProjectDelivery("nd-1", "2027-01-01"), null);
});

test("N: project progress counts installed physical elements — not loads/reports", () => {
  newProject("pp-1", "PP");
  const els = Array.from({ length: 5 }, (_, i) => newElement("pp-1", `E-${i + 1}`));
  assert.deepEqual([repo.projectErectionProgress("pp-1").installed, repo.projectErectionProgress("pp-1").total], [0, 5]);
  installViaReport("pp-1", "PP", [els[0]]); // installation happens only via an approved Daily Report
  assert.deepEqual([repo.projectErectionProgress("pp-1").installed, repo.projectErectionProgress("pp-1").total], [1, 5]);
});

test("E: renaming an installation zone preserves the same element assignments and ids", () => {
  newProject("zr-1", "ZR");
  const zone = repo.createInstallationZone("zr-1", "1 Stavs", "");
  const els = [newElement("zr-1", "A-1"), newElement("zr-1", "A-2"), newElement("zr-1", "A-3")];
  repo.assignElementsToInstallationZone("zr-1", els, zone);
  repo.renameInstallationZone(zone, "zr-1", "1. stāvs — Section A", "Ground floor");
  const z = repo.listInstallationZones("zr-1").find((x) => x.id === zone)!;
  assert.equal(z.name, "1. stāvs — Section A"); assert.equal(z.description, "Ground floor"); assert.equal(z.elementCount, 3);
  assert.deepEqual(repo.listProjectElements("zr-1", { installationZoneId: zone }).map((r) => r.id).sort((a, b) => a - b), [...els].sort((a, b) => a - b));
});

test("F/G: deleting a zone clears only the assignment link — physical elements and history intact", () => {
  newProject("zd-1", "ZD");
  const zone = repo.createInstallationZone("zd-1", "Temp", "");
  const e = newElement("zd-1", "X-1");
  repo.assignElementsToInstallationZone("zd-1", [e], zone);
  const historyBefore = Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e) as { c: number }).c);
  repo.deleteInstallationZone(zone, "zd-1");
  const el = repo.getProjectElement(e)!;
  assert.ok(el, "physical element still exists"); assert.equal(el.installationZoneId, null); assert.equal(el.status, "Planned");
  assert.equal(repo.listInstallationZones("zd-1").length, 0);
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e) as { c: number }).c), historyBefore, "no history rows added/removed");
});

test("H/I: available elements filter by installation zone and combine with other filters", () => {
  newProject("dz-1", "DZ");
  const zone = repo.createInstallationZone("dz-1", "Z", "");
  const w1 = newElement("dz-1", "W-1", { elementType: "Wall panel" }), s1 = newElement("dz-1", "S-1", { elementType: "Beam" });
  newElement("dz-1", "O-1"); // outside the zone
  repo.assignElementsToInstallationZone("dz-1", [w1, s1], zone);
  assert.deepEqual(repo.listProjectElements("dz-1", { available: true, installationZoneId: zone }).map((r) => r.id).sort((a, b) => a - b), [w1, s1].sort((a, b) => a - b));
  assert.deepEqual(repo.listProjectElements("dz-1", { available: true, installationZoneId: zone, type: "Wall panel" }).map((r) => r.id), [w1]);
});

test("Q/R/S/T: cancelling a Planned load releases every reserved element exactly once, data intact", () => {
  newProject("cr-1", "CR");
  const zone = repo.createInstallationZone("cr-1", "Zone 1", "");
  const e1 = newElement("cr-1", "W-1", { floor: "2", zone: "A" }), e2 = newElement("cr-1", "W-2", { floor: "3", zone: "B" }), e3 = newElement("cr-1", "W-3");
  repo.assignElementsToInstallationZone("cr-1", [e1, e2, e3], zone);
  const before = repo.getProjectElement(e1)!;
  const historyBefore = Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e1) as { c: number }).c);
  const loadId = planLoad("cr-1", [e1, e2, e3]);
  // Reserved: cannot be allocated to another active load.
  const other = draftLoad("cr-1");
  assert.throws(() => repo.replaceLoadElements(other, "cr-1", 1, [alloc(e1, 0)]), /already allocated/);
  repo.cancelLoad(loadId, "cr-1");
  assert.deepEqual(repo.listActiveAllocatedElementIds("cr-1"), [], "no element remains reserved");
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM load_elements WHERE load_id=? AND active_alloc=1").get(loadId) as { c: number }).c), 0, "no orphan active allocation");
  // Each element re-plannable exactly once into a fresh load.
  const l2 = draftLoad("cr-1");
  repo.replaceLoadElements(l2, "cr-1", 1, [alloc(e1, 0), alloc(e2, 1), alloc(e3, 2)]);
  assert.deepEqual(repo.listLoadElements(l2).map((r) => r.elementId).sort((a, b) => a - b), [e1, e2, e3].sort((a, b) => a - b));
  // Immutable identity + mark/type/floor/zone/Installation Zone/status/history all intact.
  const after = repo.getProjectElement(e1)!;
  assert.equal(after.id, before.id); assert.equal(after.code, before.code); assert.equal(after.elementType, before.elementType);
  assert.equal(after.floor, "2"); assert.equal(after.zone, "A"); assert.equal(after.installationZoneId, zone); assert.equal(after.status, "Planned");
  assert.equal(Number((db.prepare("SELECT COUNT(*) c FROM element_status_history WHERE element_id=?").get(e1) as { c: number }).c), historyBefore, "cancellation adds no element history");
});

// ── Sprint 12 Improvement Pack: Load → Delivery → Installation ──────
function planLoad(projectId: string, elementIds: number[]): number {
  const id = draftLoad(projectId);
  repo.replaceLoadElements(id, projectId, 1, elementIds.map((eid, index) => alloc(eid, index)));
  repo.updateLoadDetails(id, projectId, { status: "Planned", plannedDate: "2026-09-21", plannedTime: "08:00", transportProfileId: null, recommendedProfileId: null, loadingDirection: "forward", orientationNote: "", note: "" });
  return id;
}
function installViaReport(projectId: string, projectName: string, elementIds: number[]) {
  const reportId = repo.saveDailyReport({ projectId, project: projectName, date: "2026-09-22", work: "Install", weather: "", materials: "", equipment: "", problems: "", safety: "", additionalNotes: "", author: "T", reporterUserId: 1, reporterEmployeeId: null, status: "Submitted", attendance: [] });
  repo.syncReportElements(reportId, projectId, elementIds);
  repo.approveDailyReport(reportId, actor.id);
  repo.finalizeReportElements(reportId, "2026-09-22", actor);
}

test("Accept: a load received as planned sets every element On site and derives progress from Daily Reports", () => {
  newProject("ld-acc", "Acc");
  const e1 = newElement("ld-acc", "A-1"), e2 = newElement("ld-acc", "A-2");
  const loadId = planLoad("ld-acc", [e1, e2]);
  repo.runTransaction(() => repo.acceptLoad(loadId, "ld-acc", actor, { acceptanceType: "as_planned", comment: "", operationDate: "2026-09-21", received: [], missing: [], added: [] }));
  assert.equal(repo.getLoad(loadId)!.status, "Accepted");
  assert.equal(repo.getProjectElement(e1)!.status, "On site");
  assert.equal(repo.getProjectElement(e2)!.actualDeliveryDate, "2026-09-21");
  let progress = repo.loadInstallationProgress(loadId);
  assert.deepEqual([progress.received, progress.installed, progress.onSite, progress.fullyInstalled], [2, 0, 2, false]);
  // Installing through an approved Daily Report drives derived progress — no load write.
  installViaReport("ld-acc", "Acc", [e1]);
  progress = repo.loadInstallationProgress(loadId);
  assert.deepEqual([progress.received, progress.installed, progress.onSite, progress.fullyInstalled], [2, 1, 1, false]);
  installViaReport("ld-acc", "Acc", [e2]);
  progress = repo.loadInstallationProgress(loadId);
  assert.deepEqual([progress.received, progress.installed, progress.onSite, progress.fullyInstalled], [2, 2, 0, true]);
});

test("Accept with discrepancies: missing released for re-planning, added referenced and On site", () => {
  newProject("ld-disc", "Disc");
  const e1 = newElement("ld-disc", "D-1"), e2 = newElement("ld-disc", "D-2"), e3 = newElement("ld-disc", "D-3"), extra = newElement("ld-disc", "D-X");
  const loadId = planLoad("ld-disc", [e1, e2, e3]);
  repo.runTransaction(() => repo.acceptLoad(loadId, "ld-disc", actor, { acceptanceType: "with_discrepancies", comment: "one short, one extra", operationDate: "2026-09-21", received: [e1, e2], missing: [e3], added: [{ elementId: extra, category: "extra", note: "arrived unplanned" }] }));
  assert.equal(repo.getLoad(loadId)!.status, "Accepted");
  assert.equal(repo.getProjectElement(e1)!.status, "On site");
  assert.equal(repo.getProjectElement(extra)!.status, "On site");
  assert.equal(repo.getProjectElement(e3)!.status, "Planned", "a missing element is not marked delivered");
  // e3 released → available for another active load; extra now reserved by this load.
  const allocated = repo.listActiveAllocatedElementIds("ld-disc");
  assert.equal(allocated.includes(e3), false, "missing element released");
  assert.equal(allocated.includes(extra), true, "added element reserved");
  const receipt = repo.getLoadReceipt(loadId)!;
  assert.deepEqual([receipt.receivedCount, receipt.missingCount, receipt.addedCount], [3, 1, 0 + 1]);
  const progress = repo.loadInstallationProgress(loadId);
  assert.deepEqual([progress.received, progress.missing, progress.added, progress.onSite], [3, 1, 1, 3]);
  // e3 can be planned into a fresh load now that it is released.
  const l2 = draftLoad("ld-disc");
  assert.doesNotThrow(() => repo.replaceLoadElements(l2, "ld-disc", 1, [alloc(e3, 0)]));
});

test("Accept guards: only Planned loads, full classification, no cross-load added element, receipts freeze the load", () => {
  newProject("ld-g", "G");
  const e1 = newElement("ld-g", "G-1"), e2 = newElement("ld-g", "G-2");
  const loadId = draftLoad("ld-g");
  repo.replaceLoadElements(loadId, "ld-g", 1, [alloc(e1, 0), alloc(e2, 1)]);
  // A Draft (not yet Planned) load cannot be received.
  assert.throws(() => repo.runTransaction(() => repo.acceptLoad(loadId, "ld-g", actor, { acceptanceType: "as_planned", comment: "", operationDate: "2026-09-21", received: [], missing: [], added: [] })), /planned load/i);
  repo.updateLoadDetails(loadId, "ld-g", { status: "Planned", plannedDate: "2026-09-21", plannedTime: "08:00", transportProfileId: null, recommendedProfileId: null, loadingDirection: "forward", orientationNote: "", note: "" });
  // Incomplete classification (e2 neither received nor missing) is rejected.
  assert.throws(() => repo.runTransaction(() => repo.acceptLoad(loadId, "ld-g", actor, { acceptanceType: "with_discrepancies", comment: "", operationDate: "2026-09-21", received: [e1], missing: [], added: [] })), /must be marked received or missing/);
  // An added element already reserved by another active load is rejected.
  const other = newElement("ld-g", "G-3"); const otherLoad = draftLoad("ld-g"); repo.replaceLoadElements(otherLoad, "ld-g", 1, [alloc(other, 0)]);
  assert.throws(() => repo.runTransaction(() => repo.acceptLoad(loadId, "ld-g", actor, { acceptanceType: "with_discrepancies", comment: "", operationDate: "2026-09-21", received: [e1, e2], missing: [], added: [{ elementId: other, category: "", note: "" }] })), /another active load/);
  // A clean acceptance freezes the load: no re-planning, no cancellation.
  repo.runTransaction(() => repo.acceptLoad(loadId, "ld-g", actor, { acceptanceType: "as_planned", comment: "", operationDate: "2026-09-21", received: [], missing: [], added: [] }));
  assert.throws(() => repo.replaceLoadElements(loadId, "ld-g", 1, [alloc(e1, 0)]), /received or cancelled/);
  assert.throws(() => repo.cancelLoad(loadId, "ld-g"), /physical delivery/);
});

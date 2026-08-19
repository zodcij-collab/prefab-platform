// Sprint 15 Consolidated Acceptance Fix Pack — regression coverage.
// Verifies the changed behaviour for each finding without disturbing the accepted flows:
//   P1 Daily Log discoverability · Site-photo Zone/Floor from canonical zones · Include-in-report
//   UX · Daily Log photo preview + snapshot immutability · Reopen UX/audit · Material delivery
//   line items · legacy delivery safety · P2 employee-profile i18n.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";
import { portalText } from "../data/portal-i18n.ts";
import { MATERIAL_UNITS, isMaterialUnit, normalizeDeliveryItems, formatQuantity } from "../lib/deliveries.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// ── Pure domain: material line items ─────────────────────────────────────────
test("§FP-items: normalizeDeliveryItems drops blank rows, coerces quantity, validates unit", () => {
  const rows = [
    { name: " Dry mortar ", quantity: "12", unit: "bag", note: " palletised " },
    { name: "", quantity: "5", unit: "kg", note: "blank name → dropped" },
    { name: "Mineral wool", quantity: "abc", unit: "roll", note: "" },   // bad qty → 0
    { name: "Anchors", quantity: "-3", unit: "pcs", note: "" },          // negative → 0
    { name: "Rebar", quantity: "2.5", unit: "tonnes", note: "" },        // unknown unit → ""
  ];
  const items = normalizeDeliveryItems(rows);
  assert.equal(items.length, 4, "the blank-name row is dropped");
  assert.deepEqual(items[0], { name: "Dry mortar", quantity: 12, unit: "bag", note: "palletised" });
  assert.equal(items[1].quantity, 0, "non-numeric quantity becomes 0, not a failure");
  assert.equal(items[2].quantity, 0, "negative quantity becomes 0");
  assert.equal(items[3].unit, "", "an unknown unit is blanked");
});
test("§FP-units: the unit set is the agreed construction units", () => {
  for (const u of ["pcs", "kg", "t", "m", "m²", "m³", "bag", "pallet", "roll", "pack"]) assert.ok(isMaterialUnit(u), `${u} is valid`);
  assert.equal(isMaterialUnit("furlong"), false);
  assert.equal(MATERIAL_UNITS.length, 10);
  assert.equal(formatQuantity(12, "bag"), "12 bag");
  assert.equal(formatQuantity(1.5, "t"), "1.5 t");
  assert.equal(formatQuantity(0, "pcs"), "pcs", "no quantity → just the unit");
});

// ── P2 i18n: "Project assignments" is localised in LV and RU ─────────────────
test("§FP-i18n: employee-profile 'Project assignments' is translated in LV and RU (and the label is wired through t())", () => {
  assert.equal(portalText("lv", "Project assignments"), "Norīkojumi projektos");
  assert.equal(portalText("ru", "Project assignments"), "Назначения на проекты");
  assert.notEqual(portalText("lv", "Project assignments"), "Project assignments", "LV no longer falls through to English");
  assert.notEqual(portalText("ru", "Project assignments"), "Project assignments", "RU no longer falls through to English");
  // the call site already uses t(); guard it stays that way.
  assert.match(read("app/portal/employees/[id]/page.tsx"), /t\("Project assignments"\)/);
  // Daily Log & Site Photos LV/RU (accepted) untouched — spot check they still resolve.
  assert.equal(portalText("lv", "Daily log"), "Dienas žurnāls");
  assert.equal(portalText("ru", "Site photos"), "Фото объекта");
});

// ── UI presence (source-level) for the P1 surface changes ────────────────────
test("§FP-ui: the P1 UI surfaces are wired as specified", () => {
  const overview = read("app/portal/projects/[id]/page.tsx");
  assert.match(overview, /os-dailylog-cta/, "Daily Log entry-point CTA exists on the project overview");
  assert.match(overview, /Open today's daily log/, "CTA links to today's daily log");
  assert.match(overview, /<DeliveryItemsEditor/, "delivery form renders the line-item editor");
  assert.match(overview, /os-delivery-item-list/, "saved deliveries render their line items");

  const sitePhotos = read("app/portal/projects/[id]/site-photos/page.tsx");
  assert.match(sitePhotos, /name="installationZoneId"/, "Zone/floor offers the saved installation zones");
  assert.match(sitePhotos, /listInstallationZones/, "it reuses the canonical zone source, not a new registry");
  assert.match(sitePhotos, /os-report-include/, "the capture 'include in daily report' control is the clearer styled toggle");
  assert.match(sitePhotos, /os-report-toggle/, "the per-photo inclusion toggle is a clear on/off pill");

  const dailyLog = read("app/portal/projects/[id]/daily-log/page.tsx");
  assert.match(dailyLog, /id="daily-photos"/, "Daily Log has a site-photo preview section");
  assert.match(dailyLog, /\/portal\/files\/photos\/\$\{p\.id\}/, "thumbnails use the authenticated photo route");
  assert.match(dailyLog, /snap\.photos/, "the preview is driven by the snapshot (frozen when confirmed)");
  assert.match(dailyLog, /os-reopen-control/, "Reopen is a deliberate disclosure control");
});

// ── Integration: zones, photos, snapshot immutability, deliveries ────────────
let ctx: TestDb; let repo: TestDb["repo"];
let dops: typeof import("../lib/daily-ops-repo.ts");
const actor = { id: 0, name: "Tester" };
function project(id: string) {
  repo.createProject({ id, name: id, location: "Rīga", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}
before(async () => {
  ctx = await setupTestDb(); repo = ctx.repo; dops = await import("../lib/daily-ops-repo.ts");
  actor.id = Number(repo.createUserAccess({ name: "Tester", email: "fp@test", role: "Director", active: 1, passwordHash: "s:h" }).lastInsertRowid);
});
after(() => ctx.cleanup());

test("§FP-zone: a site photo's Zone/Floor resolves against the correct project's saved zone", () => {
  project("fp-z1"); project("fp-z2");
  const zoneA = repo.createInstallationZone("fp-z1", "Level 2 · Grid C", "");
  // getInstallationZone is project-scoped so the action can reject a foreign/inactive zone.
  const z = repo.getInstallationZone(zoneA)!;
  assert.equal(z.projectId, "fp-z1"); assert.equal(z.active, 1);
  assert.notEqual(z.projectId, "fp-z2", "a fp-z2 photo must never bind a fp-z1 zone");
  // A photo stored with the zone's canonical name (as the action mirrors it into `area`).
  dops.addSitePhoto({ projectId: "fp-z1", photoDate: "2026-08-18", area: z.name, caption: "beam", author: "T", originalFilename: "a.jpg", storedPath: "photos/a.jpg", fileSize: 10, mimeType: "image/jpeg", includeInDaily: true, issueId: null, installationZoneId: z.id, uploadedById: actor.id }, actor);
  const photos = dops.listSitePhotos("fp-z1");
  assert.equal(photos.length, 1);
  assert.equal(photos[0].area, "Level 2 · Grid C", "the photo carries the canonical zone name, not free-typed text");
});

test("§FP-include: report inclusion toggles and persists; the Daily Log shows the right photos for the date", () => {
  project("fp-inc");
  const day = "2026-08-18";
  const keep = dops.addSitePhoto({ projectId: "fp-inc", photoDate: day, area: "A", caption: "in", author: "T", originalFilename: "1.jpg", storedPath: "photos/1.jpg", fileSize: 1, mimeType: "image/jpeg", includeInDaily: true, issueId: null, installationZoneId: null, uploadedById: actor.id }, actor);
  const drop = dops.addSitePhoto({ projectId: "fp-inc", photoDate: day, area: "B", caption: "out", author: "T", originalFilename: "2.jpg", storedPath: "photos/2.jpg", fileSize: 1, mimeType: "image/jpeg", includeInDaily: false, issueId: null, installationZoneId: null, uploadedById: actor.id }, actor);
  dops.addSitePhoto({ projectId: "fp-inc", photoDate: "2026-08-17", area: "C", caption: "other day", author: "T", originalFilename: "3.jpg", storedPath: "photos/3.jpg", fileSize: 1, mimeType: "image/jpeg", includeInDaily: true, issueId: null, installationZoneId: null, uploadedById: actor.id }, actor);
  const log = dops.getOrCreateDailyLog("fp-inc", day, actor);
  let snap = dops.dailyLogSnapshot(log);
  assert.deepEqual(snap.photos.map((p) => p.id), [keep], "only included photos for THIS date appear in the Daily Log");
  // Toggle the excluded one on — it must now appear (draft is live).
  dops.setPhotoIncludeInDaily(drop, true, actor);
  snap = dops.dailyLogSnapshot(dops.getDailyLog("fp-inc", day)!);
  assert.deepEqual(snap.photos.map((p) => p.id).sort((a, b) => a - b), [keep, drop].sort((a, b) => a - b), "toggling inclusion persists and is reflected live");
});

test("§FP-snapshot: a CONFIRMED daily log's photo set is frozen — later photo changes do not mutate it", () => {
  project("fp-snap");
  const day = "2026-08-18";
  const p1 = dops.addSitePhoto({ projectId: "fp-snap", photoDate: day, area: "A", caption: "one", author: "T", originalFilename: "1.jpg", storedPath: "photos/s1.jpg", fileSize: 1, mimeType: "image/jpeg", includeInDaily: true, issueId: null, installationZoneId: null, uploadedById: actor.id }, actor);
  const log = dops.getOrCreateDailyLog("fp-snap", day, actor);
  dops.confirmDailyLog(log.id, actor);
  // After confirm, add + include another photo and toggle nothing off.
  dops.addSitePhoto({ projectId: "fp-snap", photoDate: day, area: "B", caption: "two", author: "T", originalFilename: "2.jpg", storedPath: "photos/s2.jpg", fileSize: 1, mimeType: "image/jpeg", includeInDaily: true, issueId: null, installationZoneId: null, uploadedById: actor.id }, actor);
  const confirmed = dops.getDailyLog("fp-snap", day)!;
  assert.equal(confirmed.status, "Confirmed");
  const snap = dops.dailyLogSnapshot(confirmed);
  assert.deepEqual(snap.photos.map((p) => p.id), [p1], "the confirmed report still shows only the frozen photo set");
});

test("§FP-reopen: reopen returns to Draft, is audited, and restores live aggregation", () => {
  project("fp-reopen");
  const day = "2026-08-18";
  const log = dops.getOrCreateDailyLog("fp-reopen", day, actor);
  dops.confirmDailyLog(log.id, actor);
  dops.reopenDailyLog(log.id, actor);
  const after = dops.getDailyLog("fp-reopen", day)!;
  assert.equal(after.status, "Draft", "reopen returns the log to Draft");
  const activity = repo.listProjectActivity("fp-reopen");
  assert.ok(activity.some((a) => /reopened/i.test(a.action)), "the reopen is recorded in the audit history");
  // A photo added after reopening now shows (live aggregation restored).
  const p = dops.addSitePhoto({ projectId: "fp-reopen", photoDate: day, area: "A", caption: "live", author: "T", originalFilename: "r.jpg", storedPath: "photos/r.jpg", fileSize: 1, mimeType: "image/jpeg", includeInDaily: true, issueId: null, installationZoneId: null, uploadedById: actor.id }, actor);
  assert.deepEqual(dops.dailyLogSnapshot(dops.getDailyLog("fp-reopen", day)!).photos.map((x) => x.id), [p]);
});

test("§FP-delivery: a Material Delivery can hold multiple line items with quantities and units", () => {
  project("fp-del");
  const res = repo.saveDelivery({ projectId: "fp-del", deliveryDate: "2026-08-18", deliveryTime: "08:00", supplier: "Knauf", loadRef: "PO-42", description: "Client-supplied mixes", status: "Planned", notes: "" });
  const deliveryId = Number(res.lastInsertRowid);
  const items = normalizeDeliveryItems([
    { name: "Dry mortar", quantity: "40", unit: "bag", note: "M10" },
    { name: "Seam mineral wool", quantity: "12", unit: "roll", note: "" },
  ]);
  repo.setDeliveryItems(deliveryId, items);
  const saved = repo.listDeliveryItems(deliveryId);
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map((i) => [i.name, i.quantity, i.unit]), [["Dry mortar", 40, "bag"], ["Seam mineral wool", 12, "roll"]]);
  // grouped-by-project loader used by the overview
  const byProject = repo.listDeliveryItemsByProject("fp-del");
  assert.equal(byProject.get(deliveryId)!.length, 2);
  // Editing replaces the full set (the form submits the whole list).
  repo.setDeliveryItems(deliveryId, normalizeDeliveryItems([{ name: "Dry mortar", quantity: "50", unit: "bag", note: "" }]));
  assert.equal(repo.listDeliveryItems(deliveryId).length, 1);
  assert.equal(repo.listDeliveryItems(deliveryId)[0].quantity, 50);
});

test("§FP-render: saved line items are plain, client-serialisable objects (the RSC → editor boundary)", () => {
  project("fp-ser");
  const id = Number(repo.saveDelivery({ projectId: "fp-ser", deliveryDate: "2026-08-18", deliveryTime: "", supplier: "Bonava", loadRef: "", description: "multi", status: "Planned", notes: "" }).lastInsertRowid);
  repo.setDeliveryItems(id, normalizeDeliveryItems([
    { name: "Weber ESL", quantity: "12", unit: "t", note: "" },
    { name: "Isover SK-C 170mm", quantity: "1900", unit: "m", note: "" },
  ]));
  const items = repo.listDeliveryItems(id);
  assert.equal(items.length, 2, "header + every line item persist and read back");
  // The client line-item editor receives these as a prop. node:sqlite returns NULL-prototype rows,
  // which crash React with "Only plain objects ... can be passed to Client Components". Guard it:
  for (const it of items) assert.equal(Object.getPrototypeOf(it), Object.prototype, "each item is a plain object");
  for (const it of repo.listDeliveryItemsByProject("fp-ser").get(id)!) assert.equal(Object.getPrototypeOf(it), Object.prototype, "grouped items are plain objects too");
  assert.doesNotThrow(() => structuredClone(items), "items survive serialisation to the client");
});

test("§FP-legacy: a delivery with no line items stays valid and renders safely (no items)", () => {
  project("fp-legacy");
  const res = repo.saveDelivery({ projectId: "fp-legacy", deliveryDate: "2026-08-18", deliveryTime: "", supplier: "Old", loadRef: "", description: "Legacy record", status: "Received", notes: "" });
  const deliveryId = Number(res.lastInsertRowid);
  assert.deepEqual(repo.listDeliveryItems(deliveryId), [], "a pre-existing delivery simply has zero items");
  assert.equal(repo.listDeliveryItemsByProject("fp-legacy").has(deliveryId), false, "no items group is created for it");
  // Deleting the delivery cascades (no orphan items) — and works with zero items present.
  repo.setDeliveryItems(deliveryId, normalizeDeliveryItems([{ name: "Sand", quantity: "1", unit: "t", note: "" }]));
  repo.deleteDelivery(deliveryId, "fp-legacy");
  assert.deepEqual(repo.listDeliveryItems(deliveryId), [], "items cascade-delete with their parent delivery");
});

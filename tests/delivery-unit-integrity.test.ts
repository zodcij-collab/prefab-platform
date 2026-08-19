// P0 regression — a Material Delivery header-only edit must preserve every line item's unit.
// Root cause of the pcs/pcs/pcs/pcs corruption: line items were submitted as four parallel
// FormData arrays (itemName/itemQty/itemUnit/itemNote) zipped by index; if a unit <select> failed
// to submit (e.g. a stale/partly-hydrated client bundle), the arrays misaligned and units were
// lost → later shown as the "pcs" fallback. Fix: submit the items as one atomic itemsJson payload.
import test from "node:test";
import assert from "node:assert/strict";
import { setupTestDb } from "./helpers/test-db.ts";
import { parseDeliveryItemsForm, normalizeDeliveryItems, deliveryKnownWeight } from "../lib/deliveries.ts";

const ITEMS = [
  { name: "Weber ESL", quantity: 12, unit: "t", note: "" },
  { name: "Weber ESL LUJA", quantity: 9, unit: "t", note: "" },
  { name: "Weber 600/3", quantity: 2.4, unit: "t", note: "" },
  { name: "Isover SK-C 170mm", quantity: 1900, unit: "m", note: "" },
];
const triples = (items: { name: string; quantity: number; unit: string }[]) => items.map((i) => [i.name, i.quantity, i.unit]);
const EXPECT = [["Weber ESL", 12, "t"], ["Weber ESL LUJA", 9, "t"], ["Weber 600/3", 2.4, "t"], ["Isover SK-C 170mm", 1900, "m"]];

test("§UNIT-json: itemsJson is parsed atomically and preserves every unit exactly", () => {
  const fd = new FormData(); fd.set("itemsJson", JSON.stringify(ITEMS));
  const items = normalizeDeliveryItems(parseDeliveryItemsForm(fd));
  assert.deepEqual(triples(items), EXPECT);
  const w = deliveryKnownWeight(items);
  assert.equal(w.tonnes, 23.4, "known total weight = 23.4 t");
  assert.equal(w.unknownCount, 1, "one item (m) without direct weight data");
});

test("§UNIT-misalign: a missing unit corrupts the legacy parallel-array path, but itemsJson is immune", () => {
  // Simulate the browser failure mode: 4 names/quantities but only 3 units actually submit.
  const brokenArrays = {
    get: () => null, // no itemsJson → fall back to parallel arrays
    getAll: (k: string) => k === "itemName" ? ITEMS.map((i) => i.name)
      : k === "itemQty" ? ITEMS.map((i) => String(i.quantity))
      : k === "itemUnit" ? ["t", "t", "t"] // ← one <select> did not submit
      : ITEMS.map(() => ""),
  };
  const legacy = normalizeDeliveryItems(parseDeliveryItemsForm(brokenArrays));
  assert.notEqual(legacy[3]?.unit, "m", "parallel-array zip loses the last unit when a select is missing (the corruption)");
  // The atomic itemsJson payload carries the full, correctly-aligned editor state regardless.
  const robust = { get: (k: string) => (k === "itemsJson" ? JSON.stringify(ITEMS) : null), getAll: () => [] as unknown[] };
  const fixed = normalizeDeliveryItems(parseDeliveryItemsForm(robust));
  assert.deepEqual(triples(fixed), EXPECT, "itemsJson preserves every unit even if selects would misalign");
  assert.equal(deliveryKnownWeight(fixed).tonnes, 23.4);
});

test("§UNIT-headeredit: editing ONLY the time re-saves the delivery and preserves all units (23.4 t, 1 unknown)", async () => {
  const ctx = await setupTestDb();
  const repo = ctx.repo;
  try {
    repo.createProject({ id: "up", name: "up", location: "R", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
    const del = Number(repo.saveDelivery({ projectId: "up", deliveryDate: "2026-09-14", deliveryTime: "12:45", supplier: "Bonava Latvija SIA", loadRef: "", description: "Dry mortars", status: "Planned", notes: "" }).lastInsertRowid);
    repo.setDeliveryItems(del, ITEMS);
    // Header-only edit: change ONLY the time; the editor re-submits the SAME items via itemsJson.
    const fd = new FormData(); fd.set("itemsJson", JSON.stringify(ITEMS));
    const items = normalizeDeliveryItems(parseDeliveryItemsForm(fd));
    repo.saveDelivery({ id: del, projectId: "up", deliveryDate: "2026-09-14", deliveryTime: "07:00", supplier: "Bonava Latvija SIA", loadRef: "", description: "Dry mortars", status: "Planned", notes: "" });
    repo.setDeliveryItems(del, items);
    const after = repo.listDeliveryItems(del);
    assert.deepEqual(triples(after), EXPECT, "every line-item unit is preserved after a time-only edit");
    const w = deliveryKnownWeight(after);
    assert.equal(w.tonnes, 23.4);
    assert.equal(w.unknownCount, 1);
    // No-op save (nothing changed) is also a perfect round-trip.
    repo.setDeliveryItems(del, normalizeDeliveryItems(parseDeliveryItemsForm((() => { const f = new FormData(); f.set("itemsJson", JSON.stringify(ITEMS)); return f; })())));
    assert.deepEqual(triples(repo.listDeliveryItems(del)), EXPECT, "a no-op save preserves units too");
  } finally { ctx.cleanup(); }
});

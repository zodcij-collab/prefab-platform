import test from "node:test";
import assert from "node:assert/strict";
import { compareMarks, compareElementsByMark, formatProgressLabel } from "../lib/elements.ts";
import { SCHEDULE_COLUMNS, scheduleGeneratedLine, scheduleRowValue, generateDeliverySchedulePdf, type SchedulePdfElement, type SchedulePdfLoad } from "../lib/load-schedule-pdf.ts";

const id = (s: string) => s; // identity translator for tests

test("A: marks sort naturally — MARK-2 before MARK-10", () => {
  assert.ok(compareMarks("TSP-110-2", "TSP-110-10") < 0);
  assert.ok(compareMarks("DPP-110-2", "DPP-110-10") < 0);
  assert.ok(compareMarks("TSP-110-9", "TSP-110-20") < 0);
  assert.ok(compareMarks("TSP-120-1", "TSP-120-10") < 0);
  assert.ok(compareMarks("TSP-110-10", "TSP-110-2") > 0);
});

test("A2: a lexicographic list is reordered into natural order", () => {
  const lex = ["TSP-110-1", "TSP-110-10", "TSP-110-11", "TSP-110-12", "TSP-110-2", "TSP-110-20", "TSP-110-3"];
  assert.deepEqual([...lex].sort(compareMarks), ["TSP-110-1", "TSP-110-2", "TSP-110-3", "TSP-110-10", "TSP-110-11", "TSP-110-12", "TSP-110-20"]);
});

test("B: natural sort is deterministic for repeated/similar marks (id tiebreak)", () => {
  const rows = [
    { id: 5, floor: "1", zone: "A", elementType: "Wall panel", code: "VS-101" },
    { id: 2, floor: "1", zone: "A", elementType: "Wall panel", code: "VS-101" },
    { id: 9, floor: "1", zone: "A", elementType: "Wall panel", code: "VS-2" },
    { id: 1, floor: "10", zone: "A", elementType: "Wall panel", code: "VS-1" },
  ];
  // floor natural (1 before 10), then natural mark, then id for the duplicate VS-101.
  assert.deepEqual([...rows].sort(compareElementsByMark).map((r) => r.id), [9, 2, 5, 1]);
  // Case-insensitive and stable across re-sorts.
  assert.deepEqual([...rows].sort(compareElementsByMark).map((r) => r.id), [9, 2, 5, 1]);
  assert.equal(compareMarks("abc-1", "ABC-1"), 0, "case-insensitive equality");
});

const el = (over: Partial<SchedulePdfElement> = {}): SchedulePdfElement => ({ code: "TSP-110-2", elementType: "Wall panel", floor: "", installationZoneName: "", weight: 8.2, length: 8000, width: 300, height: 3000, orientation: "Vertical", intent: "Direct erection", note: "", ...over });

test("C: the schedule PDF has a Floor column between Type and Weight, and rows resolve floor there", () => {
  const keys = SCHEDULE_COLUMNS.map((c) => c.key);
  assert.deepEqual(keys, ["pos", "mark", "type", "floor", "weight", "dims", "orientation", "intent"]);
  const total = SCHEDULE_COLUMNS.reduce((sum, c) => sum + c.w, 0);
  assert.equal(38 + total, 804, "columns fill the landscape content width without overflow");
});

test("§2A: an explicit design floor is used for the STĀVS column", () => {
  assert.equal(scheduleRowValue(el({ floor: "3", installationZoneName: "1 Stāvs" }), "floor", 0, id), "3", "explicit floor wins over installation zone");
});
test("§2B: with no explicit floor, the assigned Installation Zone name is the STĀVS fallback", () => {
  assert.equal(scheduleRowValue(el({ floor: "", installationZoneName: "1 Stāvs" }), "floor", 0, id), "1 Stāvs");
});
test("§2C: with neither floor nor zone, STĀVS shows the placeholder and never breaks", () => {
  const bare = el({ floor: "", installationZoneName: "", weight: null, length: null, width: null, height: null });
  assert.equal(scheduleRowValue(bare, "floor", 0, id), "—");
  assert.equal(scheduleRowValue(bare, "weight", 0, id), "—");
});
test("§2D: elements in one load can resolve to different Installation Zones", () => {
  assert.equal(scheduleRowValue(el({ installationZoneName: "1 Stāvs" }), "floor", 0, id), "1 Stāvs");
  assert.equal(scheduleRowValue(el({ installationZoneName: "2 stāvs" }), "floor", 1, id), "2 stāvs");
});

test("§7B-P: exactly zero installed elements shows 0%", () => {
  assert.equal(formatProgressLabel(0, 671), "0%");
  assert.equal(formatProgressLabel(0, 0), "0%");
});
test("§7B-O: 1 of 671 installed shows a meaningful non-zero indication (0.1%), not 0%", () => {
  assert.equal(formatProgressLabel(1, 671), "0.1%");
  assert.notEqual(formatProgressLabel(1, 671), "0%");
});
test("§7B: progress label rounding — sub-0.1% shows <0.1%, ≥1% shows whole percent, full shows 100%", () => {
  assert.equal(formatProgressLabel(1, 100000), "<0.1%");
  assert.equal(formatProgressLabel(149, 671), "22%");
  assert.equal(formatProgressLabel(671, 671), "100%");
  assert.equal(formatProgressLabel(5, 671), "0.7%");
});

test("E: the PDF author line is composed from the passed (server-resolved) identity", () => {
  assert.equal(scheduleGeneratedLine(id, "13 Aug 2026, 10:09", "Edvards Kvasura"), "Generated: 13 Aug 2026, 10:09 · Author: Edvards Kvasura");
  assert.equal(scheduleGeneratedLine(id, "13 Aug 2026, 10:09", ""), "Generated: 13 Aug 2026, 10:09 · Author: —");
});

test("D2: the PDF generates end-to-end even with a missing floor (returns a non-empty document)", async () => {
  const element: SchedulePdfElement = { code: "TSP-110-10", elementType: "Wall panel", floor: "", installationZoneName: "1 Stāvs", weight: 8, length: 8000, width: 300, height: 3000, orientation: "Vertical", intent: "Direct erection", note: "" };
  const load: SchedulePdfLoad = { loadNumber: 1, status: "Planned", plannedDate: "2026-09-21", plannedTime: "08:00", loadingDirection: "forward", note: "", orientationNote: "", exceptionAck: false, exceptionReason: "", recommendedName: "Standard", selectedName: "Standard", totalWeightT: 8, elements: [element] };
  const pdf = await generateDeliverySchedulePdf({ projectName: "Test", loads: [load], language: "en", includedDrafts: false, generatedBy: "Test User" });
  assert.ok(pdf.length > 800, "a real PDF document was produced");
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", "output is a PDF");
});

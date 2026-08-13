import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLoadTotals,
  evaluateLoad,
  nextLoadNumber,
  profileExceedances,
  profileSatisfies,
  recommendTransport,
  type TransportProfileCalc,
} from "../lib/loads.ts";
import { BASE_ROLE_CAPABILITIES } from "../lib/project-access.ts";

const profiles: TransportProfileCalc[] = [
  { id: 1, name: "Standard", active: true, placeholder: true, rank: 1, maxPayloadT: 24, maxLengthMm: 13600, maxWidthMm: 2550, maxHeightMm: 3100 },
  { id: 2, name: "Jumbo", active: true, placeholder: true, rank: 2, maxPayloadT: 24, maxLengthMm: 16000, maxWidthMm: 2550, maxHeightMm: 3300 },
  { id: 3, name: "Titanic", active: true, placeholder: true, rank: 3, maxPayloadT: 24, maxLengthMm: 21000, maxWidthMm: 3000, maxHeightMm: 4000 },
];

test("E: computeLoadTotals sums weight and takes the maximum of each dimension", () => {
  const totals = computeLoadTotals([
    { weight: 12.903, length: 10487, width: 312, height: 3140 },
    { weight: 8.9, length: 7709, width: 390, height: 3360 },
    { weight: 0.5, length: 2000, width: 600, height: 500 },
  ]);
  assert.equal(totals.count, 3);
  assert.equal(totals.totalWeightT, 22.303);
  assert.equal(totals.maxLengthMm, 10487);
  assert.equal(totals.maxWidthMm, 600);
  assert.equal(totals.maxHeightMm, 3360);
});

test("F: recommendTransport picks the least-demanding profile that fits", () => {
  // Fits Standard.
  assert.equal(recommendTransport(computeLoadTotals([{ weight: 10, length: 10000, width: 2000, height: 3000 }]), profiles)?.name, "Standard");
  // Too long for Standard, fits Jumbo.
  assert.equal(recommendTransport(computeLoadTotals([{ weight: 10, length: 15000, width: 2000, height: 3000 }]), profiles)?.name, "Jumbo");
  // Too long for everything → non-standard.
  assert.equal(recommendTransport(computeLoadTotals([{ weight: 10, length: 22000, width: 2000, height: 3000 }]), profiles), null);
  // Empty load → no recommendation.
  assert.equal(recommendTransport(computeLoadTotals([]), profiles), null);
});

test("profileSatisfies / profileExceedances flag the correct limits", () => {
  const totals = computeLoadTotals([{ weight: 26, length: 15000, width: 2000, height: 3000 }]);
  assert.equal(profileSatisfies(profiles[0], totals), false);
  assert.deepEqual(profileExceedances(profiles[0], totals).sort(), ["length", "payload"]);
  assert.equal(profileSatisfies({ ...profiles[0], maxPayloadT: null, maxLengthMm: null }, totals), true, "null limits mean no limit");
});

test("G: selecting a transport that the load exceeds warns (Draft) and blocks (Planned) until acknowledged", () => {
  const elements = [{ weight: 10, length: 15000, width: 2000, height: 3000 }]; // exceeds Standard length
  const base = { elements, profiles, selectedProfileId: 1, plannedDate: "2026-08-20", plannedTime: "08:00", exceptionAcknowledged: false } as const;
  const draft = evaluateLoad({ ...base, targetStatus: "Draft" });
  assert.ok(draft.messages.some((m) => m.code === "exceeds_selected" && m.level === "warning"));
  assert.equal(draft.blocking, false, "a draft can always be saved");
  const planned = evaluateLoad({ ...base, targetStatus: "Planned" });
  assert.ok(planned.messages.some((m) => m.code === "exceeds_selected" && m.level === "blocking"));
  assert.equal(planned.blocking, true);
  const acknowledged = evaluateLoad({ ...base, targetStatus: "Planned", exceptionAcknowledged: true });
  assert.ok(acknowledged.messages.some((m) => m.code === "exceeds_acknowledged" && m.level === "warning"));
  assert.equal(acknowledged.blocking, false, "acknowledged exception unblocks Planned");
});

test("H: a non-standard load requires acknowledgement before it can be Planned", () => {
  const elements = [{ weight: 10, length: 22000, width: 2000, height: 3000 }]; // fits no profile
  const evalNoAck = evaluateLoad({ elements, profiles, selectedProfileId: 3, targetStatus: "Planned", plannedDate: "2026-08-20", plannedTime: "08:00", exceptionAcknowledged: false });
  assert.equal(evalNoAck.nonStandard, true);
  assert.ok(evalNoAck.messages.some((m) => m.code === "non_standard"));
  assert.ok(evalNoAck.messages.some((m) => m.code === "non_standard_ack" && m.level === "blocking"));
  assert.equal(evalNoAck.blocking, true);
  const evalAck = evaluateLoad({ elements, profiles, selectedProfileId: 3, targetStatus: "Planned", plannedDate: "2026-08-20", plannedTime: "08:00", exceptionAcknowledged: true });
  assert.equal(evalAck.blocking, false, "acknowledged non-standard load can be Planned");
});

test("planning requires elements, date/time and a selected transport", () => {
  const elements = [{ weight: 10, length: 10000, width: 2000, height: 3000 }];
  const missing = evaluateLoad({ elements, profiles, selectedProfileId: null, targetStatus: "Planned", plannedDate: "", plannedTime: "", exceptionAcknowledged: false });
  assert.ok(missing.messages.some((m) => m.code === "no_datetime" && m.level === "blocking"));
  assert.ok(missing.messages.some((m) => m.code === "no_transport" && m.level === "blocking"));
  const empty = evaluateLoad({ elements: [], profiles, selectedProfileId: 1, targetStatus: "Planned", plannedDate: "2026-08-20", plannedTime: "08:00", exceptionAcknowledged: false });
  assert.ok(empty.messages.some((m) => m.code === "no_elements" && m.level === "blocking"));
});

test("type-aware orientation: an element carried against its type default warns (never blocking)", () => {
  // A wall panel (default Vertical) loaded Horizontal is unusual → warning.
  const unusual = evaluateLoad({ elements: [{ elementType: "Wall panel", weight: 5, length: 8000, width: 2000, height: 3000, orientation: "Horizontal" }], profiles, selectedProfileId: 1, targetStatus: "Planned", plannedDate: "2026-08-20", plannedTime: "08:00", exceptionAcknowledged: false });
  assert.ok(unusual.messages.some((m) => m.code === "unusual_orientation" && m.level === "warning"));
  assert.equal(unusual.blocking, false);
});

test("type-aware orientation: a floor slab travelling flat is normal and raises NO warning", () => {
  // Hollow core slab defaults to Horizontal — carrying it flat must not warn.
  const slab = evaluateLoad({ elements: [{ elementType: "Hollow core slab", weight: 5, length: 8000, width: 1200, height: 265, orientation: "Horizontal" }], profiles, selectedProfileId: 1, targetStatus: "Planned", plannedDate: "2026-08-20", plannedTime: "08:00", exceptionAcknowledged: false });
  assert.equal(slab.messages.some((m) => m.code === "unusual_orientation"), false, "a horizontal slab is not flagged");
  // But standing that same slab upright (Vertical) is unusual → warning.
  const upright = evaluateLoad({ elements: [{ elementType: "Hollow core slab", weight: 5, length: 8000, width: 1200, height: 265, orientation: "Vertical" }], profiles, selectedProfileId: 1, targetStatus: "Planned", plannedDate: "2026-08-20", plannedTime: "08:00", exceptionAcknowledged: false });
  assert.ok(upright.messages.some((m) => m.code === "unusual_orientation" && m.level === "warning"));
});

test("nextLoadNumber is monotonic and never reuses a number", () => {
  assert.equal(nextLoadNumber([]), 1);
  assert.equal(nextLoadNumber([1, 2, 3]), 4);
  assert.equal(nextLoadNumber([1, 5]), 6, "does not backfill gaps left by cancelled loads");
});

test("M: role capabilities — Foreman manages loads, Employee cannot, exception approval is PM+", () => {
  assert.equal(BASE_ROLE_CAPABILITIES.Foreman["loads.view"], true);
  assert.equal(BASE_ROLE_CAPABILITIES.Foreman["loads.manage"], true);
  assert.equal(BASE_ROLE_CAPABILITIES.Foreman["loads.approve_exception"], false);
  assert.equal(BASE_ROLE_CAPABILITIES.Employee["loads.view"], false);
  assert.equal(BASE_ROLE_CAPABILITIES.Employee["loads.manage"], false);
  assert.equal(BASE_ROLE_CAPABILITIES["Project Manager"]["loads.approve_exception"], true);
  assert.equal(BASE_ROLE_CAPABILITIES.Director["loads.approve_exception"], true);
});

// ── Sprint 12 fix pack ──────────────────────────────────────────────
import { defaultOrientation, elementMatchesLoadFilter } from "../lib/loads.ts";

const confirmed: TransportProfileCalc[] = [
  { id: 1, name: "Standard", active: true, placeholder: true, rank: 1, maxPayloadT: 24, maxLengthMm: 13600, maxWidthMm: 2550, maxHeightMm: 3100 },
  { id: 2, name: "Jumbo", active: true, placeholder: true, rank: 2, maxPayloadT: 24, maxLengthMm: 16000, maxWidthMm: 2550, maxHeightMm: 3450 },
  { id: 3, name: "Titanic", active: true, placeholder: true, rank: 3, maxPayloadT: 24, maxLengthMm: 21000, maxWidthMm: 3000, maxHeightMm: 4100 },
];
const vertical = (height: number) => ({ orientation: "Vertical", weight: 5, length: 8000, width: 300, height });
const recName = (els: Parameters<typeof computeLoadTotals>[0]) => recommendTransport(computeLoadTotals(els), confirmed)?.name ?? "Non-standard";

test("N: floor slabs default to Horizontal", () => {
  assert.equal(defaultOrientation("Hollow core slab"), "Horizontal");
  assert.equal(defaultOrientation("Solid slab"), "Horizontal");
});
test("O: wall panels (and other types) default to Vertical", () => {
  assert.equal(defaultOrientation("Wall panel"), "Vertical");
  assert.equal(defaultOrientation("Beam"), "Vertical");
  assert.equal(defaultOrientation("Unknown type"), "Vertical");
});
test("Q: a ≤3100 mm vertical element recommends Standard", () => {
  assert.equal(recName([vertical(3000)]), "Standard");
  assert.equal(recName([vertical(3100)]), "Standard");
});
test("P: a 3360 mm vertical element recommends Jumbo (not Titanic)", () => {
  assert.equal(recName([vertical(3360)]), "Jumbo");
});
test("R: a 3451–4100 mm vertical element recommends Titanic", () => {
  assert.equal(recName([vertical(3500)]), "Titanic");
  assert.equal(recName([vertical(4100)]), "Titanic");
});
test("S: a >4100 mm vertical element is non-standard", () => {
  assert.equal(recName([vertical(4200)]), "Non-standard");
});
test("T: a tall HORIZONTAL element is not judged by the vertical-height rule", () => {
  // 5000 mm 'height' but carried horizontally → excluded from the vertical-height check.
  assert.equal(recName([{ orientation: "Horizontal", weight: 5, length: 8000, width: 300, height: 5000 }]), "Standard");
  const totals = computeLoadTotals([{ orientation: "Horizontal", weight: 5, length: 8000, width: 300, height: 5000 }]);
  assert.equal(totals.maxVerticalHeightMm, 0);
});
test("L: partial, case-insensitive mark search", () => {
  const el = { code: "DPP-190-9", elementType: "Hollow core slab", floor: "1", zone: "A" };
  assert.equal(elementMatchesLoadFilter(el, { query: "dpp-190" }), true);
  assert.equal(elementMatchesLoadFilter(el, { query: "DPP-190" }), true);
  assert.equal(elementMatchesLoadFilter(el, { query: "190-9" }), true);
  assert.equal(elementMatchesLoadFilter(el, { query: "DDP-110" }), false, "a genuinely different mark does not match");
});
test("M: mark + type filter combine predictably", () => {
  const slab = { code: "DPP-190-9", elementType: "Hollow core slab", floor: "1", zone: "A" };
  const wall = { code: "DPP-190-9", elementType: "Wall panel", floor: "1", zone: "A" };
  assert.equal(elementMatchesLoadFilter(slab, { query: "dpp-190", type: "Hollow core slab" }), true);
  assert.equal(elementMatchesLoadFilter(wall, { query: "dpp-190", type: "Hollow core slab" }), false);
});

test("A/B: a submitted (present) date/time reaches validation and is treated as filled", () => {
  // The client now feeds the live-typed date/time into evaluateLoad. With both present,
  // a fully-specified Planned load has no 'no_datetime' blocker.
  const els = [vertical(3000)];
  const withDT = evaluateLoad({ elements: els, profiles: confirmed, selectedProfileId: 1, targetStatus: "Planned", plannedDate: "2026-09-21", plannedTime: "08:30", exceptionAcknowledged: false });
  assert.equal(withDT.messages.some((m) => m.code === "no_datetime"), false, "present date/time is not reported as missing");
  assert.equal(withDT.blocking, false);
  const withoutDT = evaluateLoad({ elements: els, profiles: confirmed, selectedProfileId: 1, targetStatus: "Planned", plannedDate: "", plannedTime: "", exceptionAcknowledged: false });
  assert.ok(withoutDT.messages.some((m) => m.code === "no_datetime" && m.level === "blocking"));
});

// ── Sprint 12 Improvement Pack ──────────────────────────────────────
import { isWeekendDate, parseSearchTerms, sortElementsByLength } from "../lib/loads.ts";

test("U: multi-value search matches ANY comma/semicolon-separated mark (OR)", () => {
  const a = { code: "DPP-190-9", elementType: "Hollow core slab", floor: "1", zone: "A" };
  const b = { code: "VS-101", elementType: "Wall panel", floor: "1", zone: "A" };
  assert.deepEqual(parseSearchTerms("dpp-190 , vs-101 ;"), ["dpp-190", "vs-101"]);
  assert.equal(elementMatchesLoadFilter(a, { query: "dpp-190, vs-101" }), true);
  assert.equal(elementMatchesLoadFilter(b, { query: "dpp-190, vs-101" }), true, "second term matches the wall");
  assert.equal(elementMatchesLoadFilter(b, { query: "dpp-190; xyz" }), false, "no term matches");
  // Combined with a type filter, every term is still gated by the type.
  assert.equal(elementMatchesLoadFilter(b, { query: "dpp-190, vs-101", type: "Hollow core slab" }), false);
});

test("V: an installation-zone filter narrows the available list", () => {
  const el = { code: "W-1", elementType: "Wall panel", floor: "1", zone: "A", installationZoneId: 7 };
  assert.equal(elementMatchesLoadFilter(el, { installationZoneId: 7 }), true);
  assert.equal(elementMatchesLoadFilter(el, { installationZoneId: 8 }), false);
  assert.equal(elementMatchesLoadFilter(el, {}), true, "no zone filter keeps every element");
});

test("W: sortElementsByLength is deterministic — nulls last, ties break by id", () => {
  const rows = [
    { id: 3, length: 8000 }, { id: 1, length: 12000 }, { id: 5, length: null },
    { id: 2, length: 8000 }, { id: 4, length: null },
  ];
  assert.deepEqual(sortElementsByLength(rows, "desc").map((r) => r.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(sortElementsByLength(rows, "asc").map((r) => r.id), [2, 3, 1, 4, 5]);
  assert.deepEqual(rows.map((r) => r.id), [3, 1, 5, 2, 4], "input array is not mutated");
});

test("X: a weekend delivery date warns and blocks planning until acknowledged", () => {
  const els = [vertical(3000)];
  const base = { elements: els, profiles: confirmed, selectedProfileId: 1, plannedTime: "08:00", exceptionAcknowledged: false } as const;
  assert.equal(isWeekendDate("2026-08-15"), true, "2026-08-15 is a Saturday");
  assert.equal(isWeekendDate("2026-08-16"), true, "2026-08-16 is a Sunday");
  assert.equal(isWeekendDate("2026-08-17"), false, "2026-08-17 is a Monday");
  const weekend = evaluateLoad({ ...base, targetStatus: "Planned", plannedDate: "2026-08-15" });
  assert.ok(weekend.messages.some((m) => m.code === "weekend_delivery" && m.level === "warning"));
  assert.ok(weekend.messages.some((m) => m.code === "weekend_ack" && m.level === "blocking"));
  assert.equal(weekend.blocking, true);
  const acked = evaluateLoad({ ...base, targetStatus: "Planned", plannedDate: "2026-08-15", weekendAcknowledged: true });
  assert.equal(acked.messages.some((m) => m.code === "weekend_ack"), false, "acknowledged weekend unblocks planning");
  assert.equal(acked.blocking, false);
  // A draft never blocks; a weekday never warns.
  assert.equal(evaluateLoad({ ...base, targetStatus: "Draft", plannedDate: "2026-08-15" }).blocking, false);
  assert.equal(evaluateLoad({ ...base, targetStatus: "Planned", plannedDate: "2026-08-17" }).messages.some((m) => m.code === "weekend_delivery"), false);
});

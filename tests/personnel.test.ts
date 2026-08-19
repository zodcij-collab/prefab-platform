import test from "node:test";
import assert from "node:assert/strict";
import { addOneYear, expiryStatus, daysBetween, offboardingHasUnresolved, offboardingUnresolvedCount, safetySummary, EXPIRY_WARNING_DAYS, QUALIFICATION_CATEGORIES, SAFETY_SEVERITIES } from "../lib/personnel.ts";

test("§G: OVP default validity is one year from the exam date (overridable), Feb-29 clamped", () => {
  assert.equal(addOneYear("2026-08-17"), "2027-08-17");
  assert.equal(addOneYear("2024-02-29"), "2025-02-28", "no Feb 29 in the following year → clamp");
  assert.equal(addOneYear(""), "");
});

test("§H/I/J: expiry status — Valid / Expiring soon / Expired, custom expiry, 30-day threshold", () => {
  const today = "2026-08-17";
  assert.equal(expiryStatus("2027-08-17", today), "valid");
  assert.equal(expiryStatus("2026-09-10", today), "expiring", "within 30 days → expiring");
  assert.equal(expiryStatus("2026-09-16", today), "expiring", "exactly 30 days → expiring");
  assert.equal(expiryStatus("2026-09-17", today), "valid", "31 days → still valid");
  assert.equal(expiryStatus("2026-08-16", today), "expired", "yesterday → expired");
  assert.equal(expiryStatus("", today), "none", "no valid-until (optional expiry) → none, not a warning");
  assert.equal(EXPIRY_WARNING_DAYS, 30);
  // a custom (non +1yr) validity is honoured verbatim by the status calc
  assert.equal(expiryStatus("2026-11-30", today, 30), "valid");
  assert.equal(daysBetween("2026-08-17", "2026-08-27"), 10);
});

test("§L/O: qualification expiry is OPTIONAL (none) yet still classified when present; 'Other' custom exists", () => {
  assert.equal(expiryStatus("", "2026-08-17"), "none");
  assert.equal(expiryStatus("2020-01-01", "2026-08-17"), "expired");
  assert.ok((QUALIFICATION_CATEGORIES as readonly string[]).includes("Welder"));
  assert.ok((QUALIFICATION_CATEGORIES as readonly string[]).includes("Other"), "custom titles are carried by the 'Other' category");
});

test("§AD/AE: offboarding checklist — unresolved = anything not Closed; count preserved", () => {
  const items = [{ state: "Closed" }, { state: "Not checked" }, { state: "Problem" }];
  assert.equal(offboardingHasUnresolved(items), true);
  assert.equal(offboardingUnresolvedCount(items), 2, "Not checked + Problem are unresolved");
  assert.equal(offboardingHasUnresolved([{ state: "Closed" }, { state: "Closed" }]), false, "all Closed → resolved");
});

test("§Z/AB: safety severities + a 12-month summary (factual counts, not a weighted score)", () => {
  assert.deepEqual([...SAFETY_SEVERITIES], ["Observation", "Minor", "Major", "Critical"]);
  const today = "2026-08-17";
  const records = [
    { occurredAt: "2026-08-01 09:00:00", severity: "Observation" },
    { occurredAt: "2026-05-10", severity: "Observation" },
    { occurredAt: "2026-03-02", severity: "Major" },
    { occurredAt: "2025-01-01", severity: "Critical" }, // > 12 months ago → excluded
  ];
  const s = safetySummary(records, today);
  assert.equal(s.total, 3, "only the last 12 months are counted");
  assert.equal(s.observations, 2);
  assert.equal(s.major, 1);
  assert.equal(s.critical, 0, "the >12-month Critical is excluded");
});

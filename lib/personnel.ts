// Sprint 15 — Personnel & Competency V1: pure domain logic (no DB access).
// Employee ≠ User: an employee is a person the company engages; they may or may not have a
// platform account. This module holds the vocabularies and the derived states (expiry, safety
// summary, offboarding) so they are unit-testable and shared by the repo, pages and PDF.

export const EMPLOYMENT_STATUSES = ["Active", "Offboarding", "Inactive"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

// Position (employees.role) ≠ skills. Suggested skills; free-text is allowed too.
export const SKILL_OPTIONS = ["Concrete worker", "Carpenter", "Rigger", "Welder", "Assembler", "Crane operator", "Electrician", "General labourer"] as const;

// Reusable qualification categories; "Other" carries a custom title.
export const QUALIFICATION_CATEGORIES = ["General site safety", "Hot Works", "Rigger / Slinger", "MEWP / lifting platform", "Welder", "Other"] as const;
export type QualificationCategory = (typeof QUALIFICATION_CATEGORIES)[number];

export const SAFETY_SEVERITIES = ["Observation", "Minor", "Major", "Critical"] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

export const OFFBOARDING_ITEM_STATES = ["Not checked", "Closed", "Problem"] as const;
export type OffboardingItemState = (typeof OFFBOARDING_ITEM_STATES)[number];
export const DEFAULT_OFFBOARDING_ITEMS = ["Tools returned", "PPE / workwear checked", "Keys / access cards returned", "Company vehicle checked", "Open responsibilities / tasks checked", "Other"] as const;

export const TERMINATION_REASONS = ["Employee resignation", "End of contract", "Employer termination", "Other"] as const;

export const EMPLOYEE_DOCUMENT_RELATIONS = ["general", "ovp", "qualification", "induction", "safety"] as const;
export type EmployeeDocumentRelation = (typeof EMPLOYEE_DOCUMENT_RELATIONS)[number];

export function isValidSeverity(value: string): boolean { return (SAFETY_SEVERITIES as readonly string[]).includes(value); }
export function isValidEmploymentStatus(value: string): boolean { return (EMPLOYMENT_STATUSES as readonly string[]).includes(value); }

// ── Expiry (OVP + qualifications) ────────────────────────────────────────────
// A valid-until in the past is EXPIRED; within the warning window (default 30 days) is EXPIRING;
// otherwise VALID. No valid-until at all (qualifications may be permanent) is NONE — not a
// warning. V1 only WARNS — it never blocks work.
export const EXPIRY_WARNING_DAYS = 30;
export type ExpiryStatus = "valid" | "expiring" | "expired" | "none";

const toUTC = (d: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((d ?? "").trim());
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
export function daysBetween(from: string, to: string): number | null {
  const a = toUTC(from), b = toUTC(to);
  return a === null || b === null ? null : Math.round((b - a) / 86400000);
}
export function expiryStatus(validUntil: string, today: string, thresholdDays = EXPIRY_WARNING_DAYS): ExpiryStatus {
  if (!validUntil) return "none";
  const days = daysBetween(today, validUntil);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= thresholdDays) return "expiring";
  return "valid";
}

// Default OVP validity is one year from the examination date, but the caller may always override
// it (validity varies by profession/person). Pure string math (Feb 29 → Feb 28), no clock.
const pad = (n: number) => String(n).padStart(2, "0");
export function addOneYear(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  if (!m) return "";
  const y = Number(m[1]) + 1; const mo = Number(m[2]); let d = Number(m[3]);
  if (mo === 2 && d === 29) d = 28; // no Feb 29 next (non-leap) year — clamp defensively
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// ── Offboarding ──────────────────────────────────────────────────────────────
// A checklist item is unresolved unless explicitly Closed. Completing with unresolved items is
// allowed (Director decision) but must be surfaced as a warning and the records preserved.
export function offboardingHasUnresolved(items: { state: string }[]): boolean {
  return items.some((i) => i.state !== "Closed");
}
export function offboardingUnresolvedCount(items: { state: string }[]): number {
  return items.filter((i) => i.state !== "Closed").length;
}

// ── Safety record 12-month summary ───────────────────────────────────────────
// A useful factual summary (NOT a weighted score). Counts by severity over the last 12 months.
export type SafetySummary = { total: number; observations: number; minor: number; major: number; critical: number };
export function safetySummary(records: { occurredAt: string; severity: string }[], today: string): SafetySummary {
  const summary: SafetySummary = { total: 0, observations: 0, minor: 0, major: 0, critical: 0 };
  for (const r of records) {
    const d = (r.occurredAt || "").slice(0, 10);
    const since = daysBetween(d, today);
    if (since === null || since < 0 || since > 366) continue; // within the last 12 months only
    summary.total++;
    if (r.severity === "Critical") summary.critical++;
    else if (r.severity === "Major") summary.major++;
    else if (r.severity === "Minor") summary.minor++;
    else summary.observations++;
  }
  return summary;
}

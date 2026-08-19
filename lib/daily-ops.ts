// Sprint 15 — Daily Site Operations V1: pure domain logic (no DB access).
// Factual site attendance (shift + man-hours, NO payroll) and the Daily Log lifecycle helpers.
// The Daily Log AGGREGATES facts already in PREFAB.LV — the aggregation query lives in the repo;
// the pure shape, man-hour maths and confirmation rules live here so they are unit-testable.

export const ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Left early"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export function isValidAttendanceStatus(value: string): boolean { return (ATTENDANCE_STATUSES as readonly string[]).includes(value); }

export const DAILY_LOG_STATUSES = ["Draft", "Confirmed"] as const;
export type DailyLogStatus = (typeof DAILY_LOG_STATUSES)[number];

// Worked hours between two "HH:MM" times (decimal, never negative). Empty/invalid → 0.
export function hoursBetween(start: string, end: string): number {
  const parse = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? "").trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const a = parse(start), b = parse(end);
  if (a === null || b === null) return 0;
  return Math.max(0, Math.round(((b - a) / 60) * 100) / 100);
}

// Worked hours for one crew member given the crew default shift and any individual exception.
// Absent → 0. Otherwise the individual start/end (a late arrival or early departure) overrides
// the crew default for that side; a plain Present member simply gets the full shift.
export function computeWorkedHours(entry: { status: string; startTime?: string; endTime?: string }, shift: { start: string; end: string }): number {
  if (entry.status === "Absent") return 0;
  const start = entry.startTime || shift.start;
  const end = entry.endTime || shift.end;
  return hoursBetween(start, end);
}

// The crew man-hour roll-up for a day.
export type AttendanceRollup = { present: number; absent: number; manHours: number };
export function attendanceRollup(entries: { status: string; workedHours: number }[]): AttendanceRollup {
  let present = 0, absent = 0, manHours = 0;
  for (const e of entries) {
    if (e.status === "Absent") absent++;
    else { present++; manHours += e.workedHours; }
  }
  return { present, absent, manHours: Math.round(manHours * 100) / 100 };
}

// ── Daily Log lifecycle ──────────────────────────────────────────────────────
// DRAFT reflects live project facts; CONFIRMED is an immutable snapshot. A confirmed report must
// never change because a downstream fact later changed — the PDF and views read the snapshot.
export function dailyLogIsConfirmed(status: string): boolean { return status === "Confirmed"; }
export function canEditDailyLog(status: string): boolean { return status !== "Confirmed"; }

// The shape of a confirmed snapshot — persisted as JSON on the daily log at confirmation, and
// the sole source for the historical report/PDF. Kept explicit so the PDF never depends on live
// joins for a confirmed report. `manual` fields are the Foreman's own inputs; everything else is
// aggregated from existing PREFAB.LV facts at confirmation time.
export type DailyLogSnapshot = {
  version: 1;
  projectId: string;
  projectName: string;
  logDate: string;
  shift: { start: string; end: string };
  responsible: string;
  manual: { workPerformed: string; delays: string; delayReason: string; siteEvents: string; equipmentNote: string; materialsNote: string; foremanComment: string };
  workforce: { present: number; absent: number; manHours: number; crew: Array<{ name: string; status: string; startTime: string; endTime: string; workedHours: number }> };
  installedElements: Array<{ code: string; elementType: string; zone: string }>;
  zones: string[];
  deliveries: Array<{ loadNumber: number; status: string; supplier: string; plannedDate: string }>;
  defects: Array<{ issueNumber: number; title: string; status: string; priority: string }>;
  tasks: Array<{ issueNumber: number; title: string; status: string; priority: string }>;
  critical: Array<{ issueNumber: number; title: string; status: string }>;
  safety: Array<{ employee: string; severity: string; category: string; description: string }>;
  photos: Array<{ id: number; caption: string; area: string }>;
  weather: string;
  confirmedBy: string;
  confirmedAt: string;
};

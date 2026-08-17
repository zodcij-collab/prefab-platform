// Sprint 13 — Site issues / tasks / defects: pure domain logic (no DB access).
// One entity models several operational types through a two-stage lifecycle: a low-friction
// on-site quick capture that later gets classified and worked to resolution/closure.

// User-facing types offered in classification. The top-level intent is Task vs Defect; the
// remaining entries are useful defect subtypes. "Issue" is kept valid for legacy/back-compat
// but is not offered (it duplicates "Defect") — its user-facing meaning maps to Defect. RFI is
// reserved as a future-capable type; the full RFI correspondence workflow is NOT part of V13.
export const ISSUE_TYPES = ["Task", "Defect", "Design issue", "Safety", "NCR"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
export const LEGACY_ISSUE_TYPES = ["Issue"] as const;
export const FUTURE_ISSUE_TYPES = ["RFI"] as const;
export const ALL_ISSUE_TYPES = [...ISSUE_TYPES, ...LEGACY_ISSUE_TYPES, ...FUTURE_ISSUE_TYPES] as const;

export const ISSUE_PRIORITIES = ["Low", "Normal", "High", "Critical"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

// Captured = quick site capture pending classification. Terminal: Closed, Cancelled.
export const ISSUE_STATUSES = ["Captured", "Open", "Assigned", "In progress", "Resolved", "Closed", "Cancelled"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const OPEN_STATUSES: IssueStatus[] = ["Captured", "Open", "Assigned", "In progress"]; // still actionable, not resolved
export const TERMINAL_STATUSES: IssueStatus[] = ["Closed", "Cancelled"];

export function isValidType(value: string): boolean { return (ALL_ISSUE_TYPES as readonly string[]).includes(value); }
export function isValidPriority(value: string): boolean { return (ISSUE_PRIORITIES as readonly string[]).includes(value); }

// Allowed lifecycle transitions. Resolution/closure/cancellation go through dedicated
// operations (they carry required data); this governs the plain status moves.
const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  Captured: ["Open", "Assigned", "In progress", "Cancelled"],
  Open: ["Assigned", "In progress", "Resolved", "Cancelled"],
  Assigned: ["Open", "In progress", "Resolved", "Cancelled"],
  "In progress": ["Assigned", "Resolved", "Cancelled"],
  Resolved: ["In progress", "Closed", "Cancelled"], // reopen or close
  Closed: [],
  Cancelled: [],
};
export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as IssueStatus] ?? []).includes(to as IssueStatus);
}

// Overdue is always DERIVED — a due date in the past while the issue is still actionable.
export function isOverdue(dueDate: string, status: string, today: string): boolean {
  return !!dueDate && !!today && dueDate < today && OPEN_STATUSES.includes(status as IssueStatus);
}

export function needsClassification(issue: { status: string; classified: number }): boolean {
  return issue.classified !== 1 || issue.status === "Captured";
}

export type AttentionReason = "needs_classification" | "assigned_to_me" | "due_today" | "overdue" | "critical_unresolved" | "awaiting_closure";
export type AttentionContext = { today: string; employeeId: string | null };

// Actionable reasons an issue currently deserves attention, derived from authoritative
// domain state only. Terminal issues (Closed/Cancelled) never require attention.
export function attentionReasons(issue: { status: string; classified: number; priority: string; dueDate: string; assignedToId: string | null }, ctx: AttentionContext): AttentionReason[] {
  if (TERMINAL_STATUSES.includes(issue.status as IssueStatus)) return [];
  const reasons: AttentionReason[] = [];
  if (needsClassification(issue)) reasons.push("needs_classification");
  if (ctx.employeeId && issue.assignedToId && issue.assignedToId === ctx.employeeId) reasons.push("assigned_to_me");
  if (issue.dueDate && issue.dueDate === ctx.today && OPEN_STATUSES.includes(issue.status as IssueStatus)) reasons.push("due_today");
  if (isOverdue(issue.dueDate, issue.status, ctx.today)) reasons.push("overdue");
  if (issue.priority === "Critical" && OPEN_STATUSES.includes(issue.status as IssueStatus)) reasons.push("critical_unresolved");
  if (issue.status === "Resolved") reasons.push("awaiting_closure");
  return reasons;
}

// Which of an issue's attention reasons a given viewer should actually be shown. A manager
// sees project-wide reasons; a non-manager sees only what is personally actionable (their
// own assignments) plus unclassified captures if they may capture.
export function visibleAttentionReasons(reasons: AttentionReason[], viewer: { canManage: boolean; canCapture: boolean }): AttentionReason[] {
  if (viewer.canManage) return reasons;
  return reasons.filter((reason) => reason === "assigned_to_me" || (reason === "needs_classification" && viewer.canCapture));
}

export function nextIssueNumber(existingNumbers: number[]): number {
  return existingNumbers.reduce((max, n) => Math.max(max, n), 0) + 1;
}

// ── Sprint 14: drawing markers ──────────────────────────────────────
// Markers are stored as a page number + normalized coordinates (0..1) relative to the
// rendered PDF page, so a marker sits in the same physical drawing location on any device,
// viewport, zoom, or fit mode. Never store or trust screen pixels.
export function isValidMarker(page: unknown, x: unknown, y: unknown): boolean {
  return Number.isInteger(page) && (page as number) >= 1
    && typeof x === "number" && Number.isFinite(x) && (x as number) >= 0 && (x as number) <= 1
    && typeof y === "number" && Number.isFinite(y) && (y as number) >= 0 && (y as number) <= 1;
}
// Clamp a normalized value into [0,1] defensively (a tap right at the page edge).
export function clampUnit(value: number): number { return value < 0 ? 0 : value > 1 ? 1 : value; }

export type MarkerAppearance = "critical" | "open" | "subdued" | "hidden";
// V1 marker semantics (restrained, construction-oriented — not a GIS map):
// cancelled → hidden; resolved/closed → subdued; open + Critical → emphasised; else standard.
export function markerAppearance(issue: { status: string; priority: string }): MarkerAppearance {
  if (issue.status === "Cancelled") return "hidden";
  if (issue.status === "Resolved" || issue.status === "Closed") return "subdued";
  if (issue.priority === "Critical") return "critical";
  return "open";
}

export const MARKER_FILTERS = ["active", "defects", "tasks", "critical", "resolved", "all"] as const;
export type MarkerFilter = (typeof MARKER_FILTERS)[number];
// The small practical overlay filter. "active" (default) hides terminal issues; "resolved"
// shows only Resolved/Closed. "all" shows every marker record — including Cancelled, which is
// rendered subdued (never as active). In every mode other than "all", Cancelled is hidden.
export function markerPassesFilter(issue: { status: string; type: string; priority: string }, filter: MarkerFilter): boolean {
  if (filter === "all") return true;
  if (issue.status === "Cancelled") return false;
  const active = OPEN_STATUSES.includes(issue.status as IssueStatus);
  switch (filter) {
    case "active": return active;
    case "defects": return active && issue.type !== "Task";
    case "tasks": return active && issue.type === "Task";
    case "critical": return active && issue.priority === "Critical";
    case "resolved": return issue.status === "Resolved" || issue.status === "Closed";
    default: return active;
  }
}

// Contextual drawing "Back" target (explicit, project-scoped, refresh/bookmark-safe return
// contract): when the viewer was entered from an issue (Show/Set location on drawing) the
// validated return issue routes Back to that exact issue; entering from Project → Drawings (no
// return issue) routes Back to the drawings list. Derived from state, never browser history.
export function drawingBackHref(projectId: string, returnIssueId: number | null | undefined): string {
  return returnIssueId ? `/portal/projects/${projectId}/issues/${returnIssueId}` : `/portal/projects/${projectId}/drawings`;
}

// A human-friendly, testable relative position for a normalized marker (0..1), used in the
// Issue PDF instead of raw coordinates. Nine stable zone keys (translated via portalText);
// derived by thirds. This never exposes the raw x/y numbers to the recipient.
export const MARKER_ZONE_KEYS = [
  "top-left", "top-center", "top-right",
  "mid-left", "center", "mid-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;
export type MarkerZone = (typeof MARKER_ZONE_KEYS)[number];
export function markerZoneKey(x: number, y: number): MarkerZone {
  const band = (v: number) => (v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2);
  const rows = ["top", "mid", "bottom"] as const;
  const cols = ["left", "center", "right"] as const;
  const row = rows[band(clampUnit(y))], col = cols[band(clampUnit(x))];
  if (row === "mid" && col === "center") return "center";
  return `${row}-${col}` as MarkerZone;
}

// Pending-media selection helpers for the quick-capture form. The client keeps its own file
// list (a native <input> can't remove one file), reflecting it back into the input via
// DataTransfer so the submitted payload always matches what the user sees.
export const ISSUE_CAPTURE_MAX_FILES = 4;
type PendingFile = { name: string; size: number; lastModified: number };
export function mergePendingFiles<T extends PendingFile>(existing: T[], picked: T[], max = ISSUE_CAPTURE_MAX_FILES): T[] {
  const merged = [...existing];
  for (const file of picked) {
    if (!merged.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) merged.push(file);
  }
  return merged.slice(0, max);
}
export function removePendingFile<T>(files: T[], index: number): T[] {
  return files.filter((_, i) => i !== index);
}

// Free-text list filter for the desktop issue list: partial, case-insensitive match on the
// human number (#12 / 12), title, details, type, assignee.
export function issueMatchesQuery(issue: { issueNumber: number; title: string; details: string; type: string; assignedTo: string }, query: string): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return true;
  const normalized = q.replace(/^#/, "");
  return String(issue.issueNumber).includes(normalized)
    || issue.title.toLowerCase().includes(q)
    || issue.details.toLowerCase().includes(q)
    || issue.type.toLowerCase().includes(q)
    || issue.assignedTo.toLowerCase().includes(q);
}

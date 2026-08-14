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

// Sprint 12 — Load Planning pure domain logic (no DB access).
// Units follow the Element Register: weight in tonnes (t), dimensions in mm.
// This module only assists a human planner: it calculates totals, recommends the
// least-demanding transport profile, and classifies validation messages. It never
// decides erection sequence or auto-optimises loads.

export const LOAD_STATUSES = ["Draft", "Planned", "Accepted", "Cancelled"] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];
// A load is "editable" (composition + schedule may change) only before it is received.
export const EDITABLE_LOAD_STATUSES = ["Draft", "Planned"] as const;

export const ELEMENT_ORIENTATIONS = ["Vertical", "Horizontal"] as const;
export type ElementOrientation = (typeof ELEMENT_ORIENTATIONS)[number];

export const LOAD_INTENTS = ["Direct erection", "Site storage"] as const;
export type LoadIntent = (typeof LOAD_INTENTS)[number];

// forward = the first listed element is loaded first; reverse = loaded last.
export const LOADING_DIRECTIONS = ["forward", "reverse"] as const;
export type LoadingDirection = (typeof LOADING_DIRECTIONS)[number];

export type LoadElementCalc = { elementType?: string; orientation?: string; weight: number | null; length: number | null; width: number | null; height: number | null };
export type TransportProfileCalc = { id: number; name: string; active: boolean; placeholder: boolean; rank: number; maxPayloadT: number | null; maxLengthMm: number | null; maxWidthMm: number | null; maxHeightMm: number | null };
export type LoadTotals = { count: number; totalWeightT: number; maxLengthMm: number; maxWidthMm: number; maxHeightMm: number; maxVerticalHeightMm: number; hasHorizontal: boolean; hasUnusualOrientation: boolean };

const round3 = (value: number) => Math.round(value * 1000) / 1000;

// Default transport orientation by element type (V1 confirmed business rule):
// floor slabs travel flat (Horizontal); everything else travels upright (Vertical).
// Applies only to new planning rows — it never rewrites stored element data.
const HORIZONTAL_DEFAULT_TYPES = new Set(["Hollow core slab", "Solid slab"]);
export function defaultOrientation(elementType: string): ElementOrientation {
  return HORIZONTAL_DEFAULT_TYPES.has(elementType) ? "Horizontal" : "Vertical";
}

export function computeLoadTotals(elements: LoadElementCalc[]): LoadTotals {
  let totalWeightT = 0, maxLengthMm = 0, maxWidthMm = 0, maxHeightMm = 0, maxVerticalHeightMm = 0, hasHorizontal = false, hasUnusualOrientation = false;
  for (const element of elements) {
    totalWeightT += element.weight ?? 0;
    maxLengthMm = Math.max(maxLengthMm, element.length ?? 0);
    maxWidthMm = Math.max(maxWidthMm, element.width ?? 0);
    maxHeightMm = Math.max(maxHeightMm, element.height ?? 0);
    if (element.orientation === "Horizontal") hasHorizontal = true;
    // The confirmed vertical-height transport limit applies only to elements carried upright.
    else maxVerticalHeightMm = Math.max(maxVerticalHeightMm, element.height ?? 0);
    // Type-aware orientation check: a floor slab travelling flat is normal and must NOT
    // warn; only an element carried against its element-type default is flagged.
    if (element.orientation && element.elementType && element.orientation !== defaultOrientation(element.elementType)) hasUnusualOrientation = true;
  }
  return { count: elements.length, totalWeightT: round3(totalWeightT), maxLengthMm, maxWidthMm, maxHeightMm, maxVerticalHeightMm, hasHorizontal, hasUnusualOrientation };
}

// Deterministic sort of available elements by physical length. Null lengths sort last in
// both directions; ties break by element id so the order is stable across re-reads.
export function sortElementsByLength<T extends { length: number | null; id: number }>(rows: T[], direction: "asc" | "desc"): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const al = a.length, bl = b.length;
    if (al === null && bl === null) return a.id - b.id;
    if (al === null) return 1;
    if (bl === null) return -1;
    if (al !== bl) return (al - bl) * factor;
    return a.id - b.id;
  });
}

// A YYYY-MM-DD date that falls on Saturday or Sunday (interpreted in UTC for determinism).
export function isWeekendDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

// Which configured limits the load exceeds for a given profile (empty = fits).
// Height uses the CONFIRMED vertical element-height limit and only counts Vertical
// elements — Horizontal elements are not judged by the vertical-height threshold.
export function profileExceedances(profile: TransportProfileCalc, totals: LoadTotals): Array<"payload" | "length" | "width" | "height"> {
  const exceed: Array<"payload" | "length" | "width" | "height"> = [];
  if (profile.maxPayloadT !== null && totals.totalWeightT > profile.maxPayloadT + 1e-9) exceed.push("payload");
  if (profile.maxLengthMm !== null && totals.maxLengthMm > profile.maxLengthMm) exceed.push("length");
  if (profile.maxWidthMm !== null && totals.maxWidthMm > profile.maxWidthMm) exceed.push("width");
  if (profile.maxHeightMm !== null && totals.maxVerticalHeightMm > profile.maxHeightMm) exceed.push("height");
  return exceed;
}

export function profileSatisfies(profile: TransportProfileCalc, totals: LoadTotals): boolean {
  return profileExceedances(profile, totals).length === 0;
}

// Least-demanding active profile (lowest rank, then id) that fits the whole load.
export function recommendTransport(totals: LoadTotals, profiles: TransportProfileCalc[]): TransportProfileCalc | null {
  if (totals.count === 0) return null;
  const ordered = profiles.filter((p) => p.active).sort((a, b) => a.rank - b.rank || a.id - b.id);
  return ordered.find((profile) => profileSatisfies(profile, totals)) ?? null;
}

export type LoadMessageLevel = "warning" | "blocking";
export type LoadMessage = { level: LoadMessageLevel; code: string; detail?: string };

export type EvaluateLoadInput = {
  elements: LoadElementCalc[];
  profiles: TransportProfileCalc[];
  selectedProfileId: number | null;
  targetStatus: LoadStatus;
  plannedDate: string;
  plannedTime: string;
  exceptionAcknowledged: boolean;
  weekendAcknowledged?: boolean;
};

export type LoadEvaluation = {
  totals: LoadTotals;
  recommendedProfileId: number | null;
  nonStandard: boolean;
  messages: LoadMessage[];
  blocking: boolean;
};

export function evaluateLoad(input: EvaluateLoadInput): LoadEvaluation {
  const totals = computeLoadTotals(input.elements);
  const recommended = recommendTransport(totals, input.profiles);
  const nonStandard = totals.count > 0 && recommended === null;
  const selected = input.selectedProfileId ? input.profiles.find((p) => p.id === input.selectedProfileId) ?? null : null;
  const planning = input.targetStatus === "Planned";
  const messages: LoadMessage[] = [];

  if (totals.hasUnusualOrientation) messages.push({ level: "warning", code: "unusual_orientation" });
  if (nonStandard) messages.push({ level: "warning", code: "non_standard" });
  const weekend = isWeekendDate(input.plannedDate);
  if (weekend) messages.push({ level: "warning", code: "weekend_delivery" });

  const exceed = selected ? profileExceedances(selected, totals) : [];
  if (selected && exceed.length) {
    if (input.exceptionAcknowledged) messages.push({ level: "warning", code: "exceeds_acknowledged", detail: exceed.join(",") });
    else messages.push({ level: planning ? "blocking" : "warning", code: "exceeds_selected", detail: exceed.join(",") });
  } else if (selected && recommended && selected.rank < recommended.rank) {
    messages.push({ level: "warning", code: "below_recommended" });
  }

  if (planning) {
    if (totals.count === 0) messages.push({ level: "blocking", code: "no_elements" });
    if (!input.plannedDate || !input.plannedTime) messages.push({ level: "blocking", code: "no_datetime" });
    if (!input.selectedProfileId) messages.push({ level: "blocking", code: "no_transport" });
    if (nonStandard && !input.exceptionAcknowledged) messages.push({ level: "blocking", code: "non_standard_ack" });
    if (weekend && !input.weekendAcknowledged) messages.push({ level: "blocking", code: "weekend_ack" });
  }

  return { totals, recommendedProfileId: recommended?.id ?? null, nonStandard, messages, blocking: messages.some((m) => m.level === "blocking") };
}

export function nextLoadNumber(existingNumbers: number[]): number {
  return existingNumbers.reduce((max, n) => Math.max(max, n), 0) + 1;
}

// Split a search box into individual terms. Multiple marks/codes may be entered at once,
// separated by comma or semicolon (whitespace around each term is trimmed, blanks dropped).
export function parseSearchTerms(query: string): string[] {
  return (query ?? "").split(/[,;]+/).map((term) => term.trim().toLowerCase()).filter(Boolean);
}

// Available-element filter for the load editor: partial, case-insensitive mark/code
// (or type) search combined predictably with type/floor/zone/installation-zone filters.
// The query is OR across comma/semicolon-separated terms — any term matching keeps the row.
export function elementMatchesLoadFilter(element: { code: string; elementType: string; floor: string; zone: string; installationZoneId?: number | null }, filters: { query?: string; type?: string; floor?: string; zone?: string; installationZoneId?: number | null }): boolean {
  const terms = parseSearchTerms(filters.query ?? "");
  const matchesQuery = !terms.length || terms.some((term) => element.code.toLowerCase().includes(term) || element.elementType.toLowerCase().includes(term));
  return matchesQuery
    && (!filters.type || element.elementType === filters.type)
    && (!filters.floor || element.floor === filters.floor)
    && (!filters.zone || element.zone === filters.zone)
    && (filters.installationZoneId == null || element.installationZoneId === filters.installationZoneId);
}

import { ROLES, type Role } from "./roles.ts";

// Sprint 11.3 — project-scoped, capability-based access model.
//
// Precedence (highest wins):
//   1. Global role (Director / Administrator) → every capability on every project.
//      Overrides can never reduce a global role.
//   2. Explicit per-project override (project_permissions row) → the stored
//      capability map. Keys present in the override win over the base default —
//      they can GRANT a capability the base role lacks or DENY one it would allow.
//   3. Base-role default for the project (seeded only when the user has access to
//      the project, i.e. has an override row or legacy membership).
//   If the effective `project.view` is false, the user has no access at all.

export const PROJECT_CAPABILITIES = [
  "project.view", "project.edit",
  "reports.view", "reports.create", "reports.submit", "reports.approve",
  "timesheets.view", "timesheets.manage",
  "documents.view", "documents.manage",
  "elements.view", "elements.operate", "elements.manage",
  "workforce.view", "workforce.manage",
  "loads.view", "loads.manage", "loads.approve_exception",
  "issues.view", "issues.capture", "issues.manage", "issues.comment",
  // Sprint 15 — project-scoped daily operations. (Personnel/HR capabilities are company-level
  // and modelled by role in lib/permissions.ts, not per-project.)
  "personnel.assign", "induction.manage",
  "attendance.view", "attendance.manage",
  "safety.view", "safety.manage",
  "dailylog.view", "dailylog.create", "dailylog.confirm",
  "sitephotos.capture",
] as const;
export type ProjectCapability = (typeof PROJECT_CAPABILITIES)[number];
export type CapabilityMap = Partial<Record<ProjectCapability, boolean>>;
export type ResolvedCapabilities = Record<ProjectCapability, boolean>;

function caps(granted: ProjectCapability[]): ResolvedCapabilities {
  return Object.fromEntries(PROJECT_CAPABILITIES.map((capability) => [capability, granted.includes(capability)])) as ResolvedCapabilities;
}

export const ALL_CAPABILITIES = caps([...PROJECT_CAPABILITIES]);
export const NO_CAPABILITIES = caps([]);

// Base-role defaults must reproduce the pre-Sprint-11.3 behaviour when no override
// exists, so existing enforcement does not regress.
export const BASE_ROLE_CAPABILITIES: Record<Role, ResolvedCapabilities> = {
  Director: ALL_CAPABILITIES,
  Administrator: ALL_CAPABILITIES,
  "Project Manager": ALL_CAPABILITIES,
  Foreman: caps(["project.view", "reports.view", "reports.create", "reports.submit", "documents.view", "elements.view", "elements.operate", "workforce.view", "loads.view", "loads.manage", "issues.view", "issues.capture", "issues.manage", "issues.comment",
    "personnel.assign", "induction.manage", "attendance.view", "attendance.manage", "safety.view", "safety.manage", "dailylog.view", "dailylog.create", "dailylog.confirm", "sitephotos.capture"]),
  Employee: caps(["project.view"]),
};

export function isGlobalRole(role: string): boolean {
  return role === "Director" || role === "Administrator";
}

function normalizeRole(role: string): Role {
  return (ROLES as readonly string[]).includes(role) ? (role as Role) : "Employee";
}

export type AccessInput = {
  role: string;
  hasOverride: boolean;
  overrideCapabilities?: CapabilityMap | null;
  hasLegacyAccess: boolean;
};

export function resolveProjectCapabilities(input: AccessInput): ResolvedCapabilities {
  if (isGlobalRole(input.role)) return ALL_CAPABILITIES;
  if (!input.hasOverride && !input.hasLegacyAccess) return NO_CAPABILITIES;
  const base = BASE_ROLE_CAPABILITIES[normalizeRole(input.role)];
  const effective: ResolvedCapabilities = { ...base };
  if (input.hasOverride && input.overrideCapabilities) {
    for (const capability of PROJECT_CAPABILITIES) {
      const value = input.overrideCapabilities[capability];
      if (typeof value === "boolean") effective[capability] = value;
    }
  }
  if (!effective["project.view"]) return NO_CAPABILITIES;
  return effective;
}

export function hasCapability(resolved: ResolvedCapabilities, capability: ProjectCapability): boolean {
  return resolved[capability] === true;
}

// Named presets used by the Access & Roles editor. "Role default" is represented
// by the absence of an override row (returns null → caller removes the row).
export const ACCESS_PRESETS = ["role", "read-only", "full", "none"] as const;
export type AccessPreset = (typeof ACCESS_PRESETS)[number];

export function presetCapabilities(preset: AccessPreset): CapabilityMap | null {
  if (preset === "role") return null;
  if (preset === "full") return { ...ALL_CAPABILITIES };
  if (preset === "read-only") return caps(["project.view", "reports.view", "timesheets.view", "documents.view", "elements.view", "workforce.view", "loads.view", "issues.view"]);
  return caps([]); // "none" — explicit revoke (project.view false)
}

export function sanitizeCapabilityMap(input: Record<string, unknown>): CapabilityMap {
  const map: CapabilityMap = {};
  for (const capability of PROJECT_CAPABILITIES) {
    const value = input[capability];
    if (typeof value === "boolean") map[capability] = value;
  }
  return map;
}

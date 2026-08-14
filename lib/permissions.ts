import type { SessionUser } from "./auth";
import { getProject, getProjectPermission, listUserProjectIds } from "./repositories.ts";
import { ROLES, type Role } from "./roles.ts";
import {
  isGlobalRole,
  resolveProjectCapabilities,
  type ProjectCapability,
  type ResolvedCapabilities,
} from "./project-access.ts";

export { ROLES, type Role } from "./roles.ts";
export type { ProjectCapability } from "./project-access.ts";

const rank: Record<Role, number> = {
  Director: 5,
  Administrator: 4,
  "Project Manager": 3,
  Foreman: 2,
  Employee: 1,
};

export function hasRole(user: SessionUser, minimum: Role) {
  const role = (ROLES.includes(user.role as Role) ? user.role : "Employee") as Role;
  return rank[role] >= rank[minimum];
}

// ---- Global (non-project) capabilities ----
export function canManageAccess(user: SessionUser) {
  return isGlobalRole(user.role);
}
export function canConfigureProjectAccess(user: SessionUser) {
  return isGlobalRole(user.role);
}
export function canManageProjectLifecycle(user: SessionUser) {
  return isGlobalRole(user.role);
}
export function canManageProjects(user: SessionUser) {
  return hasRole(user, "Project Manager");
}
export function canManageProjectOperations(user: SessionUser) {
  return hasRole(user, "Foreman");
}
export function hasGlobalWorkforceAccess(user: SessionUser) {
  return isGlobalRole(user.role);
}
export function canManageEmployees(user: SessionUser) {
  return isGlobalRole(user.role);
}
export function canViewTimesheets(user: SessionUser) {
  return hasGlobalWorkforceAccess(user) || user.role === "Project Manager";
}
export function canExportTimesheets(user: SessionUser) {
  return canViewTimesheets(user);
}
export function canReviewDailyReports(user: SessionUser) {
  return hasGlobalWorkforceAccess(user) || user.role === "Project Manager";
}

// ---- Project-scoped capability resolution ----
export function projectCapabilities(user: SessionUser, projectId: string): ResolvedCapabilities {
  const override = getProjectPermission(user.id, projectId);
  const hasLegacyAccess = isGlobalRole(user.role) ? true : listUserProjectIds(user.id).includes(projectId);
  return resolveProjectCapabilities({
    role: user.role,
    hasOverride: Boolean(override),
    overrideCapabilities: override?.capabilities,
    hasLegacyAccess,
  });
}

export function canProject(user: SessionUser, projectId: string, capability: ProjectCapability): boolean {
  return projectCapabilities(user, projectId)[capability] === true;
}

// A project is accessible when the user has project.view AND (the project is not
// archived, or the user is a global role that may still view archived projects).
export function canAccessProject(user: SessionUser, projectId: string): boolean {
  const project = getProject(projectId);
  if (!project) return false;
  if (project.archivedAt && !isGlobalRole(user.role)) return false;
  return canProject(user, projectId, "project.view");
}

export function permittedProjectIds(user: SessionUser, allProjectIds: string[]): string[] {
  return allProjectIds.filter((id) => canAccessProject(user, id));
}

// Element / report / timesheet / document / workforce checks now delegate to the
// capability model, so per-project overrides apply everywhere automatically.
export function canViewProjectElements(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "elements.view");
}
export function canManageProjectElements(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "elements.manage");
}
export function canUpdateElementOperations(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "elements.operate");
}
export function canCorrectElementInstallation(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "elements.manage");
}
export function canCreateProjectReports(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "reports.create");
}
export function canApproveProjectReports(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "reports.approve");
}
export function canViewProjectTimesheets(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "timesheets.view");
}
export function canManageProjectDocuments(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "documents.manage");
}
export function canManageProjectWorkforce(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "workforce.manage");
}
export function canViewProjectLoads(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "loads.view");
}
export function canManageProjectLoads(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "loads.manage");
}
export function canApproveLoadException(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "loads.approve_exception");
}
export function canViewProjectIssues(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "issues.view");
}
export function canCaptureProjectIssues(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "issues.capture");
}
export function canManageProjectIssues(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "issues.manage");
}
export function canCommentProjectIssues(user: SessionUser, projectId: string) {
  return canAccessProject(user, projectId) && canProject(user, projectId, "issues.comment");
}

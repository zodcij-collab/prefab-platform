import type { SessionUser } from "./auth";
import { listUserProjectIds } from "./repositories";
import {ROLES,type Role} from "./roles";
import {elementRoleCapabilities} from "./elements";

export {ROLES,type Role} from "./roles";

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

export function canManageAccess(user: SessionUser) {
  return user.role === "Director" || user.role === "Administrator";
}

export function canManageProjects(user: SessionUser) {
  return hasRole(user, "Project Manager");
}

export function canManageProjectOperations(user: SessionUser) {
  return hasRole(user, "Foreman");
}

export function hasGlobalWorkforceAccess(user:SessionUser){return user.role==="Director"||user.role==="Administrator";}
export function canManageEmployees(user:SessionUser){return hasGlobalWorkforceAccess(user);}
export function canViewTimesheets(user:SessionUser){return hasGlobalWorkforceAccess(user)||user.role==="Project Manager";}
export function canExportTimesheets(user:SessionUser){return canViewTimesheets(user);}
export function canReviewDailyReports(user:SessionUser){return hasGlobalWorkforceAccess(user)||user.role==="Project Manager";}
export function canViewProjectElements(user:SessionUser,projectId:string){return elementRoleCapabilities(user.role).view&&canAccessProject(user,projectId);}
export function canManageProjectElements(user:SessionUser,projectId:string){return elementRoleCapabilities(user.role).manage&&canAccessProject(user,projectId);}
export function canUpdateElementOperations(user:SessionUser,projectId:string){return elementRoleCapabilities(user.role).operate&&canAccessProject(user,projectId);}
export function canCorrectElementInstallation(user:SessionUser,projectId:string){return elementRoleCapabilities(user.role).correct&&canAccessProject(user,projectId);}
export function canAccessProject(user:SessionUser,projectId:string){return hasGlobalWorkforceAccess(user)||listUserProjectIds(user.id).includes(projectId);}
export function permittedProjectIds(user:SessionUser,allProjectIds:string[]){return hasGlobalWorkforceAccess(user)?allProjectIds:listUserProjectIds(user.id);}

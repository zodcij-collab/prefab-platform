import type { SessionUser } from "./auth";

export const ROLES = ["Director", "Administrator", "Project Manager", "Foreman", "Employee"] as const;
export type Role = (typeof ROLES)[number];

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

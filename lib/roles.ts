export const ROLES = ["Director", "Administrator", "Project Manager", "Foreman", "Employee"] as const;
export type Role = (typeof ROLES)[number];

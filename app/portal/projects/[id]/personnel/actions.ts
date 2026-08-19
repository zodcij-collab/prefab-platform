"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../../lib/auth";
import { canAssignProjectPersonnel, canManageProjectInduction } from "../../../../../lib/permissions";
import { getProject } from "../../../../../lib/repositories";
import { getEmployee } from "../../../../../lib/repositories";
import { assignEmployeeToProject, endProjectAssignment, setProjectInduction } from "../../../../../lib/personnel-repo";

const clean = (data: FormData, key: string, max = 500) => String(data.get(key) ?? "").trim().slice(0, max);
async function authorize(data: FormData, check: (u: Awaited<ReturnType<typeof requireUser>>, p: string) => boolean) {
  const user = await requireUser();
  const projectId = clean(data, "projectId", 100);
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.archivedAt) throw new Error("Archived projects are read-only.");
  if (!check(user, projectId)) throw new Error("You do not have permission for this action.");
  return { user, projectId };
}
const back = (projectId: string) => { revalidatePath(`/portal/projects/${projectId}/personnel`); redirect(`/portal/projects/${projectId}/personnel`); };

export async function assignEmployeeAction(data: FormData) {
  const { user, projectId } = await authorize(data, canAssignProjectPersonnel);
  const employeeId = clean(data, "employeeId", 100);
  if (!getEmployee(employeeId)) throw new Error("Employee not found.");
  assignEmployeeToProject(projectId, employeeId, clean(data, "projectRole", 60) || "Team member", clean(data, "startDate", 10) || new Date().toISOString().slice(0, 10), user);
  back(projectId);
}
export async function unassignEmployeeAction(data: FormData) {
  const { user, projectId } = await authorize(data, canAssignProjectPersonnel);
  endProjectAssignment(Number(clean(data, "assignmentId", 20)), new Date().toISOString().slice(0, 10), user);
  back(projectId);
}
export async function setInductionAction(data: FormData) {
  const { user, projectId } = await authorize(data, canManageProjectInduction);
  const employeeId = clean(data, "employeeId", 100);
  if (!getEmployee(employeeId)) throw new Error("Employee not found.");
  setProjectInduction(projectId, employeeId, { completed: clean(data, "completed", 5) === "1", completionDate: clean(data, "completionDate", 10) || new Date().toISOString().slice(0, 10), conductedBy: clean(data, "conductedBy", 120) || user.name, comment: clean(data, "comment", 1000) }, user);
  back(projectId);
}

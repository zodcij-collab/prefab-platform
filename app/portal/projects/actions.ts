"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth";
import type { SessionUser } from "../../../lib/auth";
import { canAccessProject, canManageProjectLifecycle, canManageProjectOperations, canManageProjectWorkforce, canManageProjects } from "../../../lib/permissions";
import { archiveProject, assignProjectMember, closeProjectAssignment, createProject, deleteDelivery, deleteProjectIssue, getDelivery, getProject, getProjectByName, getProjectIssue, listEmployees, listProjectMembers, logActivity, recordProjectAssignment, removeProjectMember, restoreProject, runTransaction, saveDelivery, saveProjectIssue, unassignProjectIssues, updateProject } from "../../../lib/repositories";
import { appToday } from "../../../lib/datetime";

const PROJECT_STATUSES = ["Planning", "Active", "On hold", "Completed"];
const DELIVERY_STATUSES = ["Planned", "Confirmed", "Received", "Cancelled"];
const ISSUE_STATUSES = ["Open", "In progress", "Resolved", "Closed"];
const ISSUE_PRIORITIES = ["Low", "Normal", "High", "Critical"];
const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const limited = (data: FormData, key: string, max: number) => { const result=value(data,key); if(result.length>max) throw new Error(`${key} is too long.`); return result; };
const positiveId = (data: FormData, key: string) => { const id = Number(value(data,key)); return Number.isInteger(id) && id > 0 ? id : undefined; };
const slugify = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0,60);

async function projectManager() {
  const user = await requireUser();
  if (!canManageProjects(user)) throw new Error("You do not have permission to manage projects.");
  return user;
}

async function operationsUser() {
  const user = await requireUser();
  if (!canManageProjectOperations(user)) throw new Error("You do not have permission to manage project operations.");
  return user;
}

// Ensures the actor may write to this specific project and that the project is not
// archived (archived projects are read-only until restored).
function assertWritableProject(user: SessionUser, projectId: string) {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (!canAccessProject(user, projectId)) throw new Error("You do not have access to this project.");
  if (project.archivedAt) throw new Error("Archived projects are read-only. Restore the project first.");
  return project;
}

function projectInput(data: FormData) {
  const coordinate=(key:string,min:number,max:number)=>{const raw=value(data,key);if(!raw)return null;const parsed=Number(raw);if(!Number.isFinite(parsed)||parsed<min||parsed>max)throw new Error("Invalid project coordinates.");return parsed;};
  const input = { name:limited(data,"name",160), client:limited(data,"client",160), location:limited(data,"location",240), startDate:value(data,"startDate"), targetDate:value(data,"targetDate"), status:value(data,"status"), managerEmployeeId:value(data,"managerEmployeeId"), description:limited(data,"description",4000),latitude:coordinate("latitude",-90,90),longitude:coordinate("longitude",-180,180) };
  if (!input.name || !input.client || !input.location || !input.managerEmployeeId || !PROJECT_STATUSES.includes(input.status)) throw new Error("Invalid project details.");
  if (input.startDate && input.targetDate && input.targetDate < input.startDate) throw new Error("Target completion must be after the start date.");
  return input;
}

export async function createProjectAction(data: FormData) {
  const user = await projectManager(); const input = projectInput(data); const manager=listEmployees().find((employee)=>employee.id===input.managerEmployeeId); if(!manager) throw new Error("Responsible project manager not found."); let id = slugify(input.name);
  if (!id) throw new Error("Project name must contain letters or numbers.");
  if (getProject(id)) id = `${id}-${Date.now().toString(36)}`;
  runTransaction(()=>{if(getProjectByName(input.name))throw new Error("A project with this name already exists.");createProject({id,...input,manager:manager.name});assignProjectMember(id,manager.id,"Project manager");logActivity({userId:user.id,actor:user.name,action:"Created project",entityType:"project",entityId:id,details:input.name});});
  redirect(`/portal/projects/${id}`);
}

export async function updateProjectAction(data: FormData) {
  const user = await projectManager(); const id=value(data,"projectId"); const project=getProject(id); if(!project) throw new Error("Project not found."); if(!canAccessProject(user,id)) throw new Error("You do not have access to this project."); if(project.archivedAt) throw new Error("Archived projects are read-only. Restore the project first."); const input=projectInput(data); const manager=listEmployees().find((employee)=>employee.id===input.managerEmployeeId); if(!manager) throw new Error("Responsible project manager not found.");
  runTransaction(()=>{const sameName=getProjectByName(input.name);if(sameName&&sameName.id!==id)throw new Error("A project with this name already exists.");updateProject(id,project.name,{...input,manager:manager.name});if(project.managerEmployeeId&&project.managerEmployeeId!==manager.id)assignProjectMember(id,project.managerEmployeeId,"Team member");assignProjectMember(id,manager.id,"Project manager");logActivity({userId:user.id,actor:user.name,action:"Updated project",entityType:"project",entityId:id,details:input.name});});
  revalidatePath("/portal"); revalidatePath(`/portal/projects/${id}`); redirect(`/portal/projects/${id}`);
}

export async function assignMemberAction(data: FormData) {
  const user=await projectManager(); const projectId=value(data,"projectId"); assertWritableProject(user,projectId); if(!canManageProjectWorkforce(user,projectId))throw new Error("You cannot manage this project's workforce."); const employeeId=value(data,"employeeId"); const role=value(data,"projectRole"); const project=getProject(projectId); const employee=listEmployees().find((item)=>item.id===employeeId);
  const alreadyAssigned=project?listProjectMembers(projectId).some((member)=>member.id===employeeId):false;
  if(!project || !employee || alreadyAssigned || !role || role.length>80 || (role.toLowerCase()==="project manager"&&project.managerEmployeeId!==employeeId)) throw new Error("Invalid member assignment."); runTransaction(()=>{assignProjectMember(projectId,employeeId,role);recordProjectAssignment(employeeId,projectId,role,appToday());
  logActivity({userId:user.id,actor:user.name,action:"Assigned project member",entityType:"project",entityId:projectId,details:`${employee.name} · ${role}`});}); revalidatePath(`/portal/projects/${projectId}`);
}

export async function updateMemberRoleAction(data: FormData) {
  const user=await projectManager(); const projectId=value(data,"projectId"); assertWritableProject(user,projectId); if(!canManageProjectWorkforce(user,projectId))throw new Error("You cannot manage this project's workforce."); const employeeId=value(data,"employeeId"); const role=limited(data,"projectRole",80); const project=getProject(projectId); const member=listProjectMembers(projectId).find((item)=>item.id===employeeId);
  if(!project||!member||!role) throw new Error("Invalid project member role update.");
  if(project.managerEmployeeId===employeeId&&role!=="Project manager") throw new Error("The responsible project manager role can only be changed through project editing.");
  if(project.managerEmployeeId!==employeeId&&role.toLowerCase()==="project manager") throw new Error("Assign this employee as responsible manager through project editing first.");
  runTransaction(()=>{assignProjectMember(projectId,employeeId,role);closeProjectAssignment(employeeId,projectId,appToday());recordProjectAssignment(employeeId,projectId,role,appToday());logActivity({userId:user.id,actor:user.name,action:"Updated project member role",entityType:"project",entityId:projectId,details:`${member.name} · ${member.projectRole} → ${role}`});});
  revalidatePath(`/portal/projects/${projectId}`);
}

export async function removeMemberAction(data: FormData) {
  const user=await projectManager(); const projectId=value(data,"projectId"); assertWritableProject(user,projectId); if(!canManageProjectWorkforce(user,projectId))throw new Error("You cannot manage this project's workforce."); const employeeId=value(data,"employeeId"); const employee=listEmployees().find((item)=>item.id===employeeId); const project=getProject(projectId); if(!project||!employee) throw new Error("Invalid member."); if(project.managerEmployeeId===employeeId) throw new Error("Assign another responsible manager before removing this member.");
  runTransaction(()=>{unassignProjectIssues(projectId,employeeId);removeProjectMember(projectId,employeeId);closeProjectAssignment(employeeId,projectId,appToday());logActivity({userId:user.id,actor:user.name,action:"Removed project member",entityType:"project",entityId:projectId,details:employee.name});}); revalidatePath(`/portal/projects/${projectId}`);
}

export async function saveDeliveryAction(data: FormData) {
  const user=await operationsUser(); const projectId=value(data,"projectId"); assertWritableProject(user,projectId); const id=positiveId(data,"id"); const status=value(data,"status"); if(!getProject(projectId)||!DELIVERY_STATUSES.includes(status)) throw new Error("Invalid delivery."); if(id && getDelivery(id)?.projectId!==projectId) throw new Error("Delivery not found.");
  const input={id,projectId,deliveryDate:value(data,"deliveryDate"),deliveryTime:value(data,"deliveryTime"),supplier:limited(data,"supplier",160),loadRef:limited(data,"loadRef",80),description:limited(data,"description",500),status,notes:limited(data,"notes",2000)}; if(!input.deliveryDate||!input.supplier||!input.description) throw new Error("Delivery date, supplier and description are required."); runTransaction(()=>{saveDelivery(input);
  logActivity({userId:user.id,actor:user.name,action:id?"Updated delivery":"Created delivery",entityType:"project",entityId:projectId,details:`${input.loadRef} · ${status}`});}); revalidatePath(`/portal/projects/${projectId}`);
}

export async function deleteDeliveryAction(data: FormData) {
  const user=await projectManager(); const projectId=value(data,"projectId"); assertWritableProject(user,projectId); const id=positiveId(data,"id"); const delivery=id?getDelivery(id):undefined; if(!delivery||delivery.projectId!==projectId) throw new Error("Delivery not found."); if(!["Planned","Cancelled"].includes(delivery.status)) throw new Error("Only planned or cancelled deliveries can be deleted."); runTransaction(()=>{deleteDelivery(id!,projectId);logActivity({userId:user.id,actor:user.name,action:"Deleted delivery",entityType:"project",entityId:projectId,details:delivery.loadRef||delivery.description});}); revalidatePath(`/portal/projects/${projectId}`);
}

export async function saveIssueAction(data: FormData) {
  const user=await operationsUser(); const projectId=value(data,"projectId"); assertWritableProject(user,projectId); const id=positiveId(data,"id"); const status=value(data,"status"); const priority=value(data,"priority"); if(!getProject(projectId)||!ISSUE_STATUSES.includes(status)||!ISSUE_PRIORITIES.includes(priority)) throw new Error("Invalid issue."); if(id&&getProjectIssue(id)?.projectId!==projectId) throw new Error("Issue not found.");
  const ownerEmployeeId=value(data,"ownerEmployeeId")||null; const owner=ownerEmployeeId?listProjectMembers(projectId).find((member)=>member.id===ownerEmployeeId):undefined; if(ownerEmployeeId&&!owner) throw new Error("Responsible employee must be a project member."); const input={id,projectId,createdDate:value(data,"createdDate")||appToday(),category:limited(data,"category",100),title:limited(data,"title",240),priority,status,owner:owner?.name??"",ownerEmployeeId,details:limited(data,"details",3000)}; if(!input.category||!input.title) throw new Error("Issue category and title are required."); runTransaction(()=>{saveProjectIssue(input);
  logActivity({userId:user.id,actor:user.name,action:id?`Updated issue · ${status}`:"Created issue",entityType:"project",entityId:projectId,details:input.title});}); revalidatePath(`/portal/projects/${projectId}`);
}

export async function archiveProjectAction(data: FormData) {
  const user = await requireUser();
  if (!canManageProjectLifecycle(user)) throw new Error("You do not have permission to archive projects.");
  const id = value(data, "projectId"); const project = getProject(id); if (!project) throw new Error("Project not found.");
  if (!project.archivedAt) runTransaction(() => { archiveProject(id, user.id); logActivity({ userId: user.id, actor: user.name, action: "Archived project", entityType: "project", entityId: id, details: project.name }); });
  revalidatePath("/portal/projects"); revalidatePath(`/portal/projects/${id}`); redirect(`/portal/projects/${id}`);
}

export async function restoreProjectAction(data: FormData) {
  const user = await requireUser();
  if (!canManageProjectLifecycle(user)) throw new Error("You do not have permission to restore projects.");
  const id = value(data, "projectId"); const project = getProject(id); if (!project) throw new Error("Project not found.");
  if (project.archivedAt) runTransaction(() => { restoreProject(id); logActivity({ userId: user.id, actor: user.name, action: "Restored project", entityType: "project", entityId: id, details: project.name }); });
  revalidatePath("/portal/projects"); revalidatePath(`/portal/projects/${id}`); redirect(`/portal/projects/${id}`);
}

export async function deleteIssueAction(data: FormData) {
  const user=await projectManager(); const projectId=value(data,"projectId"); assertWritableProject(user,projectId); const id=positiveId(data,"id"); const issue=id?getProjectIssue(id):undefined; if(!issue||issue.projectId!==projectId) throw new Error("Issue not found."); if(issue.status!=="Open") throw new Error("Only open issues can be deleted."); runTransaction(()=>{deleteProjectIssue(id!,projectId);logActivity({userId:user.id,actor:user.name,action:"Deleted issue",entityType:"project",entityId:projectId,details:issue.title});}); revalidatePath(`/portal/projects/${projectId}`);
}

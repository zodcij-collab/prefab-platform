"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth";
import { canManageAccess,ROLES,type Role } from "../../../lib/permissions";
import { createUserAccess,getProject,getUserAccess,getUserAccessByEmail,logActivity,runTransaction,setProjectPermission,setUserActiveState,updateUserAccess } from "../../../lib/repositories";
import { presetCapabilities,type AccessPreset,type CapabilityMap } from "../../../lib/project-access";
import { hashPassword } from "../../../lib/security";

export type UserFormState={error:string;success:string};
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const value=(data:FormData,key:string)=>String(data.get(key)??"").trim();

async function accessManager(){const user=await requireUser();if(!canManageAccess(user))throw new Error("You do not have permission to manage users.");return user;}
function commonInput(data:FormData){const name=value(data,"name");const email=value(data,"email").toLowerCase();const role=value(data,"role") as Role;const status=value(data,"status");if(!name||name.length>120)throw new Error("Name is required and must be 120 characters or fewer.");if(!EMAIL.test(email)||email.length>254)throw new Error("Enter a valid email address.");if(!ROLES.includes(role))throw new Error("Select a valid role.");if(!["Active","Inactive"].includes(status))throw new Error("Select a valid status.");return{name,email,role,active:status==="Active"?1:0};}
function validatePassword(password:string,confirmation:string){if(password!==confirmation)throw new Error("Passwords do not match.");if(password.length<12)throw new Error("Password must be at least 12 characters.");const classes=[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].filter((pattern)=>pattern.test(password)).length;if(classes<3)throw new Error("Password must include at least three of: lowercase, uppercase, number, and symbol.");}
function message(error:unknown){return error instanceof Error?error.message:"Unable to save user.";}

export async function createUserAction(_state:UserFormState,data:FormData):Promise<UserFormState>{const actor=await accessManager();try{const input=commonInput(data);const password=String(data.get("password")??"");validatePassword(password,String(data.get("confirmPassword")??""));runTransaction(()=>{if(getUserAccessByEmail(input.email))throw new Error("A user with this email already exists.");const result=createUserAccess({...input,passwordHash:hashPassword(password)});logActivity({userId:actor.id,actor:actor.name,action:"Created user",entityType:"user",entityId:String(result.lastInsertRowid),details:`${input.name} · ${input.role} · ${input.active?"Active":"Inactive"}`});});revalidatePath("/portal/access");return{error:"",success:`${input.name} was created.`};}catch(error){return{error:message(error),success:""};}}

const ACCESS_PRESETS:AccessPreset[]=["role","read-only","full","none"];
export async function setUserProjectAccessAction(data:FormData){
  const actor=await accessManager();
  const userId=Number(value(data,"userId"));const projectId=value(data,"projectId");const preset=value(data,"preset") as AccessPreset;
  const target=getUserAccess(userId);const project=getProject(projectId);
  if(!target||!project)throw new Error("Invalid selection.");
  if(!ACCESS_PRESETS.includes(preset))throw new Error("Invalid access level.");
  runTransaction(()=>{
    // Every preset now writes an explicit project_permissions row = explicit project membership.
    // "Default for role" stores an EMPTY capability map: membership is granted (the project
    // becomes visible) while effective permissions are derived from the user's role preset
    // (resolveProjectCapabilities applies no overrides on top of the base role). It must never
    // mean "no access" — the previous behaviour (delete the row) silently removed access for any
    // user without legacy membership. "No project access" (none) stays an explicit all-false revoke.
    const capabilities:CapabilityMap=preset==="role"?{}:(presetCapabilities(preset)??{});
    setProjectPermission(userId,projectId,capabilities,actor.id);
    logActivity({userId:actor.id,actor:actor.name,action:preset==="role"?"Granted project access (role default)":preset==="none"?"Revoked project access":"Set project permissions",entityType:"user",entityId:String(userId),details:`${target.name} · ${project.name} · ${preset}`});
  });
  revalidatePath("/portal/access");redirect("/portal/access");
}
// Explicit, audited user lifecycle: deactivate / reactivate (a visible, confirmed control that
// surfaces the same soft state the edit form's status carries). Deactivation blocks sign-in and
// invalidates every active session immediately (getSessionUser requires users.active=1), while
// all historical references — issues, comments, events, activity log, attribution — are
// preserved (no row is deleted). Director/Administrator only; the current account can never
// deactivate itself. Reactivation restores sign-in. Idempotent — no-ops on unchanged state.
export async function setUserActiveAction(data:FormData){
  const actor=await accessManager();
  const id=Number(value(data,"id"));const active=value(data,"active")==="1"?1:0;
  if(!Number.isInteger(id)||id<1)throw new Error("Invalid user.");
  const existing=getUserAccess(id);if(!existing)throw new Error("User not found.");
  if(id===actor.id&&!active)throw new Error("You cannot deactivate your own currently authenticated account.");
  runTransaction(()=>setUserActiveState(id,active,actor));
  revalidatePath("/portal/access");redirect("/portal/access");
}

export async function updateUserAction(_state:UserFormState,data:FormData):Promise<UserFormState>{const actor=await accessManager();try{const id=Number(value(data,"id"));if(!Number.isInteger(id)||id<1)throw new Error("Invalid user.");const existing=getUserAccess(id);if(!existing)throw new Error("User not found.");const input=commonInput(data);if(id===actor.id&&!input.active)throw new Error("You cannot deactivate your own currently authenticated account.");runTransaction(()=>{const duplicate=getUserAccessByEmail(input.email);if(duplicate&&duplicate.id!==id)throw new Error("A user with this email already exists.");updateUserAccess(id,input);const changes:string[]=[];if(existing.name!==input.name)changes.push(`${existing.name} → ${input.name}`);if(existing.email.toLowerCase()!==input.email)changes.push(`${existing.email} → ${input.email}`);if(existing.role!==input.role)changes.push(`Role: ${existing.role} → ${input.role}`);if(Boolean(existing.active)!==Boolean(input.active))changes.push(`Status: ${existing.active?"Active":"Inactive"} → ${input.active?"Active":"Inactive"}`);if(changes.length)logActivity({userId:actor.id,actor:actor.name,action:"Updated user",entityType:"user",entityId:String(id),details:changes.join(" · ")});});revalidatePath("/portal/access");return{error:"",success:`${input.name} was updated.`};}catch(error){return{error:message(error),success:""};}}

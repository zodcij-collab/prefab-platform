"use server";
import {revalidatePath} from "next/cache";
import {requireUser} from "../../../../../lib/auth";
import {canUpdateElementOperations} from "../../../../../lib/permissions";
import {bulkUpdateElementStatus,getProject,logActivity,runTransaction} from "../../../../../lib/repositories";
import {appToday} from "../../../../../lib/datetime";
export async function bulkElementStatusAction(data:FormData){const user=await requireUser(),projectId=String(data.get("projectId")??"").slice(0,100),status=String(data.get("status")??"").slice(0,40),ids=data.getAll("elementIds").map(Number);if(!getProject(projectId)||!canUpdateElementOperations(user,projectId))throw new Error("You do not have permission to update project elements.");runTransaction(()=>{const count=bulkUpdateElementStatus(projectId,ids,status,appToday(),user);if(count)logActivity({userId:user.id,actor:user.name,action:"Bulk updated project elements",entityType:"project",entityId:projectId,details:`${count} elements · ${status}`});});revalidatePath(`/portal/projects/${projectId}/elements`);}

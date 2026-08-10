"use server";
import {revalidatePath} from "next/cache";
import {requireUser} from "../../../lib/auth";
import {canManageProjectOperations,permittedProjectIds} from "../../../lib/permissions";
import {createProjectPhoto,getReport,listProjects,logActivity,runTransaction} from "../../../lib/repositories";
import {removeStoredFile,storeUpload} from "../../../lib/storage";
import {REPORT_MEDIA_MAX_FILES} from "../../../lib/upload-config";
import {canLinkReportMedia} from "../../../lib/timesheet-policy";

export type ReportMediaState={error:string;success:string};
const text=(data:FormData,key:string,max:number)=>String(data.get(key)??"").trim().slice(0,max);

export async function uploadReportMediaAction(_state:ReportMediaState,data:FormData):Promise<ReportMediaState>{
  const user=await requireUser();
  if(!canManageProjectOperations(user))return{error:"Daily Report media upload is not permitted.",success:""};
  const reportId=Number(text(data,"reportId",20)),report=getReport(reportId);
  const allowedProjects=permittedProjectIds(user,listProjects().map((project)=>project.id));
  if(!report||!canLinkReportMedia(report.projectId,allowedProjects))return{error:"Daily Report not found.",success:""};
  const files=data.getAll("files").filter((file):file is File=>file instanceof File&&file.size>0);
  if(!files.length)return{error:"Select at least one photo.",success:""};
  if(files.length>REPORT_MEDIA_MAX_FILES)return{error:`Upload no more than ${REPORT_MEDIA_MAX_FILES} photos at once.`,success:""};
  const caption=text(data,"caption",240),area=text(data,"area",160),notes=text(data,"notes",2000),stored:{file:File;storedPath:string}[]=[];
  try{
    for(const file of files){const result=await storeUpload(file,"photos");stored.push({file,storedPath:result.storedPath});}
    runTransaction(()=>{for(const item of stored)createProjectPhoto({projectId:report.projectId,reportId:report.id,photoDate:report.date,area,caption:caption||item.file.name,author:user.name,notes,originalFilename:item.file.name,storedPath:item.storedPath,fileSize:item.file.size,mimeType:item.file.type,uploadedById:user.id});logActivity({userId:user.id,actor:user.name,action:"Daily Report media uploaded",entityType:"project",entityId:report.projectId,details:`Report #${report.id} · ${stored.length} photo(s)`});});
  }catch{await Promise.all(stored.map((item)=>removeStoredFile(item.storedPath)));return{error:"Daily Report media upload failed.",success:""};}
  revalidatePath(`/portal/reports/${report.id}`);revalidatePath(`/portal/projects/${report.projectId}`);
  return{error:"",success:stored.length===1?"Photo attached to Daily Report.":"Photos attached to Daily Report."};
}

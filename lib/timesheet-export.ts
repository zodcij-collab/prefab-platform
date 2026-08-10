import type {NextRequest} from "next/server";
import {getSessionUser} from "./auth";
import {canExportTimesheets,permittedProjectIds} from "./permissions";
import {listAttendance,listProjects} from "./repositories";
import {normalizePortalLanguage,type PortalLanguage} from "../data/portal-i18n";
import {isAuthorizedExportProject} from "./timesheet-policy";
import {filterTimesheetEntries} from "./timesheets";
import type {TimeEntry} from "./timesheets";

export type ResolvedTimesheetExport={period:string;entries:TimeEntry[];language:PortalLanguage};

export async function resolveTimesheetExport(request:NextRequest):Promise<ResolvedTimesheetExport|Response>{
  const user=await getSessionUser();
  if(!user||!canExportTimesheets(user))return new Response("Not found",{status:404});
  const month=request.nextUrl.searchParams.get("month")??"",year=request.nextUrl.searchParams.get("year")??"",period=`${year}-${month}`;
  if(!/^\d{4}-\d{2}$/.test(period))return new Response("Invalid period",{status:400});
  const projects=listProjects(),allowed=new Set(permittedProjectIds(user,projects.map((project)=>project.id))),project=request.nextUrl.searchParams.get("project")??"",employee=request.nextUrl.searchParams.get("employee")??"";
  if(!isAuthorizedExportProject(project,allowed))return new Response("Not found",{status:404});
  const entries=filterTimesheetEntries(listAttendance(period).filter((entry)=>allowed.has(entry.projectId)),project,employee);
  return{period,entries,language:normalizePortalLanguage(request.cookies.get("prefab_portal_language")?.value)};
}

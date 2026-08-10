import {notFound} from "next/navigation";
import {requireUser} from "../../../../lib/auth";
import {canAccessProject} from "../../../../lib/permissions";
import {getPortalLanguage} from "../../../../lib/portal-locale";
import {getUserAccess,listAttendanceForReport,listProjects,listReportElements,listReportPhotos,listReports,listReportWeather,logActivity} from "../../../../lib/repositories";
import {dailyReportArchiveFilename,generateDailyReportArchivePdf} from "../../../../lib/daily-report-pdf";
import {canExportReportArchive} from "../../../../lib/report-export-policy";

export const runtime="nodejs";

export async function GET(request:Request){
  const user=await requireUser(),url=new URL(request.url),projectId=url.searchParams.get("project")??"",month=url.searchParams.get("month")??"",year=url.searchParams.get("year")??"";
  if(!/^(0[1-9]|1[0-2])$/.test(month)||!/^(20\d{2}|2100)$/.test(year))notFound();
  const authorizedProjects=listProjects().filter((project)=>canAccessProject(user,project.id));
  const project=authorizedProjects.find((candidate)=>candidate.id===projectId);
  if(!project||!canExportReportArchive(projectId,authorizedProjects.map((candidate)=>candidate.id)))notFound();
  const period=`${year}-${month}`;
  const reports=listReports().filter((report)=>report.projectId===projectId&&report.date.startsWith(period)).sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
  const records=reports.map((report)=>({report,attendance:listAttendanceForReport(report.id),photos:listReportPhotos(report.id),elements:listReportElements(report.id),weather:listReportWeather(report.id),approvedBy:report.approvedById?getUserAccess(report.approvedById)?.name??"":""}));
  const pdf=await generateDailyReportArchivePdf({project:project.name,period,records,language:await getPortalLanguage()});
  logActivity({userId:user.id,actor:user.name,action:"Daily Reports archive exported",entityType:"project",entityId:project.id,details:`${period} · ${records.length} report(s)`});
  const filename=dailyReportArchiveFilename(project.name,period),ascii=filename.replace(/[^\x20-\x7e]/g,"_").replace(/"/g,"_");
  return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Length":String(pdf.length),"Content-Disposition":`attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}

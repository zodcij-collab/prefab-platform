import {notFound} from "next/navigation";
import {requireUser} from "../../../../../lib/auth";
import {canAccessProject} from "../../../../../lib/permissions";
import {getPortalLanguage} from "../../../../../lib/portal-locale";
import {getReport,getUserAccess,listAttendanceForReport,listReportElements,listReportPhotos,listReportWeather,logActivity} from "../../../../../lib/repositories";
import {dailyReportPdfFilename,generateDailyReportPdf} from "../../../../../lib/daily-report-pdf";

export const runtime="nodejs";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await requireUser(),{id}=await params,report=getReport(Number(id));
  if(!report||!canAccessProject(user,report.projectId))notFound();
  const inline=new URL(request.url).searchParams.get("view")==="print";
  const approvedBy=report.approvedById?getUserAccess(report.approvedById)?.name??"":"";
  const pdf=await generateDailyReportPdf({report,attendance:listAttendanceForReport(report.id),photos:listReportPhotos(report.id),elements:listReportElements(report.id),weather:listReportWeather(report.id),approvedBy,language:await getPortalLanguage()});
  logActivity({userId:user.id,actor:user.name,action:inline?"Daily Report print PDF opened":"Daily Report PDF exported",entityType:"project",entityId:report.projectId,details:`Report #${report.id}`});
  const filename=dailyReportPdfFilename(report),ascii=filename.replace(/[^\x20-\x7e]/g,"_").replace(/"/g,"_");
  return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Length":String(pdf.length),"Content-Disposition":`${inline?"inline":"attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}

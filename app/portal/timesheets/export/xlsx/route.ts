import {NextRequest} from "next/server";
import {englishExportLabels,timesheetWorkbook,type ExportLabels} from "../../../../../lib/timesheets";
import {resolveTimesheetExport} from "../../../../../lib/timesheet-export";
import {portalText} from "../../../../../data/portal-i18n";

export async function GET(request:NextRequest){
  const resolved=await resolveTimesheetExport(request);if(resolved instanceof Response)return resolved;
  const t=(value:string)=>portalText(resolved.language,value),labels=Object.fromEntries(Object.entries(englishExportLabels).map(([key,value])=>[key,t(value)])) as ExportLabels;
  const workbook=timesheetWorkbook(resolved.entries,labels);
  return new Response(Buffer.from(workbook),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="prefab-timesheet-${resolved.period}.xlsx"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}

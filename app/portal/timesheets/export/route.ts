import {NextRequest} from "next/server";
import {attendanceCsv,englishExportLabels,type ExportLabels} from "../../../../lib/timesheets";
import {resolveTimesheetExport} from "../../../../lib/timesheet-export";
import {portalText} from "../../../../data/portal-i18n";

export async function GET(request:NextRequest){
  const resolved=await resolveTimesheetExport(request);if(resolved instanceof Response)return resolved;
  const t=(value:string)=>portalText(resolved.language,value),labels=Object.fromEntries(Object.entries(englishExportLabels).map(([key,value])=>[key,t(value)])) as ExportLabels;
  const csv=attendanceCsv(resolved.entries,labels);
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="prefab-timesheet-${resolved.period}.csv"`,"Cache-Control":"private, no-store"}});
}

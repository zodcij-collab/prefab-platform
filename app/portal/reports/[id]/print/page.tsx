import {redirect} from "next/navigation";

export default async function DailyReportPrintPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  redirect(`/portal/reports/${encodeURIComponent(id)}/pdf?view=print`);
}

import type {DatabaseSync} from "node:sqlite";

export function canDeleteReportStatus(status:string){return status==="Draft";}

export function canDeleteDraftForUser(input:{role:string;userId:number;reporterUserId:number}){
  return input.role==="Director"||input.role==="Administrator"||input.role==="Project Manager"||input.role==="Foreman"&&input.userId===input.reporterUserId;
}

export function deleteDraftReportRecords(database:DatabaseSync,id:number){
  const report=database.prepare(`SELECT id,status FROM reports WHERE id=?`).get(id) as {id:number;status:string}|undefined;
  if(!report||!canDeleteReportStatus(report.status))return 0;
  database.prepare(`UPDATE project_photos SET report_id=NULL WHERE report_id=?`).run(id);
  return Number(database.prepare(`DELETE FROM reports WHERE id=? AND status='Draft'`).run(id).changes);
}

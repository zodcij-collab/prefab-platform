export function canExportReportArchive(projectId:string,authorizedProjectIds:Iterable<string>){
  return new Set(authorizedProjectIds).has(projectId);
}

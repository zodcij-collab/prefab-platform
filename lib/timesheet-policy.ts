export function isTimesheetPeriodEditable(status:string){return status!=="Closed";}
export function isAuthorizedExportProject(requestedProject:string,allowedProjects:Iterable<string>){return !requestedProject||new Set(allowedProjects).has(requestedProject);}
export function canLinkReportMedia(reportProjectId:string,authorizedProjectIds:Iterable<string>){return new Set(authorizedProjectIds).has(reportProjectId);}

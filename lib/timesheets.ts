import {strToU8,zipSync} from "fflate";

export type TimeEntry={employeeId:string;employeeName:string;position:string;projectId:string;projectName:string;date:string;status:string;regularHours:number;overtimeHours:number;comment:string;reportId:number};
export type AttendanceTotals={daysWorked:number;regularHours:number;overtimeHours:number;totalHours:number;sickLeaveDays:number;vacationDays:number;absenceDays:number;dayOffDays:number;businessTripDays:number;otherStatusDays:number};
export type EmployeeTimesheet=AttendanceTotals&{employeeId:string;employeeName:string;position:string;projects:string[];hasAttendance:boolean};
export type ProjectTimesheet=AttendanceTotals&{projectId:string;projectName:string};

const round=(value:number)=>Math.round(value*100)/100;
const emptyTotals=():AttendanceTotals=>({daysWorked:0,regularHours:0,overtimeHours:0,totalHours:0,sickLeaveDays:0,vacationDays:0,absenceDays:0,dayOffDays:0,businessTripDays:0,otherStatusDays:0});

function addEntry(totals:AttendanceTotals,entry:TimeEntry){
  if(entry.status==="Worked")totals.daysWorked++;
  else if(entry.status==="Sick leave")totals.sickLeaveDays++;
  else if(entry.status==="Vacation")totals.vacationDays++;
  else if(entry.status==="Absent")totals.absenceDays++;
  else if(entry.status==="Day off")totals.dayOffDays++;
  else if(entry.status==="Business trip / other project")totals.businessTripDays++;
  else totals.otherStatusDays++;
  totals.regularHours=round(totals.regularHours+entry.regularHours);
  totals.overtimeHours=round(totals.overtimeHours+entry.overtimeHours);
  totals.totalHours=round(totals.regularHours+totals.overtimeHours);
}

export function aggregateTimesheets(entries:TimeEntry[]):EmployeeTimesheet[]{
  const rows=new Map<string,EmployeeTimesheet>();
  for(const entry of entries){const row=rows.get(entry.employeeId)??{employeeId:entry.employeeId,employeeName:entry.employeeName,position:entry.position,projects:[],hasAttendance:true,...emptyTotals()};if(!row.projects.includes(entry.projectName))row.projects.push(entry.projectName);addEntry(row,entry);rows.set(entry.employeeId,row);}
  return [...rows.values()].sort((a,b)=>a.employeeName.localeCompare(b.employeeName));
}

export function aggregateProjectTimesheets(entries:TimeEntry[]):ProjectTimesheet[]{
  const rows=new Map<string,ProjectTimesheet>();
  for(const entry of entries){const row=rows.get(entry.projectId)??{projectId:entry.projectId,projectName:entry.projectName,...emptyTotals()};addEntry(row,entry);rows.set(entry.projectId,row);}
  return [...rows.values()].sort((a,b)=>a.projectName.localeCompare(b.projectName));
}

export function aggregateOverall(entries:TimeEntry[]):AttendanceTotals{const totals=emptyTotals();for(const entry of entries)addEntry(totals,entry);return totals;}
export function filterTimesheetEntries(entries:TimeEntry[],projectId="",employeeId=""){return entries.filter((entry)=>(!projectId||entry.projectId===projectId)&&(!employeeId||entry.employeeId===employeeId));}

export function suspiciousEntries(entries:TimeEntry[],threshold=16){const grouped=new Map<string,{employeeId:string;employeeName:string;date:string;projects:Set<string>;totalHours:number}>();for(const entry of entries){const key=`${entry.employeeId}:${entry.date}`;const row=grouped.get(key)??{employeeId:entry.employeeId,employeeName:entry.employeeName,date:entry.date,projects:new Set<string>(),totalHours:0};row.projects.add(entry.projectId);row.totalHours=round(row.totalHours+entry.regularHours+entry.overtimeHours);grouped.set(key,row);}return[...grouped.values()].filter((row)=>row.projects.size>1||row.totalHours>threshold).map((row)=>({...row,projectCount:row.projects.size,projects:undefined}));}

export type ExportLabels={employee:string;position:string;date:string;project:string;projects:string;status:string;regular:string;overtime:string;total:string;comment:string;report:string;daysWorked:string;sick:string;vacation:string;absent:string;dayOff:string;businessTrip:string;other:string;monthlySummary:string;dailyDetails:string;projectSummary:string};
export const englishExportLabels:ExportLabels={employee:"Employee",position:"Position / trade",date:"Date",project:"Project",projects:"Project(s)",status:"Attendance status",regular:"Regular hours",overtime:"Overtime hours",total:"Total hours",comment:"Comment",report:"Daily Report reference",daysWorked:"Days worked",sick:"Sick leave days",vacation:"Vacation days",absent:"Absent days",dayOff:"Day off days",businessTrip:"Business trip / other project days",other:"Other days",monthlySummary:"Monthly Summary",dailyDetails:"Daily Details",projectSummary:"Project Summary"};

function csvCell(value:string|number){const text=String(value);return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
export function attendanceCsv(entries:TimeEntry[],labels:ExportLabels=englishExportLabels){const header=[labels.employee,labels.position,labels.date,labels.project,labels.status,labels.regular,labels.overtime,labels.total,labels.comment,labels.report];const rows=entries.map((entry)=>[entry.employeeName,entry.position,entry.date,entry.projectName,entry.status,entry.regularHours,entry.overtimeHours,round(entry.regularHours+entry.overtimeHours),entry.comment,`#${entry.reportId}`]);return `\uFEFF${[header,...rows].map((row)=>row.map(csvCell).join(",")).join("\r\n")}\r\n`;}

const xml=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function columnName(index:number){let name="";for(let value=index+1;value;value=Math.floor((value-1)/26))name=String.fromCharCode(65+(value-1)%26)+name;return name;}
function sheetXml(rows:(string|number)[][]){const body=rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,columnIndex)=>{const ref=`${columnName(columnIndex)}${rowIndex+1}`;return typeof value==="number"?`<c r="${ref}"${rowIndex===0?' s="1"':""}><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"${rowIndex===0?' s="1"':""}><is><t>${xml(value)}</t></is></c>`;}).join("")}</row>`).join("");return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData><autoFilter ref="A1:${columnName(Math.max(0,(rows[0]?.length??1)-1))}${Math.max(1,rows.length)}"/></worksheet>`;}

export function timesheetWorkbook(entries:TimeEntry[],labels:ExportLabels=englishExportLabels):Uint8Array{
  const summary=aggregateTimesheets(entries),projects=aggregateProjectTimesheets(entries);
  const summaryRows:(string|number)[][]=[[labels.employee,labels.position,labels.projects,labels.daysWorked,labels.regular,labels.overtime,labels.total,labels.sick,labels.vacation,labels.absent,labels.dayOff,labels.businessTrip,labels.other],...summary.map((row)=>[row.employeeName,row.position,row.projects.join(", "),row.daysWorked,row.regularHours,row.overtimeHours,row.totalHours,row.sickLeaveDays,row.vacationDays,row.absenceDays,row.dayOffDays,row.businessTripDays,row.otherStatusDays])];
  const detailRows:(string|number)[][]=[[labels.date,labels.employee,labels.position,labels.project,labels.status,labels.regular,labels.overtime,labels.total,labels.comment,labels.report],...entries.map((entry)=>[entry.date,entry.employeeName,entry.position,entry.projectName,entry.status,entry.regularHours,entry.overtimeHours,round(entry.regularHours+entry.overtimeHours),entry.comment,`#${entry.reportId}`])];
  const projectRows:(string|number)[][]=[[labels.project,labels.daysWorked,labels.regular,labels.overtime,labels.total,labels.sick,labels.vacation,labels.absent,labels.dayOff,labels.businessTrip,labels.other],...projects.map((row)=>[row.projectName,row.daysWorked,row.regularHours,row.overtimeHours,row.totalHours,row.sickLeaveDays,row.vacationDays,row.absenceDays,row.dayOffDays,row.businessTripDays,row.otherStatusDays])];
  const files:Record<string,Uint8Array>={
    "[Content_Types].xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(labels.monthlySummary)}" sheetId="1" r:id="rId1"/><sheet name="${xml(labels.dailyDetails)}" sheetId="2" r:id="rId2"/><sheet name="${xml(labels.projectSummary)}" sheetId="3" r:id="rId3"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`),
    "xl/worksheets/sheet1.xml":strToU8(sheetXml(summaryRows)),"xl/worksheets/sheet2.xml":strToU8(sheetXml(detailRows)),"xl/worksheets/sheet3.xml":strToU8(sheetXml(projectRows))};
  return zipSync(files,{level:6});
}

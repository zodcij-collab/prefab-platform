import test from "node:test";
import assert from "node:assert/strict";
import {strFromU8,unzipSync} from "fflate";
import {aggregateOverall,aggregateTimesheets,attendanceCsv,computeColumnWidths,filterTimesheetEntries,suspiciousEntries,timesheetWorkbook,type TimeEntry} from "../lib/timesheets.ts";
import {canLinkReportMedia,isAuthorizedExportProject,isTimesheetPeriodEditable} from "../lib/timesheet-policy.ts";
import {portalText} from "../data/portal-i18n.ts";

const entries:TimeEntry[]=[
  {employeeId:"andris",employeeName:"Andris Krūmiņš",position:"Rigger",projectId:"p1",projectName:"Sprint 7 test",date:"2026-08-03",status:"Worked",regularHours:8,overtimeHours:0,comment:"",reportId:1},
  {employeeId:"janis",employeeName:"Jānis Bērziņš",position:"Welder",projectId:"p1",projectName:"Sprint 7 test",date:"2026-08-03",status:"Sick leave",regularHours:0,overtimeHours:0,comment:"",reportId:1},
  {employeeId:"tester",employeeName:"Test Montētājs",position:"Precast Installer",projectId:"p1",projectName:"Sprint 7 test",date:"2026-08-03",status:"Worked",regularHours:6,overtimeHours:2,comment:"Монтаж",reportId:1},
  {employeeId:"vacation",employeeName:"Vacation Worker",position:"Other",projectId:"p2",projectName:"Other project",date:"2026-08-04",status:"Vacation",regularHours:0,overtimeHours:0,comment:"",reportId:2},
  {employeeId:"absent",employeeName:"Absent Worker",position:"Other",projectId:"p2",projectName:"Other project",date:"2026-08-04",status:"Absent",regularHours:0,overtimeHours:0,comment:"",reportId:2},
  {employeeId:"dayoff",employeeName:"Day Off Worker",position:"Other",projectId:"p2",projectName:"Other project",date:"2026-08-04",status:"Day off",regularHours:0,overtimeHours:0,comment:"",reportId:2},
  {employeeId:"trip",employeeName:"Trip Worker",position:"Other",projectId:"p2",projectName:"Other project",date:"2026-08-04",status:"Business trip / other project",regularHours:0,overtimeHours:0,comment:"",reportId:2},
  {employeeId:"other",employeeName:"Other Worker",position:"Other",projectId:"p2",projectName:"Other project",date:"2026-08-04",status:"Other",regularHours:0,overtimeHours:0,comment:"",reportId:2},
];

test("monthly aggregation separates working hours and every non-working status",()=>{const rows=aggregateTimesheets(entries);const andris=rows.find((row)=>row.employeeId==="andris")!,janis=rows.find((row)=>row.employeeId==="janis")!;assert.equal(andris.daysWorked,1);assert.equal(andris.totalHours,8);assert.equal(janis.daysWorked,0);assert.equal(janis.totalHours,0);assert.equal(janis.sickLeaveDays,1);assert.equal(rows.find((row)=>row.employeeId==="vacation")?.vacationDays,1);assert.equal(rows.find((row)=>row.employeeId==="absent")?.absenceDays,1);assert.equal(rows.find((row)=>row.employeeId==="dayoff")?.dayOffDays,1);assert.equal(rows.find((row)=>row.employeeId==="trip")?.businessTripDays,1);assert.equal(rows.find((row)=>row.employeeId==="other")?.otherStatusDays,1);});
test("accepted Sprint 10 scenario totals are 14 regular, 2 overtime and 16 total",()=>{const filtered=filterTimesheetEntries(entries,"p1","");assert.deepEqual(aggregateOverall(filtered),{daysWorked:2,regularHours:14,overtimeHours:2,totalHours:16,sickLeaveDays:1,vacationDays:0,absenceDays:0,dayOffDays:0,businessTripDays:0,otherStatusDays:0});});
test("CSV and XLSX use the identical filtered source rows and totals",()=>{const filtered=filterTimesheetEntries(entries,"p1","tester"),csv=attendanceCsv(filtered),xlsx=unzipSync(timesheetWorkbook(filtered)),summary=strFromU8(xlsx["xl/worksheets/sheet1.xml"]),details=strFromU8(xlsx["xl/worksheets/sheet2.xml"]);assert.equal(filtered.length,1);assert.match(csv,/Test Montētājs/);assert.doesNotMatch(csv,/Andris Krūmiņš/);assert.match(summary,/Test Montētājs/);assert.match(summary,/>6</);assert.match(summary,/>2</);assert.match(summary,/>8</);assert.match(details,/Монтаж/);assert.match(details,/#1/);assert.doesNotMatch(details,/Andris Krūmiņš/);});
test("XLSX is a real Unicode workbook with three accounting sheets",()=>{const files=unzipSync(timesheetWorkbook(entries));assert.ok(files["[Content_Types].xml"]);const workbook=strFromU8(files["xl/workbook.xml"]);assert.match(workbook,/Monthly Summary/);assert.match(workbook,/Daily Details/);assert.match(workbook,/Project Summary/);assert.match(strFromU8(files["xl/worksheets/sheet1.xml"]),/Jānis Bērziņš/);});
test("CSV contains audit columns and Unicode values",()=>{const csv=attendanceCsv(entries);assert.ok(csv.startsWith("\uFEFFEmployee"));assert.match(csv,/Attendance status/);assert.match(csv,/Daily Report reference/);assert.match(csv,/Jānis Bērziņš/);assert.match(csv,/Монтаж/);});
test("unauthorized export projects and media linkage are rejected by policy",()=>{assert.equal(isAuthorizedExportProject("p1",["p1"]),true);assert.equal(isAuthorizedExportProject("p2",["p1"]),false);assert.equal(canLinkReportMedia("p1",["p1"]),true);assert.equal(canLinkReportMedia("p2",["p1"]),false);});
test("closed periods reject attendance edits",()=>{assert.equal(isTimesheetPeriodEditable("Open"),true);assert.equal(isTimesheetPeriodEditable("Reviewed"),true);assert.equal(isTimesheetPeriodEditable("Closed"),false);});
test("suspicious duplicate or high combined hours remain review warnings",()=>{const duplicate=[...entries,{...entries[0],projectId:"p2",projectName:"Other project",regularHours:9,reportId:2}];const warnings=suspiciousEntries(duplicate);assert.equal(warnings.find((warning)=>warning.employeeId==="andris")?.projectCount,2);assert.equal(warnings.find((warning)=>warning.employeeId==="andris")?.totalHours,17);});
test("Sprint 10.1 labels are localized",()=>{assert.equal(portalText("lv","Sick leave days"),"Slimības dienas");assert.equal(portalText("ru","Photos / Attachments"),"Фотографии / вложения");assert.equal(portalText("lv","Export XLSX"),"Eksportēt XLSX");assert.equal(portalText("lv","Download PDF"),"Lejupielādēt PDF");assert.equal(portalText("ru","Export / Share"),"Экспорт / поделиться");assert.match(portalText("lv","Daily Report e-mail subject"),/^PREFAB\.LV — Dienas atskaite/);assert.match(portalText("ru","PDF downloaded. Attach it manually to the e-mail draft before sending."),/вручную/);assert.match(portalText("lv","Printing was blocked. Open the printable PDF and use the viewer Print control."),/bloķēja/);assert.equal(portalText("lv","Print now"),"Drukāt tagad");assert.equal(portalText("ru","Back to report"),"Назад к отчёту");});
test("XLSX column widths fit content, never clip headers and stay within sane bounds",()=>{
  const rows=[["Employee","Attendance status","Comment"],["A very long employee name here","Business trip / other project","short"],["B",8,"a comment that is considerably longer than its header to force a wider column here"]];
  const widths=computeColumnWidths(rows);
  assert.equal(widths.length,3);
  for(let column=0;column<widths.length;column++){const longest=Math.max(...rows.map((row)=>String(row[column]??"").length));assert.ok(widths[column]>=Math.min(48,longest+2)-0.001);assert.ok(widths[column]>=10&&widths[column]<=48);}
});
test("generated workbook embeds column widths and a frozen header for readability",()=>{
  const workbook=timesheetWorkbook(entries);const files=unzipSync(workbook);const sheet=strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet,/<cols>/);assert.match(sheet,/customWidth="1"/);assert.match(sheet,/state="frozen"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {canDeleteDraftForUser,canDeleteReportStatus,deleteDraftReportRecords} from "../lib/report-lifecycle.ts";

function fixture(status="Draft"){
  const db=new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE reports(id INTEGER PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE daily_report_elements(report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,element_id INTEGER);
    CREATE TABLE attendance_entries(id INTEGER PRIMARY KEY,report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE);
    CREATE TABLE project_photos(id INTEGER PRIMARY KEY,report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL);
    CREATE TABLE project_elements(id INTEGER PRIMARY KEY,status TEXT,installed_report_id INTEGER);
    INSERT INTO reports VALUES(1,'${status}');
    INSERT INTO daily_report_elements VALUES(1,10);
    INSERT INTO attendance_entries(report_id) VALUES(1);
    INSERT INTO project_photos(report_id) VALUES(1);
    INSERT INTO project_elements VALUES(10,'Planned',NULL);`);
  return db;
}

test("authorized roles can delete drafts but employees cannot",()=>{
  assert.equal(canDeleteDraftForUser({role:"Director",userId:1,reporterUserId:2}),true);
  assert.equal(canDeleteDraftForUser({role:"Administrator",userId:1,reporterUserId:2}),true);
  assert.equal(canDeleteDraftForUser({role:"Project Manager",userId:1,reporterUserId:2}),true);
  assert.equal(canDeleteDraftForUser({role:"Foreman",userId:1,reporterUserId:1}),true);
  assert.equal(canDeleteDraftForUser({role:"Foreman",userId:1,reporterUserId:2}),false);
  assert.equal(canDeleteDraftForUser({role:"Employee",userId:1,reporterUserId:1}),false);
});

test("Draft deletion cascades draft children, detaches media, and does not alter elements",()=>{
  const db=fixture();
  db.exec("BEGIN IMMEDIATE");
  assert.equal(deleteDraftReportRecords(db,1),1);
  db.exec("COMMIT");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reports").get()!.count,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM daily_report_elements").get()!.count,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM attendance_entries").get()!.count,0);
  assert.equal(db.prepare("SELECT report_id AS reportId FROM project_photos").get()!.reportId,null);
  const element=db.prepare("SELECT status,installed_report_id AS installedReportId FROM project_elements").get() as {status:string;installedReportId:number|null};
  assert.equal(element.status,"Planned");
  assert.equal(element.installedReportId,null);
});

for(const status of ["Submitted","Approved"]){
  test(`${status} reports cannot be deleted`,()=>{const db=fixture(status);assert.equal(canDeleteReportStatus(status),false);assert.equal(deleteDraftReportRecords(db,1),0);assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reports").get()!.count,1);});
}

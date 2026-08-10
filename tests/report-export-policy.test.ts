import test from "node:test";
import assert from "node:assert/strict";
import {canExportReportArchive} from "../lib/report-export-policy.ts";

test("monthly report archive remains project scoped",()=>{
  assert.equal(canExportReportArchive("p1",["p1","p2"]),true);
  assert.equal(canExportReportArchive("p3",["p1","p2"]),false);
});

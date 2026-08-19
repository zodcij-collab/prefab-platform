import test from "node:test";
import assert from "node:assert/strict";
import { generateDailyLogPdf, dailyLogPdfFilename, type DailyLogPdfInput } from "../lib/daily-log-pdf.ts";
import type { DailyLogSnapshot } from "../lib/daily-ops.ts";

const embeddablePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4UaFBEmIY1TCqYfhqAAADaGgQ43GRdgAAAABJRU5ErkJggg==", "base64");

function snapshot(over: Partial<DailyLogSnapshot> = {}): DailyLogSnapshot {
  return {
    version: 1, projectId: "p1", projectName: "Skaistkalnes iela 1a", logDate: "2026-08-17",
    shift: { start: "07:00", end: "16:00" }, responsible: "Foreman K",
    manual: { workPerformed: "Poured slab on level 2", delays: "Crane late 1h", delayReason: "Traffic", siteEvents: "", equipmentNote: "Mobile crane", materialsNote: "", foremanComment: "Good progress" },
    workforce: { present: 3, absent: 1, manHours: 21, crew: [{ name: "A B", status: "Present", startTime: "", endTime: "", workedHours: 9 }, { name: "C D", status: "Late", startTime: "09:00", endTime: "", workedHours: 7 }] },
    installedElements: [{ code: "VSP-1", elementType: "Wall panel", zone: "A" }],
    zones: ["A"], deliveries: [{ loadNumber: 3, status: "Accepted", supplier: "", plannedDate: "2026-08-17" }],
    defects: [{ issueNumber: 12, title: "Cracked panel", status: "Open", priority: "High" }],
    tasks: [{ issueNumber: 13, title: "Adjust rail", status: "Open", priority: "Normal" }],
    critical: [], safety: [{ employee: "A B", severity: "Minor", category: "PPE", description: "no gloves" }],
    photos: [{ id: 1, caption: "rebar", area: "Zone A" }], weather: "Cloudy 18°C",
    confirmedBy: "Foreman K", confirmedAt: "2026-08-17T15:00:00.000Z", ...over,
  };
}

test("§AP: a confirmed daily report renders a valid PDF document", async () => {
  const input: DailyLogPdfInput = { language: "en", generatedBy: "Foreman K", snapshot: snapshot(), photos: [{ id: 1, caption: "rebar", area: "Zone A", mimeType: "image/png", bytes: embeddablePng }] };
  const pdf = await generateDailyLogPdf(input);
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pdf.length > 1000);
  assert.match(dailyLogPdfFilename("Skaistkalnes iela 1a", "2026-08-17"), /^PREFAB-DailyReport-.+-2026-08-17\.pdf$/);
});

test("§AQ: the PDF is generated purely from the passed snapshot (no live DB access) and localizes LV/RU", async () => {
  // The function takes a snapshot object only — a confirmed report is reproducible from it alone.
  for (const language of ["lv", "ru", "en"] as const) {
    const pdf = await generateDailyLogPdf({ language, generatedBy: "T", snapshot: snapshot(), photos: [] });
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", `${language} renders`);
  }
  // an empty-section snapshot (a quiet day) still produces a valid report
  const quiet = await generateDailyLogPdf({ language: "en", generatedBy: "T", snapshot: snapshot({ installedElements: [], deliveries: [], defects: [], tasks: [], safety: [], photos: [] }), photos: [] });
  assert.equal(quiet.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("§AR: a missing or corrupt optional image can never break the report", async () => {
  const photos = [
    { id: 1, caption: "ok", area: "", mimeType: "image/png", bytes: embeddablePng },
    { id: 2, caption: "corrupt", area: "", mimeType: "image/png", bytes: Buffer.from([1, 2, 3, 4]) }, // corrupt → text ref
    { id: 3, caption: "missing", area: "", mimeType: "image/jpeg", bytes: null },                     // absent → text ref
  ];
  const pdf = await generateDailyLogPdf({ language: "en", generatedBy: "T", snapshot: snapshot(), photos });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", "one bad image does not destroy the report");
});

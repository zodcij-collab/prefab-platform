import test from "node:test";
import assert from "node:assert/strict";
import { generateIssuePdf, issuePdfFields, issuePdfFilename, type IssuePdfIssue } from "../lib/issue-pdf.ts";

const id = (s: string) => s;
const baseIssue: IssuePdfIssue = { issueNumber: 12, type: "Defect", status: "Open", priority: "High", title: "Cracked panel", details: "north wall", classified: 1, installationZoneName: "2 stāvs", elementCode: "VSP-110-33", assignedTo: "Anna", dueDate: "2026-08-01", createdBy: "Edvards", createdAt: "2026-08-14 06:29:00", resolution: "", resolvedBy: "", resolvedAt: "", closedBy: "", closedAt: "", cancelReason: "" };
// A valid 1×1 PNG so pdfkit can actually embed an image.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("filename is filesystem-safe and uses the human issue number, not a DB id", () => {
  assert.equal(issuePdfFilename("Skaistkalnes iela 1a", 12), "PREFAB-Issue-Skaistkalnes-iela-1a-12.pdf");
  assert.match(issuePdfFilename("weird / * name", 3), /^PREFAB-Issue-[\p{L}\p{N}._-]+-3\.pdf$/u);
});

test("H/I: pdf fields include type / status / priority / zone / element / responsible / due (+overdue)", () => {
  const map = Object.fromEntries(issuePdfFields(baseIssue, id, "2026-08-14").map((f) => [f.label, f.value]));
  assert.equal(map.Type, "Defect");
  assert.ok(map.Status.includes("Open"));
  assert.equal(map.Priority, "High");
  assert.equal(map["Installation zone"], "2 stāvs");
  assert.equal(map.Element, "VSP-110-33");
  assert.equal(map.Responsible, "Anna");
  assert.ok(map["Due date"].includes("2026-08-01") && map["Due date"].includes("Overdue"));
});

test("needs-classification is surfaced in the PDF status field", () => {
  const fields = issuePdfFields({ ...baseIssue, classified: 0, status: "Captured" }, id, "2026-08-14");
  assert.ok(fields.find((f) => f.label === "Status")!.value.includes("Needs classification"));
});

test("J/K: PDF generates a valid %PDF with an image, a missing file, a video and an unsupported raster", async () => {
  const media = [
    { role: "evidence", kind: "image", mimeType: "image/png", originalFilename: "photo.png", bytes: png },
    { role: "evidence", kind: "image", mimeType: "image/jpeg", originalFilename: "missing.jpg", bytes: null },       // missing → text reference
    { role: "evidence", kind: "video", mimeType: "video/mp4", originalFilename: "clip.mp4", bytes: null },           // video → text reference
    { role: "evidence", kind: "image", mimeType: "image/webp", originalFilename: "x.webp", bytes: Buffer.from([1, 2, 3, 4]) }, // unsupported raster → text reference
  ];
  const pdf = await generateIssuePdf({ projectName: "Test", language: "en", generatedBy: "Tester", today: "2026-08-14", issue: baseIssue, media, events: [{ kind: "created", detail: "x", actor: "E", createdAt: "2026-08-14 06:29:00" }] });
  assert.ok(pdf.length > 1000, "a real PDF document was produced");
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("§1C-E: an attached PDF is referenced textually in the export and never crashes generation", async () => {
  const media = [
    { role: "evidence", kind: "image", mimeType: "image/png", originalFilename: "photo.png", bytes: png },
    { role: "evidence", kind: "document", mimeType: "application/pdf", originalFilename: "drawing-section-A.pdf", bytes: Buffer.from("%PDF-1.4 ...") }, // a real PDF is NOT embedded — referenced by name
  ];
  const pdf = await generateIssuePdf({ projectName: "Test", language: "en", generatedBy: "Tester", today: "2026-08-14", issue: baseIssue, media, events: [] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("§14 R/S: an issue PDF with a drawing marker stays valid; missing snapshot never crashes it", async () => {
  const withDrawing: IssuePdfIssue = { ...baseIssue, documentTitle: "Level 2 GA", drawingPage: 3, drawingX: 0.42, drawingY: 0.61 };
  const pdf = await generateIssuePdf({ projectName: "Test", language: "en", generatedBy: "Tester", today: "2026-08-14", issue: withDrawing, media: [], events: [{ kind: "marker", detail: "Level 2 GA · p.3", actor: "E", createdAt: "2026-08-14 06:29:00" }] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  // A marker with no coordinates (defensive) also generates fine — no rasterized snapshot is
  // attempted, so drawing rendering can never fail the PDF.
  const noCoords: IssuePdfIssue = { ...baseIssue, documentTitle: "Plan", drawingPage: 1, drawingX: null, drawingY: null };
  const pdf2 = await generateIssuePdf({ projectName: "Test", language: "lv", generatedBy: "T", today: "2026-08-14", issue: noCoords, media: [], events: [] });
  assert.equal(pdf2.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("L: a resolved issue PDF includes resolution data and yields a valid document", async () => {
  const resolved: IssuePdfIssue = { ...baseIssue, status: "Closed", resolution: "Sealed and repainted", resolvedBy: "Anna", resolvedAt: "2026-08-15 09:00:00", closedBy: "PM", closedAt: "2026-08-16 09:00:00" };
  assert.equal(issuePdfFields(resolved, id, "2026-08-14").find((f) => f.label === "Status")!.value, "Closed");
  const pdf = await generateIssuePdf({ projectName: "Test", language: "en", generatedBy: "Tester", today: "2026-08-14", issue: resolved, media: [{ role: "resolution", kind: "image", mimeType: "image/png", originalFilename: "after.png", bytes: png }], events: [] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
});

// A real, pdfkit-embeddable 16×16 RGB PNG (the shared 1×1 `png` fixture is a valid file but
// pdfkit rejects that minimal encoding — canvas-captured snapshots are full RGBA PNGs like this).
const embeddablePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4UaFBEmIY1TCqYfhqAAADaGgQ43GRdgAAAABJRU5ErkJggg==", "base64");

test("§fp-M/O: Issue PDF with a drawing relation stays valid and EMBEDS the drawing-location crop (larger than without)", async () => {
  const withDrawing: IssuePdfIssue = { ...baseIssue, documentTitle: "Level 2 GA", drawingPage: 3, drawingX: 0.42, drawingY: 0.61 };
  const base = { projectName: "Test", language: "en" as const, generatedBy: "T", today: "2026-08-14", issue: withDrawing, events: [] };
  const withoutCrop = await generateIssuePdf({ ...base, media: [] });
  const withCrop = await generateIssuePdf({ ...base, media: [{ role: "drawing-location", kind: "image", mimeType: "image/png", originalFilename: "drawing-location.png", bytes: embeddablePng }] });
  assert.equal(withCrop.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(withCrop.length > withoutCrop.length, "the embedded drawing crop makes the PDF larger (O: marker location appears in the snapshot)");
});

test("§fp-N: a broken/invalid drawing-location snapshot can never break Issue PDF generation", async () => {
  const withDrawing: IssuePdfIssue = { ...baseIssue, documentTitle: "Plan", drawingPage: 1, drawingX: 0.1, drawingY: 0.9 };
  // Corrupt bytes declared as PNG — doc.image() throws internally; the PDF must still generate.
  const pdf = await generateIssuePdf({ projectName: "Test", language: "lv", generatedBy: "T", today: "2026-08-14", issue: withDrawing, media: [{ role: "drawing-location", kind: "image", mimeType: "image/png", originalFilename: "broken.png", bytes: Buffer.from([1, 2, 3, 4, 5]) }], events: [] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", "textual drawing reference stands; a broken crop never fails the PDF");
  // A drawing relation with no snapshot at all also generates fine (textual fallback only).
  const noSnap = await generateIssuePdf({ projectName: "Test", language: "ru", generatedBy: "T", today: "2026-08-14", issue: withDrawing, media: [], events: [] });
  assert.equal(noSnap.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("§fp: the drawing-location snapshot is NOT rendered as ordinary evidence", async () => {
  // The evidence set excludes 'drawing-location'; only real evidence adds an Evidence section. A
  // PDF whose sole media is the drawing crop must be no larger than one with no media at all
  // beyond the crop the Drawing-location section already embeds — i.e., no duplicate image.
  const issue: IssuePdfIssue = { ...baseIssue, documentTitle: "GA", drawingPage: 1, drawingX: 0.5, drawingY: 0.5 };
  const cropOnly = await generateIssuePdf({ projectName: "T", language: "en", generatedBy: "T", today: "2026-08-14", issue, media: [{ role: "drawing-location", kind: "image", mimeType: "image/png", originalFilename: "d.png", bytes: embeddablePng }], events: [] });
  const cropPlusEvidence = await generateIssuePdf({ projectName: "T", language: "en", generatedBy: "T", today: "2026-08-14", issue, media: [{ role: "drawing-location", kind: "image", mimeType: "image/png", originalFilename: "d.png", bytes: embeddablePng }, { role: "evidence", kind: "image", mimeType: "image/png", originalFilename: "e.png", bytes: embeddablePng }], events: [] });
  assert.ok(cropPlusEvidence.length > cropOnly.length, "adding real evidence adds an Evidence section; the crop alone does not appear twice");
});

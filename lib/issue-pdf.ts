import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { PortalLanguage } from "../data/portal-i18n.ts";
import { portalText } from "../data/portal-i18n.ts";
import { formatAppDateTime } from "./datetime.ts";
import { isOverdue, markerZoneKey } from "./issues.ts";

const ORANGE = "#f26522", INK = "#171717", MUTED = "#686868", LINE = "#d8d8d8", PAPER = "#ffffff", ZEBRA = "#f5f5f3";
const regularFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf");
const boldFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf");

export type IssuePdfIssue = {
  issueNumber: number; type: string; status: string; priority: string; title: string; details: string; classified: number;
  installationZoneName: string; elementCode: string; assignedTo: string; dueDate: string;
  createdBy: string; createdAt: string; resolution: string; resolvedBy: string; resolvedAt: string; closedBy: string; closedAt: string; cancelReason: string;
  documentTitle?: string; drawingPage?: number | null; drawingX?: number | null; drawingY?: number | null;
};
// bytes present + an embeddable raster type → embedded; otherwise rendered as a text reference.
export type IssuePdfMedia = { role: string; kind: string; mimeType: string; originalFilename: string; bytes: Buffer | null };
export type IssuePdfEvent = { kind: string; detail: string; actor: string; createdAt: string };
export type IssuePdfInput = { projectName: string; language: PortalLanguage; generatedBy: string; today: string; issue: IssuePdfIssue; media: IssuePdfMedia[]; events: IssuePdfEvent[] };

const EVENT_LABEL: Record<string, string> = { created: "Captured", classified: "Classified", assigned: "Assignment changed", status: "Status changed", priority: "Priority changed", due: "Due date changed", media: "Media added", marker: "Marker added", marker_changed: "Marker moved", marker_removed: "Marker removed", comment: "Comment", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" };

export function issuePdfFilename(projectName: string, issueNumber: number) {
  const slug = projectName.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100).replace(/^-+|-+$/g, "");
  return `PREFAB-Issue-${slug || "project"}-${issueNumber}.pdf`;
}

// The ordered header field rows the PDF renders — extracted so content is unit-testable
// without decoding glyph-encoded PDF text.
export function issuePdfFields(issue: IssuePdfIssue, t: (v: string) => string, today: string): Array<{ label: string; value: string }> {
  const overdue = isOverdue(issue.dueDate, issue.status, today);
  return [
    { label: t("Type"), value: t(issue.type) },
    { label: t("Status"), value: t(issue.status) + (issue.classified !== 1 ? ` · ${t("Needs classification")}` : "") },
    { label: t("Priority"), value: t(issue.priority) },
    { label: t("Captured by"), value: `${issue.createdBy} · ${formatAppDateTime(issue.createdAt)}` },
    { label: t("Responsible"), value: issue.assignedTo || t("Unassigned") },
    { label: t("Installation zone"), value: issue.installationZoneName || "—" },
    { label: t("Element"), value: issue.elementCode || "—" },
    { label: t("Due date"), value: (issue.dueDate || "—") + (overdue ? ` · ${t("Overdue")}` : "") },
  ];
}

export async function generateIssuePdf(input: IssuePdfInput): Promise<Buffer> {
  const t = (v: string) => portalText(input.language, v), generatedAt = new Date().toISOString();
  const { issue } = input;
  const doc = new PDFDocument({ size: "A4", margins: { top: 54, bottom: 46, left: 40, right: 40 }, bufferPages: true, info: { Title: `${t("Issue")} #${issue.issueNumber} - ${input.projectName}`, Author: input.generatedBy || "PREFAB.LV", Subject: input.projectName, Creator: "PREFAB.LV" } });
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.registerFont("Regular", regularFont).registerFont("Bold", boldFont);
  const font = (bold = false) => doc.font(bold ? "Bold" : "Regular");
  const left = 40, right = doc.page.width - 40, contentWidth = right - left, bottom = doc.page.height - 46;
  const ensure = (h: number) => { if (doc.y + h > bottom) doc.addPage(); };
  const heading = (text: string) => { ensure(24); doc.moveDown(0.4); font(true).fontSize(9).fillColor(ORANGE).text(text.toUpperCase(), left, doc.y); doc.fillColor(ORANGE).rect(left, doc.y + 1, contentWidth, 1).fill(); doc.y += 6; };

  const addHeader = () => { font(true).fontSize(9).fillColor(INK).text("PREFAB.", 40, 20, { continued: true, lineBreak: false }); font(true).fillColor(ORANGE).text("LV", { lineBreak: false }); doc.fillColor(ORANGE).rect(40, 39, right - 40, 1.5).fill(); };
  doc.on("pageAdded", () => { addHeader(); doc.y = 52; });
  addHeader();

  doc.y = 54; font(true).fontSize(18).fillColor(INK).text(`${t("Issue")} #${issue.issueNumber}`, left, 54, { width: contentWidth - 200 });
  font(true).fontSize(12).fillColor(ORANGE).text(input.projectName, left, 80, { width: contentWidth - 200 });
  font(false).fontSize(8).fillColor(MUTED).text(`${t("Generated")}: ${formatAppDateTime(generatedAt)} · ${t("Author")}: ${input.generatedBy || "—"}`, right - 240, 58, { width: 240, align: "right" });
  doc.y = 104;

  // Issue data fields.
  heading(t("Details"));
  font(false).fontSize(9);
  for (const row of issuePdfFields(issue, t, input.today)) {
    ensure(15); const y = doc.y;
    font(true).fillColor(MUTED).fontSize(8).text(row.label.toUpperCase(), left, y + 1, { width: 140, lineBreak: false });
    font(false).fillColor(INK).fontSize(9).text(row.value, left + 145, y, { width: contentWidth - 145 });
    doc.y = Math.max(doc.y, y + 14);
  }

  ensure(24); doc.moveDown(0.3); font(true).fontSize(12).fillColor(INK).text(issue.title || t("Capture"), left, doc.y, { width: contentWidth });
  if (issue.details) { font(false).fontSize(10).fillColor(INK).text(issue.details, left, doc.y + 2, { width: contentWidth }); }

  // Drawing location — a human-useful reference: the drawing name, page, an approximate
  // relative position (NOT raw normalized coordinates), and — when available — a rasterized
  // crop of the drawing around the marker (captured client-side at placement and stored as a
  // 'drawing-location' image). The raw x/y stay internal/authoritative but are never shown.
  // This section can never fail PDF generation: a missing/broken snapshot falls back to text.
  if (issue.documentTitle && issue.drawingPage) {
    heading(t("Drawing location"));
    const position = (typeof issue.drawingX === "number" && typeof issue.drawingY === "number")
      ? ` · ${t("Approx. position")}: ${t(markerZoneKey(issue.drawingX, issue.drawingY))}` : "";
    font(false).fontSize(10).fillColor(INK).text(`${issue.documentTitle} · ${t("Page")} ${issue.drawingPage}${position}`, left, doc.y, { width: contentWidth });
    const snapshot = input.media.find((m) => m.role === "drawing-location" && m.bytes && (m.mimeType === "image/png" || m.mimeType === "image/jpeg"));
    if (snapshot) {
      ensure(230); doc.y += 4;
      try { doc.image(snapshot.bytes as Buffer, left, doc.y, { fit: [contentWidth, 220], align: "center" }); doc.y += 226; }
      catch { /* a broken snapshot never fails the PDF — the textual reference above stands */ }
    }
  }

  const renderMedia = (list: IssuePdfMedia[]) => {
    for (const item of list) {
      const embeddable = item.bytes && (item.mimeType === "image/jpeg" || item.mimeType === "image/png");
      if (embeddable) {
        ensure(210);
        try { doc.image(item.bytes as Buffer, left, doc.y, { fit: [contentWidth, 200], align: "center" }); doc.y += 206; }
        catch { font(false).fontSize(9).fillColor(MUTED).text(`${t("Attachment")}: ${item.originalFilename}`, left, doc.y); doc.y += 14; }
      } else {
        // A complete PDF/video/unsupported file is never embedded — referenced by name instead.
        ensure(16);
        const label = item.kind === "video" ? t("Video attachment") : item.kind === "document" ? t("PDF attachment") : t("Attachment");
        font(false).fontSize(9).fillColor(MUTED).text(`${label}: ${item.originalFilename}`, left, doc.y); doc.y += 14;
      }
    }
  };

  // Evidence excludes the resolution set and the drawing-location snapshot (shown above).
  const evidence = input.media.filter((m) => m.role !== "resolution" && m.role !== "drawing-location");
  if (evidence.length) { heading(t("Evidence")); renderMedia(evidence); }

  if (issue.status === "Resolved" || issue.status === "Closed") {
    heading(t("Resolution"));
    font(false).fontSize(10).fillColor(INK).text(issue.resolution || "—", left, doc.y, { width: contentWidth });
    const meta = [issue.resolvedBy ? `${t("Resolved by")} ${issue.resolvedBy} · ${formatAppDateTime(issue.resolvedAt || issue.createdAt)}` : "", issue.closedBy ? `${t("Closed by")} ${issue.closedBy}` : ""].filter(Boolean).join(" · ");
    if (meta) { font(false).fontSize(8).fillColor(MUTED).text(meta, left, doc.y + 2, { width: contentWidth }); }
    const resolutionMedia = input.media.filter((m) => m.role === "resolution");
    if (resolutionMedia.length) { doc.y += 4; renderMedia(resolutionMedia); }
  }
  if (issue.status === "Cancelled" && issue.cancelReason) { heading(t("Cancelled")); font(false).fontSize(10).fillColor(INK).text(issue.cancelReason, left, doc.y, { width: contentWidth }); }

  // Compact history (meaningful events only).
  const shownEvents = input.events.filter((e) => e.kind !== "media");
  if (shownEvents.length) {
    heading(t("Activity"));
    for (const event of shownEvents) {
      ensure(13); const y = doc.y;
      font(false).fontSize(7.5).fillColor(MUTED).text(formatAppDateTime(event.createdAt), left, y + 1, { width: 110, lineBreak: false });
      font(true).fontSize(8).fillColor(INK).text(t(EVENT_LABEL[event.kind] ?? event.kind), left + 115, y, { width: 110, lineBreak: false });
      const detail = event.kind === "comment" ? event.detail : (event.detail ? t(event.detail) : "");
      font(false).fontSize(8).fillColor(INK).text(`${detail}${detail && event.actor ? " · " : ""}${event.actor}`, left + 230, y, { width: contentWidth - 230 });
      doc.y = Math.max(doc.y, y + 12);
    }
  }

  // Footer page numbers.
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page); doc.page.margins.bottom = 16;
    doc.fillColor(PAPER).rect(0, doc.page.height - 34, doc.page.width, 34).fill();
    doc.strokeColor(LINE).moveTo(40, doc.page.height - 30).lineTo(right, doc.page.height - 30).stroke();
    font(false).fontSize(6).fillColor(MUTED).text(`PREFAB.LV · ${t("Issue")} #${issue.issueNumber} · ${input.projectName}`, 40, doc.page.height - 22, { width: 400, height: 8, lineBreak: false });
    font(false).fontSize(6).fillColor(MUTED).text(`${t("Page")} ${page + 1} / ${range.count}`, right - 120, doc.page.height - 22, { width: 120, height: 8, align: "right", lineBreak: false });
  }
  void ZEBRA;
  doc.end(); return done;
}

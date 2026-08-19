import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { PortalLanguage } from "../data/portal-i18n.ts";
import { portalText } from "../data/portal-i18n.ts";
import { formatAppDateTime } from "./datetime.ts";
import type { DailyLogSnapshot } from "./daily-ops.ts";

const ORANGE = "#f26522", INK = "#171717", MUTED = "#686868", LINE = "#d8d8d8", PAPER = "#ffffff";
const regularFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf");
const boldFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf");

// A photo referenced by the snapshot, with its bytes pre-loaded by the caller (a missing/broken
// file is passed as bytes:null and rendered as a text reference — one bad image never fails the
// whole report, per §20).
export type DailyLogPdfPhoto = { id: number; caption: string; area: string; mimeType: string; bytes: Buffer | null };
export type DailyLogPdfInput = { language: PortalLanguage; generatedBy: string; snapshot: DailyLogSnapshot; photos: DailyLogPdfPhoto[] };

export function dailyLogPdfFilename(projectName: string, logDate: string): string {
  const slug = projectName.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 80).replace(/^-+|-+$/g, "");
  return `PREFAB-DailyReport-${slug || "project"}-${logDate}.pdf`;
}

// The Daily Report is generated from the CONFIRMED SNAPSHOT (frozen at confirmation) — never from
// live joins — so a historical report is reproducible and immutable.
export async function generateDailyLogPdf(input: DailyLogPdfInput): Promise<Buffer> {
  const t = (v: string) => portalText(input.language, v), s = input.snapshot, generatedAt = new Date().toISOString();
  const doc = new PDFDocument({ size: "A4", margins: { top: 54, bottom: 46, left: 40, right: 40 }, bufferPages: true, info: { Title: `${t("Daily report")} ${s.projectName} ${s.logDate}`, Author: input.generatedBy || "PREFAB.LV", Creator: "PREFAB.LV" } });
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.registerFont("Regular", regularFont).registerFont("Bold", boldFont);
  const font = (bold = false) => doc.font(bold ? "Bold" : "Regular");
  const left = 40, right = doc.page.width - 40, contentWidth = right - left, bottom = doc.page.height - 46;
  const ensure = (h: number) => { if (doc.y + h > bottom) doc.addPage(); };
  const heading = (text: string) => { ensure(26); doc.moveDown(0.4); font(true).fontSize(9).fillColor(ORANGE).text(text.toUpperCase(), left, doc.y); doc.fillColor(ORANGE).rect(left, doc.y + 1, contentWidth, 1).fill(); doc.y += 6; };
  const para = (text: string) => { font(false).fontSize(10).fillColor(INK).text(text || "—", left, doc.y, { width: contentWidth }); doc.y += 2; };
  const row = (label: string, value: string) => { ensure(15); const y = doc.y; font(true).fillColor(MUTED).fontSize(8).text(label.toUpperCase(), left, y + 1, { width: 150, lineBreak: false }); font(false).fillColor(INK).fontSize(9).text(value || "—", left + 155, y, { width: contentWidth - 155 }); doc.y = Math.max(doc.y, y + 14); };

  const addHeader = () => { font(true).fontSize(9).fillColor(INK).text("PREFAB.", 40, 20, { continued: true, lineBreak: false }); font(true).fillColor(ORANGE).text("LV", { lineBreak: false }); doc.fillColor(ORANGE).rect(40, 39, right - 40, 1.5).fill(); };
  doc.on("pageAdded", () => { addHeader(); doc.y = 52; });
  addHeader();

  doc.y = 54; font(true).fontSize(18).fillColor(INK).text(t("Daily report"), left, 54, { width: contentWidth - 200 });
  font(true).fontSize(12).fillColor(ORANGE).text(s.projectName, left, 80, { width: contentWidth - 200 });
  font(false).fontSize(8).fillColor(MUTED).text(`${t("Generated")}: ${formatAppDateTime(generatedAt)} · ${t("Author")}: ${input.generatedBy || "—"}`, right - 240, 58, { width: 240, align: "right" });
  doc.y = 104;

  heading(t("Overview"));
  row(t("Date"), s.logDate);
  row(t("Responsible"), s.responsible);
  row(t("Status"), t("Confirmed"));
  if (s.confirmedBy) row(t("Confirmed by"), `${s.confirmedBy}${s.confirmedAt ? ` · ${formatAppDateTime(s.confirmedAt)}` : ""}`);
  if (s.weather) row(t("Weather"), s.weather);
  row(t("Workers on site"), String(s.workforce.present));
  row(t("Man-hours"), String(s.workforce.manHours));

  heading(t("Work performed"));
  para(s.manual.workPerformed);
  if (s.manual.delays) { heading(t("Delays / downtime")); para(s.manual.delays); if (s.manual.delayReason) para(`${t("Reason")}: ${s.manual.delayReason}`); }

  if (s.workforce.crew.length) {
    heading(t("Attendance"));
    for (const c of s.workforce.crew) { ensure(13); const y = doc.y; font(false).fontSize(9).fillColor(INK).text(c.name, left, y, { width: 200, lineBreak: false }); font(false).fontSize(8).fillColor(MUTED).text(`${t(c.status)} · ${c.workedHours} h${c.startTime || c.endTime ? ` · ${c.startTime || s.shift.start}–${c.endTime || s.shift.end}` : ""}`, left + 210, y, { width: contentWidth - 210 }); doc.y = Math.max(doc.y, y + 12); }
  }
  if (s.installedElements.length) { heading(t("Installed elements")); for (const e of s.installedElements) para(`${e.code} · ${e.elementType}${e.zone ? ` · ${e.zone}` : ""}`); }
  if (s.deliveries.length) { heading(t("Deliveries")); for (const d of s.deliveries) para(`${t("Load")} ${d.loadNumber} · ${t(d.status)}`); }
  const issueLine = (i: { issueNumber: number; title: string; status: string }) => para(`#${i.issueNumber} · ${i.title} · ${t(i.status)}`);
  if (s.defects.length) { heading(t("Defects")); s.defects.forEach(issueLine); }
  if (s.tasks.length) { heading(t("Tasks")); s.tasks.forEach(issueLine); }
  if (s.critical.length) { heading(t("Critical items")); s.critical.forEach(issueLine); }
  if (s.safety.length) { heading(t("Safety observations")); for (const r of s.safety) para(`${r.employee} · ${t(r.severity)} · ${r.description}`); }
  if (s.manual.equipmentNote) { heading(t("Temporary equipment")); para(s.manual.equipmentNote); }
  if (s.manual.materialsNote) { heading(t("Materials note")); para(s.manual.materialsNote); }
  if (s.manual.siteEvents) { heading(t("Site events")); para(s.manual.siteEvents); }
  if (s.manual.foremanComment) { heading(t("Foreman comments")); para(s.manual.foremanComment); }

  if (input.photos.length) {
    heading(t("Site photos"));
    for (const p of input.photos) {
      const embeddable = p.bytes && (p.mimeType === "image/jpeg" || p.mimeType === "image/png");
      if (embeddable) {
        ensure(180);
        try { doc.image(p.bytes as Buffer, left, doc.y, { fit: [contentWidth, 170], align: "center" }); doc.y += 174; if (p.caption) { font(false).fontSize(8).fillColor(MUTED).text(p.caption, left, doc.y, { width: contentWidth }); doc.y += 12; } }
        catch { font(false).fontSize(9).fillColor(MUTED).text(`${t("Photo")}: ${p.caption || `#${p.id}`}`, left, doc.y); doc.y += 14; }
      } else { ensure(16); font(false).fontSize(9).fillColor(MUTED).text(`${t("Photo")}: ${p.caption || `#${p.id}`}`, left, doc.y); doc.y += 14; }
    }
  }

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page); doc.page.margins.bottom = 16;
    doc.fillColor(PAPER).rect(0, doc.page.height - 34, doc.page.width, 34).fill();
    doc.strokeColor(LINE).moveTo(40, doc.page.height - 30).lineTo(right, doc.page.height - 30).stroke();
    font(false).fontSize(6).fillColor(MUTED).text(`PREFAB.LV · ${t("Daily report")} · ${s.projectName} · ${s.logDate}`, 40, doc.page.height - 22, { width: 420, height: 8, lineBreak: false });
    font(false).fontSize(6).fillColor(MUTED).text(`${t("Page")} ${page + 1} / ${range.count}`, right - 120, doc.page.height - 22, { width: 120, height: 8, align: "right", lineBreak: false });
  }
  doc.end(); return done;
}

import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { PortalLanguage } from "../data/portal-i18n.ts";
import { portalText } from "../data/portal-i18n.ts";
import { formatAppDateTime } from "./datetime.ts";

const ORANGE = "#f26522", INK = "#171717", MUTED = "#686868", LINE = "#d8d8d8", PAPER = "#ffffff", ZEBRA = "#f5f5f3";
const regularFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf");
const boldFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf");

export type SchedulePdfElement = { code: string; elementType: string; floor: string; installationZoneName: string; weight: number | null; length: number | null; width: number | null; height: number | null; orientation: string; intent: string; note: string };
export type SchedulePdfLoad = {
  loadNumber: number; status: string; plannedDate: string; plannedTime: string; loadingDirection: string; note: string; orientationNote: string;
  exceptionAck: boolean; exceptionReason: string; recommendedName: string; selectedName: string; totalWeightT: number;
  elements: SchedulePdfElement[];
};
// generatedBy is the authenticated user who generates the schedule, resolved server-side.
export type SchedulePdfInput = { projectName: string; loads: SchedulePdfLoad[]; language: PortalLanguage; includedDrafts: boolean; generatedBy: string };

export function deliveryScheduleFilename(projectName: string) {
  return `PREFAB-Delivery-Schedule-${projectName}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 150) + ".pdf";
}

// Column layout (landscape A4 content width ≈ 766pt from x=38 to x=804). STĀVS (Floor)
// sits between Type and Weight; widths rebalanced to keep the total within the page.
export const SCHEDULE_COLUMNS = [
  { key: "pos", label: "#", x: 38, w: 26 },
  { key: "mark", label: "Mark", x: 64, w: 120 },
  { key: "type", label: "Type", x: 184, w: 110 },
  { key: "floor", label: "Floor", x: 294, w: 50 },
  { key: "weight", label: "Weight (t)", x: 344, w: 64 },
  { key: "dims", label: "Dimensions (mm)", x: 408, w: 140 },
  { key: "orientation", label: "Orientation", x: 548, w: 84 },
  { key: "intent", label: "Intent", x: 632, w: 172 },
] as const;
const COLS = SCHEDULE_COLUMNS;

// Pure cell-value resolver — shared by the renderer and tested in isolation. The STĀVS
// value prefers the element's explicit design floor; when the source XLSX carries no floor
// it falls back to the element's assigned PREFAB Installation Zone name (operational
// metadata, kept separate — never written back onto the design floor); otherwise the
// standard em-dash placeholder. Generation never fails on absent data.
export function scheduleRowValue(el: SchedulePdfElement, key: string, index: number, t: (v: string) => string): string {
  switch (key) {
    case "pos": return String(index + 1);
    case "mark": return el.code;
    case "type": return t(el.elementType);
    case "floor": return el.floor || el.installationZoneName || "—";
    case "weight": return el.weight === null ? "—" : el.weight.toFixed(2);
    case "dims": return [el.length, el.width, el.height].map((d) => d ?? "—").join(" × ");
    case "orientation": return t(el.orientation);
    default: return `${t(el.intent)}${el.note ? ` · ${el.note}` : ""}`;
  }
}

// The header provenance line: generation timestamp + the resolving authenticated author.
export function scheduleGeneratedLine(t: (v: string) => string, generatedAtFormatted: string, generatedBy: string): string {
  return `${t("Generated")}: ${generatedAtFormatted} · ${t("Author")}: ${generatedBy || "—"}`;
}

export async function generateDeliverySchedulePdf(input: SchedulePdfInput): Promise<Buffer> {
  const t = (v: string) => portalText(input.language, v), generatedAt = new Date().toISOString();
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 56, bottom: 42, left: 38, right: 38 }, bufferPages: true, info: { Title: `${t("Delivery schedule")} - ${input.projectName}`, Author: input.generatedBy || "PREFAB.LV", Subject: input.projectName, Creator: "PREFAB.LV" } });
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.registerFont("Regular", regularFont).registerFont("Bold", boldFont);
  const font = (bold = false) => doc.font(bold ? "Bold" : "Regular");
  const right = doc.page.width - 38, bottom = doc.page.height - 40;
  const addHeader = () => { font(true).fontSize(9).fillColor(INK).text("PREFAB.", 38, 20, { continued: true, lineBreak: false }); font(true).fillColor(ORANGE).text("LV", { lineBreak: false }); doc.fillColor(ORANGE).rect(38, 39, right - 38, 1.5).fill(); };
  doc.on("pageAdded", () => { addHeader(); doc.y = 52; });
  addHeader();

  doc.y = 54; font(true).fontSize(18).fillColor(INK).text(t("Delivery schedule"), 38, 54, { width: 500 });
  font(true).fontSize(12).fillColor(ORANGE).text(input.projectName, 38, 78, { width: 500 });
  // Provenance: generation time + authenticated author. May wrap onto a second line.
  font(false).fontSize(8).fillColor(MUTED).text(scheduleGeneratedLine(t, formatAppDateTime(generatedAt), input.generatedBy), right - 320, 56, { width: 320, align: "right" });
  if (input.includedDrafts) font(true).fontSize(9).fillColor(ORANGE).text(t("Includes DRAFT loads"), right - 320, 88, { width: 320, align: "right" });
  doc.y = 104;

  const ensure = (h: number) => { if (doc.y + h > bottom) doc.addPage(); };
  if (input.loads.length === 0) { font(false).fontSize(10).fillColor(MUTED).text(t("No loads to schedule."), 38, doc.y); }

  for (const load of input.loads) {
    ensure(70);
    const y = doc.y;
    doc.fillColor("#111613").roundedRect(38, y, right - 38, 20, 2).fill();
    font(true).fontSize(10).fillColor("#ffffff").text(`${t("Load")} ${load.loadNumber}`, 46, y + 5, { width: 120, lineBreak: false });
    font(false).fontSize(8).fillColor("#d7ded9").text(`${load.plannedDate || "—"}  ${load.plannedTime || "—"}   ·   ${t(load.status)}${load.status === "Draft" ? ` (${t("DRAFT")})` : ""}`, 170, y + 6, { width: 300, lineBreak: false });
    font(false).fontSize(8).fillColor("#d7ded9").text(`${t("Selected transport")}: ${load.selectedName || "—"}   ${t("Recommended")}: ${load.recommendedName || t("Non-standard")}`, right - 360, y + 6, { width: 352, align: "right", lineBreak: false });
    doc.y = y + 24;

    const info = `${t("Loading direction")}: ${load.loadingDirection === "reverse" ? t("First listed element loaded last") : t("First listed element loaded first")}   ·   ${t("Total weight")}: ${load.totalWeightT.toFixed(2)} t   ·   ${t("Elements")}: ${load.elements.length}${load.exceptionAck ? `   ·   ⚠ ${t("Exception acknowledged")}` : ""}`;
    font(false).fontSize(7.5).fillColor(INK).text(info, 38, doc.y, { width: right - 38 }); doc.y += 13;

    // Column header
    ensure(16); const hy = doc.y; doc.fillColor(ZEBRA).rect(38, hy, right - 38, 14).fill();
    for (const c of COLS) font(true).fontSize(6.6).fillColor(MUTED).text(t(c.label).toUpperCase(), c.x + 2, hy + 4, { width: c.w - 4, height: 8, ellipsis: true, lineBreak: false });
    doc.y = hy + 15;

    load.elements.forEach((el, index) => {
      ensure(15);
      const ry = doc.y;
      if (index % 2 === 1) { doc.fillColor("#fbfbfa").rect(38, ry - 1, right - 38, 14).fill(); }
      const cell = (key: string, valBold = false) => {
        const col = COLS.find((c) => c.key === key)!;
        font(valBold).fontSize(7).fillColor(INK).text(scheduleRowValue(el, key, index, t), col.x + 2, ry + 2, { width: col.w - 4, height: 9, ellipsis: true, lineBreak: false });
      };
      cell("pos"); cell("mark", true); cell("type"); cell("floor"); cell("weight"); cell("dims"); cell("orientation"); cell("intent");
      doc.y = ry + 14;
    });
    if (load.note) { ensure(12); font(false).fontSize(7).fillColor(MUTED).text(`${t("Load note")}: ${load.note}`, 38, doc.y + 2, { width: right - 38 }); doc.y += 12; }
    doc.y += 10;
  }

  // Footer with page numbers.
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page); doc.page.margins.bottom = 16;
    doc.fillColor(PAPER).rect(0, doc.page.height - 34, doc.page.width, 34).fill();
    doc.strokeColor(LINE).moveTo(38, doc.page.height - 30).lineTo(right, doc.page.height - 30).stroke();
    font(false).fontSize(6).fillColor(MUTED).text(`PREFAB.LV · ${t("Delivery schedule")} · ${input.projectName}`, 38, doc.page.height - 22, { width: 500, height: 8, lineBreak: false });
    font(false).fontSize(6).fillColor(MUTED).text(`${t("Page")} ${page + 1} / ${range.count}`, right - 120, doc.page.height - 22, { width: 120, height: 8, align: "right", lineBreak: false });
  }
  doc.end(); return done;
}

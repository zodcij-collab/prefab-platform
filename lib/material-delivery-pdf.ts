import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { PortalLanguage } from "../data/portal-i18n.ts";
import { portalText } from "../data/portal-i18n.ts";
import { formatAppDateTime, formatEuroDate } from "./datetime.ts";
import { deliveryKnownWeight, formatTonnes } from "./deliveries.ts";

const ORANGE = "#f26522", INK = "#171717", MUTED = "#686868", LINE = "#d8d8d8", PAPER = "#ffffff", SOFT = "#f6f6f4";
const regularFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf");
const boldFont = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf");

// A Material Delivery / Material Delivery Plan document. `deliveries` is already project-scoped,
// authorised and sorted (date asc → time asc) by the caller; the generator never touches the DB.
// One delivery → a single "Material delivery" record; several → a combined "Material delivery
// plan". No internal ids are printed; empty/optional fields degrade to "—"; a delivery with zero
// line items still renders a valid document.
export type PdfDeliveryItem = { name: string; quantity: number; unit: string; note: string };
export type PdfDelivery = { deliveryDate: string; deliveryTime: string; supplier: string; loadRef: string; status: string; description: string; notes: string; items: PdfDeliveryItem[] };
export type MaterialDeliveryPdfInput = { language: PortalLanguage; generatedBy: string; projectName: string; deliveries: PdfDelivery[] };

export function materialDeliveryPdfFilename(projectName: string, plan: boolean, dateHint: string): string {
  const slug = projectName.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 60).replace(/^-+|-+$/g, "");
  return `PREFAB-${plan ? "DeliveryPlan" : "MaterialDelivery"}-${slug || "project"}-${dateHint || "current"}.pdf`;
}

export async function generateMaterialDeliveryPdf(input: MaterialDeliveryPdfInput): Promise<Buffer> {
  const t = (v: string) => portalText(input.language, v);
  // Always render chronologically (date asc → time asc), independent of the caller's order.
  const deliveries = [...input.deliveries].sort((a, b) => (a.deliveryDate === b.deliveryDate ? a.deliveryTime.localeCompare(b.deliveryTime) : a.deliveryDate.localeCompare(b.deliveryDate)));
  const plan = deliveries.length > 1;
  const title = plan ? t("Material delivery plan") : t("Material delivery");
  const generatedAt = new Date().toISOString();
  const doc = new PDFDocument({ size: "A4", margins: { top: 54, bottom: 46, left: 40, right: 40 }, bufferPages: true, info: { Title: `${title} · ${input.projectName}`, Author: input.generatedBy || "PREFAB.LV", Creator: "PREFAB.LV" } });
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.registerFont("Regular", regularFont).registerFont("Bold", boldFont);
  const font = (bold = false) => doc.font(bold ? "Bold" : "Regular");
  const left = 40, right = doc.page.width - 40, contentWidth = right - left, bottom = doc.page.height - 46;
  const ensure = (h: number) => { if (doc.y + h > bottom) doc.addPage(); };
  const heading = (text: string) => { ensure(26); doc.moveDown(0.3); font(true).fontSize(9).fillColor(ORANGE).text(text.toUpperCase(), left, doc.y); doc.fillColor(ORANGE).rect(left, doc.y + 1, contentWidth, 1).fill(); doc.y += 6; };
  // One metadata field per line: fixed label column + value column. Clean and collision-free in
  // every language (a compact 2-up variant was tried but overlapped long LV labels/values).
  const LABEL_W = 118;
  const row = (label: string, value: string) => {
    const val = value || "—", vw = contentWidth - LABEL_W - 6;
    font(false).fontSize(9);
    // Measure the (possibly wrapping) value first, reserve that height, THEN draw — so a long
    // description/note wraps vertically and moves to the next page instead of running under the footer.
    const h = Math.max(14, doc.heightOfString(val, { width: vw }));
    ensure(h);
    const y = doc.y;
    font(true).fillColor(MUTED).fontSize(8).text(label.toUpperCase(), left, y + 1, { width: LABEL_W, lineBreak: false });
    font(false).fillColor(INK).fontSize(9).text(val, left + LABEL_W + 6, y, { width: vw });
    doc.y = y + h;
  };

  const addHeader = () => { font(true).fontSize(9).fillColor(INK).text("PREFAB.", 40, 20, { continued: true, lineBreak: false }); font(true).fillColor(ORANGE).text("LV", { lineBreak: false }); doc.fillColor(ORANGE).rect(40, 39, right - 40, 1.5).fill(); };
  doc.on("pageAdded", () => { addHeader(); doc.y = 52; });
  addHeader();

  // Item table columns: MATERIAL | QUANTITY | UNIT | NOTE. FIXED positions/widths shared by the
  // header AND every row of EVERY delivery, so column geometry never shifts with content, and long
  // LV/EN/RU headers fit (Quantity is the longest — RU "Количество"). No id column is ever printed.
  const MAT = left, MAT_W = 192, QTY = left + 198, QTY_W = 62, UNIT = left + 266, UNIT_W = 72, NOTE = left + 344, NOTE_W = right - (left + 344);
  const drawItemHeader = () => {
    const y = doc.y;
    doc.fillColor(SOFT).rect(left, y - 1, contentWidth, 15).fill();
    font(true).fontSize(7.5).fillColor(MUTED);
    doc.text(t("Material").toUpperCase(), MAT + 3, y + 3, { width: MAT_W - 6, lineBreak: false });
    doc.text(t("Quantity").toUpperCase(), QTY, y + 3, { width: QTY_W, align: "right", lineBreak: false });
    doc.text(t("Unit").toUpperCase(), UNIT + 3, y + 3, { width: UNIT_W - 3, lineBreak: false });
    doc.text(t("Note").toUpperCase(), NOTE + 3, y + 3, { width: NOTE_W - 3, lineBreak: false });
    doc.y = y + 16;
  };
  const itemTable = (items: PdfDeliveryItem[]) => {
    if (!items.length) { ensure(15); font(false).fontSize(9).fillColor(MUTED).text(t("No material line items."), left, doc.y, { width: contentWidth }); doc.y += 14; return; }
    // Keep the header with its ACTUAL first row (which may wrap tall); otherwise start the table on
    // a fresh page, so the header is never left orphaned at the foot of a page with no rows under it.
    font(false).fontSize(9);
    const firstRowH = Math.max(doc.heightOfString(items[0].name || "—", { width: MAT_W - 6 }), doc.heightOfString(items[0].note || "", { width: NOTE_W - 6 }), 12) + 4;
    if (doc.y + 16 + firstRowH > bottom) doc.addPage();
    drawItemHeader();
    for (const it of items) {
      font(false).fontSize(9);
      // Row height grows to fit the wrapped material name / note (each wraps inside its own column).
      const rowH = Math.max(doc.heightOfString(it.name || "—", { width: MAT_W - 6 }), doc.heightOfString(it.note || "", { width: NOTE_W - 6 }), 12) + 4;
      // A row is never split across a page; if it doesn't fit, break the page and REPEAT the header.
      if (doc.y + rowH > bottom) { doc.addPage(); drawItemHeader(); }
      const y = doc.y;
      doc.fillColor(INK).text(it.name || "—", MAT + 3, y, { width: MAT_W - 6 });
      doc.fillColor(INK).text(it.quantity ? String(it.quantity) : "—", QTY, y, { width: QTY_W, align: "right", lineBreak: false });
      doc.fillColor(INK).text(it.unit || "—", UNIT + 3, y, { width: UNIT_W - 3, lineBreak: false });
      doc.fillColor(MUTED).text(it.note || "", NOTE + 3, y, { width: NOTE_W - 6 });
      doc.strokeColor(LINE).moveTo(left, y + rowH - 2).lineTo(right, y + rowH - 2).stroke();
      doc.y = y + rowH;
    }
  };

  const knownWeightLine = (items: PdfDeliveryItem[]) => {
    const w = deliveryKnownWeight(items);
    ensure(16); const y = doc.y;
    font(true).fontSize(9).fillColor(INK).text(`${t("Known total weight")}: ${w.tonnes ? formatTonnes(w.tonnes) : "—"}`, left, y, { width: contentWidth - 200, lineBreak: false });
    if (w.unknownCount > 0) font(false).fontSize(8).fillColor(MUTED).text(`${t("Items without direct weight data")}: ${w.unknownCount}`, left + 250, y + 1, { width: contentWidth - 250, align: "right", lineBreak: false });
    doc.y = y + 15;
    return w;
  };

  const deliveryBlock = (d: PdfDelivery) => {
    row(t("Delivery date"), formatEuroDate(d.deliveryDate));
    if (d.deliveryTime) row(t("Delivery time"), d.deliveryTime);
    row(t("Supplier"), d.supplier);
    row(t("Load reference"), d.loadRef);
    row(t("Status"), t(d.status));
    if (d.description) row(t("Description"), d.description);
    if (d.notes) row(t("Notes"), d.notes);
    doc.y += 6;
    itemTable(d.items);
    doc.y += 4;
    knownWeightLine(d.items);
  };

  // Title block
  doc.y = 54; font(true).fontSize(18).fillColor(INK).text(title, left, 54, { width: contentWidth - 210 });
  font(true).fontSize(11).fillColor(ORANGE).text(`${t("Project")}: ${input.projectName}`, left, 81, { width: contentWidth - 210 });
  font(false).fontSize(8).fillColor(MUTED).text(`${t("Generated")}: ${formatAppDateTime(generatedAt)}\n${t("Generated by")}: ${input.generatedBy || "—"}`, right - 240, 56, { width: 240, align: "right" });
  doc.y = 102;

  if (plan) {
    // Plan summary across all selected deliveries, then each delivery separated clearly.
    let totalKg = 0, totalUnknown = 0;
    for (const d of deliveries) { const w = deliveryKnownWeight(d.items); totalKg += w.tonnes * 1000; totalUnknown += w.unknownCount; }
    const totalT = Math.round(totalKg) / 1000;
    heading(t("Plan summary"));
    row(t("Deliveries selected"), String(deliveries.length));
    row(t("Known total weight"), totalT ? formatTonnes(totalT) : "—");
    // Full-width note (a labelled row would wrap the long localized label).
    if (totalUnknown > 0) { ensure(14); font(false).fontSize(8).fillColor(MUTED).text(`${t("Items without direct weight data")}: ${totalUnknown}`, left, doc.y, { width: contentWidth }); doc.y += 12; }
    deliveries.forEach((d, i) => {
      // Never orphan a delivery heading at the foot of a page: reserve the heading + a few
      // metadata rows so it starts with its content (long blocks then paginate row-by-row).
      if (doc.y + 78 > bottom) doc.addPage();
      heading(`${i + 1}. ${formatEuroDate(d.deliveryDate)}${d.deliveryTime ? ` · ${d.deliveryTime}` : ""} · ${d.supplier || "—"}`);
      deliveryBlock(d);
    });
  } else {
    heading(t("Material delivery"));
    deliveryBlock(deliveries[0]);
  }

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page); doc.page.margins.bottom = 16;
    doc.fillColor(PAPER).rect(0, doc.page.height - 34, doc.page.width, 34).fill();
    doc.strokeColor(LINE).moveTo(40, doc.page.height - 30).lineTo(right, doc.page.height - 30).stroke();
    font(false).fontSize(6).fillColor(MUTED).text(`PREFAB.LV · ${input.projectName} · ${t("Generated")}: ${formatAppDateTime(generatedAt)}`, 40, doc.page.height - 22, { width: 420, height: 8, lineBreak: false });
    font(false).fontSize(6).fillColor(MUTED).text(`${t("Page")} ${page + 1} / ${range.count}`, right - 120, doc.page.height - 22, { width: 120, height: 8, align: "right", lineBreak: false });
  }
  doc.end(); return done;
}

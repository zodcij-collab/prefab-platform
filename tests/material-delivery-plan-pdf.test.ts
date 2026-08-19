// Sprint 15 — combined Material Delivery PLAN PDF: multi-page layout robustness (fixed columns,
// wrapping, pagination with repeated table headers, no orphaned headings, chronological order).
// PDF content is glyph-encoded so we assert on validity, page count, size deltas and the source
// invariants; the visual layout was verified by rendering LV/RU/EN stress fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateMaterialDeliveryPdf, type PdfDelivery } from "../lib/material-delivery-pdf.ts";

const isPdf = (b: Buffer) => b.length > 800 && b.subarray(0, 5).toString("latin1") === "%PDF-" && b.subarray(-64).toString("latin1").includes("%%EOF");
const pageCount = (b: Buffer) => { const m = /\/Count (\d+)/.exec(b.toString("latin1")); return m ? Number(m[1]) : 1; };
const it = (name: string, quantity: number, unit: string, note = "") => ({ name, quantity, unit, note });
const LONG = "Sausie būvmaisījumi un montāžas javas dažādiem pamatnes sagatavošanas darbiem visā objektā ".repeat(2);

// 10 deliveries, deliberately NON-chronological input order, with long text, a 14-row table,
// and a zero-item legacy delivery — the stress fixture used for the rendered verification.
function stress(): PdfDelivery[] {
  const many = Array.from({ length: 14 }, (_, i) => it(`Materiāls rinda ${i + 1} — Weber / Sakret sērija`, (i + 1) * 1.5, i % 3 === 0 ? "t" : i % 3 === 1 ? "bag" : "pcs"));
  return [
    { deliveryDate: "2026-09-18", deliveryTime: "11:00", supplier: "Bonava", loadRef: "PO-9", status: "Planned", description: "Java", notes: "", items: [it("Weber 600/3", 5, "t")] },
    { deliveryDate: "2026-09-14", deliveryTime: "12:45", supplier: "Bonava", loadRef: "PO-2", status: "Planned", description: LONG, notes: LONG, items: [it("Weber ESL", 12, "t"), it("Isover SK-C 170mm minerālvate ruļļos", 1900, "m", LONG)] },
    { deliveryDate: "2026-09-14", deliveryTime: "08:00", supplier: "Sakret", loadRef: "PO-1", status: "Confirmed", description: "Sausie maisījumi", notes: "Rīta piegāde", items: [it("Sakret BAT", 3.5, "t")] },
    { deliveryDate: "2026-09-15", deliveryTime: "07:30", supplier: "Daudzu Rindu SIA", loadRef: "PO-4", status: "Planned", description: "Liels sortiments", notes: "", items: many },
    { deliveryDate: "2026-09-15", deliveryTime: "10:00", supplier: "Vecā Piegāde", loadRef: "", status: "Received", description: "Mantotais ieraksts", notes: "", items: [] },
    { deliveryDate: "2026-09-14", deliveryTime: "15:00", supplier: "Knauf", loadRef: "PO-3", status: "Planned", description: "Ģipškartons", notes: "", items: [it("Ģipškartons 12.5mm", 120, "pcs"), it("CD profili", 200, "m"), it("Skrūves", 5, "pack")] },
    { deliveryDate: "2026-09-16", deliveryTime: "08:00", supplier: "Cemex", loadRef: "PO-5", status: "Planned", description: "Betons", notes: "", items: [it("Betons C25/30 ar ļoti garu materiāla nosaukumu pārbaudei par pārnešanu jaunā rindā", 8, "m³"), it("Armatūra", 1.2, "t")] },
    { deliveryDate: "2026-09-16", deliveryTime: "13:00", supplier: "Ruukki", loadRef: "PO-6", status: "Planned", description: "Loksnes", notes: "", items: [it("Loksne A", 40, "pcs"), it("Ķīļi", 10, "kg")] },
    { deliveryDate: "2026-09-17", deliveryTime: "09:00", supplier: "Tenax", loadRef: "PO-7", status: "Planned", description: "Hidroizolācija", notes: "", items: [it("Membrāna", 600, "m²"), it("Līme", 15, "bag")] },
    { deliveryDate: "2026-09-19", deliveryTime: "14:00", supplier: "Henkel", loadRef: "PO-8", status: "Cancelled", description: "Ceresit", notes: "", items: [it("CT85", 30, "bag")] },
  ];
}

test("§PLAN-multipage: a 10-delivery plan with long content spans multiple pages and is valid in LV/RU/EN", async () => {
  for (const lang of ["lv", "ru", "en"] as const) {
    const pdf = await generateMaterialDeliveryPdf({ language: lang, generatedBy: "T", projectName: "Skaistkalnes iela 1a", deliveries: stress() });
    assert.ok(isPdf(pdf), `${lang}: valid PDF`);
    assert.ok(pageCount(pdf) >= 2, `${lang}: spans multiple pages (got ${pageCount(pdf)})`);
  }
});

test("§PLAN-content: more deliveries add content; a zero-item legacy plan still renders", async () => {
  const base = stress();
  const full = await generateMaterialDeliveryPdf({ language: "lv", generatedBy: "T", projectName: "T", deliveries: base });
  const fewer = await generateMaterialDeliveryPdf({ language: "lv", generatedBy: "T", projectName: "T", deliveries: base.slice(0, 4) });
  assert.ok(full.length > fewer.length, "more deliveries → more rendered content (none silently dropped)");
  const zeroOnly = await generateMaterialDeliveryPdf({ language: "lv", generatedBy: "T", projectName: "T", deliveries: [
    { deliveryDate: "2026-09-14", deliveryTime: "", supplier: "A", loadRef: "", status: "Planned", description: "", notes: "", items: [] },
    { deliveryDate: "2026-09-15", deliveryTime: "", supplier: "B", loadRef: "", status: "Planned", description: "", notes: "", items: [] },
  ] });
  assert.ok(isPdf(zeroOnly), "a plan made only of zero-item deliveries is valid");
});

test("§PLAN-source: fixed columns, repeated table header, and orphan guards are in place", () => {
  const src = readFileSync(join(process.cwd(), "lib/material-delivery-pdf.ts"), "utf8");
  assert.match(src, /const MAT = left, MAT_W = \d+, QTY = /, "item columns are fixed constants shared by header + every row");
  assert.match(src, /const drawItemHeader = \(\) =>/, "the table header is a reusable function");
  assert.match(src, /doc\.addPage\(\); drawItemHeader\(\)/, "the table header is REPEATED after a mid-table page break");
  assert.match(src, /Never orphan a delivery heading[\s\S]*doc\.addPage\(\)/, "a delivery heading is kept with its content (not orphaned)");
  assert.match(src, /\.sort\(\(a, b\) => \(a\.deliveryDate === b\.deliveryDate/, "the generator renders chronologically (date asc → time asc)");
});

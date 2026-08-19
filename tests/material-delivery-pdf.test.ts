// Sprint 15 — Material Deliveries completion pack: known weight, delivery selection, single &
// plan PDF generation, and i18n. Pure/framework-free (no DB), so safe to import statically.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deliveryKnownWeight, formatTonnes, selectDeliveriesForPdf } from "../lib/deliveries.ts";
import { formatEuroDate } from "../lib/datetime.ts";
import { generateMaterialDeliveryPdf, type PdfDelivery } from "../lib/material-delivery-pdf.ts";
import { portalText } from "../data/portal-i18n.ts";

const isPdf = (b: Buffer) => b.length > 800 && b.subarray(0, 5).toString("latin1") === "%PDF-" && b.subarray(-64).toString("latin1").includes("%%EOF");
const mkDelivery = (over: Partial<PdfDelivery> = {}): PdfDelivery => ({ deliveryDate: "2026-09-14", deliveryTime: "12:45", supplier: "Bonava Latvija SIA", loadRef: "PO-1", status: "Planned", description: "Client-supplied mixes", notes: "", items: [], ...over });

test("§MD-weight (C,D,E): known weight sums ONLY kg/t and never guesses other units", () => {
  // 12 t + 9 t + 2.4 t = 23.4 t; the 1900 m item is unknown, not inferred.
  const w = deliveryKnownWeight([{ quantity: 12, unit: "t" }, { quantity: 9, unit: "t" }, { quantity: 2.4, unit: "t" }, { quantity: 1900, unit: "m" }]);
  assert.equal(w.tonnes, 23.4);
  assert.equal(w.unknownCount, 1);
  assert.equal(formatTonnes(w.tonnes), "23.4 t");
  // kg normalises to tonnes
  assert.equal(deliveryKnownWeight([{ quantity: 500, unit: "kg" }, { quantity: 1, unit: "t" }]).tonnes, 1.5);
  // D: non-mass units are never converted into weight
  assert.deepEqual(deliveryKnownWeight([{ quantity: 5, unit: "pcs" }, { quantity: 3, unit: "pallet" }, { quantity: 10, unit: "m²" }]), { tonnes: 0, unknownCount: 3 });
  // E: mixed known/unknown reports the known mass safely and counts the rest
  const mix = deliveryKnownWeight([{ quantity: 2, unit: "t" }, { quantity: 100, unit: "pcs" }]);
  assert.equal(mix.tonnes, 2); assert.equal(mix.unknownCount, 1);
  assert.equal(formatTonnes(0), "", "no known mass → empty label");
});

test("§MD-planweight (M): weight across several deliveries sums only directly-known mass", () => {
  const a = deliveryKnownWeight([{ quantity: 12, unit: "t" }]);
  const b = deliveryKnownWeight([{ quantity: 9, unit: "t" }, { quantity: 1900, unit: "m" }]);
  assert.equal(Math.round(a.tonnes * 1000 + b.tonnes * 1000) / 1000, 21);
  assert.equal(a.unknownCount + b.unknownCount, 1);
});

test("§MD-select (I,J,K,L,N): keeps project ids only, sorts date→time, dedups, handles empty", () => {
  const project = [
    { id: 9, deliveryDate: "2026-09-14", deliveryTime: "12:45" },
    { id: 10, deliveryDate: "2026-09-14", deliveryTime: "08:00" },
    { id: 11, deliveryDate: "2026-09-16", deliveryTime: "09:00" },
  ];
  // I + K: arbitrary same-project ids accepted, sorted date asc → time asc (10 precedes 9 same day)
  assert.deepEqual(selectDeliveriesForPdf(project, [11, 9, 10]).map((d) => d.id), [10, 9, 11]);
  // J: a cross-project id (not in the project list) is dropped
  assert.deepEqual(selectDeliveriesForPdf(project, [9, 999]).map((d) => d.id), [9]);
  // L: each selected delivery appears exactly once, even if requested repeatedly
  assert.deepEqual(selectDeliveriesForPdf(project, [9, 9, 9]).map((d) => d.id), [9]);
  // N: empty selection → empty result
  assert.deepEqual(selectDeliveriesForPdf(project, []), []);
});

test("§MD-pdf (F,G,H): single, plan and legacy zero-item deliveries all render a valid PDF", async () => {
  const withItems = await generateMaterialDeliveryPdf({ language: "lv", generatedBy: "Tester", projectName: "Skaistkalnes iela 1a", deliveries: [mkDelivery({ items: [{ name: "Weber ESL", quantity: 12, unit: "t", note: "" }, { name: "Isover SK-C", quantity: 1900, unit: "m", note: "170mm" }] })] });
  assert.ok(isPdf(withItems), "single-delivery PDF is a valid document");
  // H: a legacy delivery with zero line items still produces a valid PDF
  const zero = await generateMaterialDeliveryPdf({ language: "lv", generatedBy: "T", projectName: "Test", deliveries: [mkDelivery({ items: [] })] });
  assert.ok(isPdf(zero), "zero-item PDF is valid");
  // G (proxy): line items add rendered content, so the itemful PDF is larger than the empty one
  assert.ok(withItems.length > zero.length, "line items add content to the PDF");
  // plan PDF (multiple deliveries) is valid and larger than a single
  const plan = await generateMaterialDeliveryPdf({ language: "en", generatedBy: "T", projectName: "Test", deliveries: [mkDelivery({ deliveryDate: "2026-09-14", items: [{ name: "A", quantity: 2, unit: "t", note: "" }] }), mkDelivery({ deliveryDate: "2026-09-16", deliveryTime: "08:00", items: [{ name: "B", quantity: 3, unit: "t", note: "" }] })] });
  assert.ok(isPdf(plan), "delivery-plan PDF is valid");
  assert.ok(plan.length > withItems.length, "a two-delivery plan is larger than a single delivery");
});

test("§MD-i18n (O): Material Deliveries surface resolves in LV and RU (no English fallback)", () => {
  for (const k of ["Load reference", "Save delivery", "Open PDF", "Known total weight", "Items without direct weight data", "Material delivery plan", "Delivery plan PDF", "Generate Delivery Plan PDF", "Select all", "No material line items.", "Generated by", "Material"]) {
    assert.notEqual(portalText("lv", k), k, `LV translated: ${k}`);
    assert.notEqual(portalText("ru", k), k, `RU translated: ${k}`);
  }
  // the two the tester flagged as English on RU:
  assert.equal(portalText("ru", "Load reference"), "Ссылка на груз");
  assert.equal(portalText("ru", "Save delivery"), "Сохранить поставку");
});

test("§MD-date (B): localized European date DD.MM.YYYY; PDF never prints raw ISO in the date field", () => {
  assert.equal(formatEuroDate("2026-09-14"), "14.09.2026");
  assert.equal(formatEuroDate("2026-09-14T10:00:00Z"), "14.09.2026");
  assert.equal(formatEuroDate(""), "", "empty stays empty");
  const src = readFileSync(join(process.cwd(), "lib/material-delivery-pdf.ts"), "utf8");
  assert.match(src, /formatEuroDate\(d\.deliveryDate\)/, "the PDF delivery-date field is localized, not raw ISO");
});

test("§MD-pdfcols (A): PDF Unit column is wide enough for localized headers (MĒRVIENĪBA — no collision)", () => {
  const src = readFileSync(join(process.cwd(), "lib/material-delivery-pdf.ts"), "utf8");
  const m = /UNIT_W = (\d+)/.exec(src);
  assert.ok(m && Number(m[1]) >= 70, `unit column must stay ≥70px for the LV/RU header (got ${m?.[1]})`);
});

test("§MD-editor (A): line-item editor is controlled + labelled (values survive add/remove)", () => {
  const src = readFileSync(join(process.cwd(), "components/portal/DeliveryItemsEditor.tsx"), "utf8");
  assert.match(src, /value=\{r\.name\}[\s\S]*onChange/, "material input is controlled client state");
  assert.match(src, /os-di-head/, "permanent column headers on desktop");
  assert.match(src, /os-di-mlabel/, "per-field labels for the mobile stacked layout");
});

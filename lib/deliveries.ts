// Sprint 15 Fix Pack — Material Delivery line items.
// A Material Delivery may carry several materials, each with a quantity and a unit. This module
// holds the pure, framework-free logic: the allowed construction units and the normalisation of
// raw form rows into clean line items. It is deliberately NOT a materials/stock module — there
// are no balances, consumption, pricing or catalogue here, only "what was requested / delivered".

// Sensible construction units. The list is intentionally small and generic — not a catalogue.
export const MATERIAL_UNITS = ["pcs", "kg", "t", "m", "m²", "m³", "bag", "pallet", "roll", "pack"] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export type DeliveryItemInput = { name: string; quantity: number; unit: string; note: string };

export function isMaterialUnit(unit: string): boolean {
  return (MATERIAL_UNITS as readonly string[]).includes(unit);
}

// Read the submitted line items from a delivery form. Prefers the atomic `itemsJson` field (one
// field = the editor's exact React state, immune to index misalignment); falls back to the legacy
// parallel arrays (itemName[]/itemQty[]/itemUnit[]/itemNote[]) only when itemsJson is absent, so
// older/cached clients still work. The result feeds normalizeDeliveryItems.
export type RawDeliveryRow = { name: unknown; quantity: unknown; unit: unknown; note: unknown };
export function parseDeliveryItemsForm(data: { get(key: string): unknown; getAll(key: string): unknown[] }): RawDeliveryRow[] {
  const json = data.get("itemsJson");
  if (typeof json === "string" && json) {
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) return arr.map((r) => ({ name: r?.name, quantity: r?.quantity, unit: r?.unit, note: r?.note }));
    } catch { /* malformed JSON → fall back to the parallel arrays below */ }
  }
  const names = data.getAll("itemName"), qtys = data.getAll("itemQty"), units = data.getAll("itemUnit"), notes = data.getAll("itemNote");
  return names.map((name, i) => ({ name, quantity: qtys[i], unit: units[i], note: notes[i] }));
}

// Turn the parallel form arrays (itemName[], itemQty[], itemUnit[], itemNote[]) into clean,
// validated line items. Empty editor rows — those with a blank material name — are dropped, so a
// delivery can be saved with no items at all (existing/legacy deliveries stay valid). Quantity is
// coerced to a finite number ≥ 0; a blank/invalid quantity becomes 0 rather than failing the save.
// Unit is accepted only if it is one of the known units, otherwise blanked. Lengths are capped.
export function normalizeDeliveryItems(
  rows: { name: unknown; quantity: unknown; unit: unknown; note: unknown }[],
): DeliveryItemInput[] {
  const items: DeliveryItemInput[] = [];
  for (const row of rows) {
    const name = String(row.name ?? "").trim().slice(0, 160);
    if (!name) continue;
    const parsed = Number(String(row.quantity ?? "").trim());
    const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const unitRaw = String(row.unit ?? "").trim();
    const unit = isMaterialUnit(unitRaw) ? unitRaw : "";
    const note = String(row.note ?? "").trim().slice(0, 240);
    items.push({ name, quantity, unit, note });
  }
  return items;
}

// Human-readable "12 pcs" / "1.5 t" / "" (no quantity). Kept pure so the page and tests agree.
export function formatQuantity(quantity: number, unit: string): string {
  if (!quantity) return unit || "";
  const q = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  return [q, unit].filter(Boolean).join(" ");
}

// Known total weight of a delivery. V1 rule (deliberately conservative — NO density/conversion
// guessing): sum ONLY line items whose entered unit directly represents mass (kg, t), normalised
// to tonnes. Every other unit (m, m², pcs, pallet, …) is counted in `unknownCount` and never
// inferred. A future Materials Catalogue could add kg/m, kg/pcs factors — out of scope here.
export type KnownWeight = { tonnes: number; unknownCount: number };
export function deliveryKnownWeight(items: { quantity: number; unit: string }[]): KnownWeight {
  let kilograms = 0, unknownCount = 0;
  for (const item of items) {
    if (item.unit === "t") kilograms += item.quantity * 1000;
    else if (item.unit === "kg") kilograms += item.quantity;
    else unknownCount++;
  }
  // Sum in kg then convert once, so 12 t + 9 t + 2.4 t = 23.4 t exactly (no float drift).
  return { tonnes: Math.round(kilograms) / 1000, unknownCount };
}
// "23.4 t" — trims trailing zeros. Empty string when there is no known mass at all.
export function formatTonnes(tonnes: number): string {
  if (!tonnes) return "";
  return `${Number(tonnes.toFixed(3))} t`;
}

// Pick the deliveries for a (single or plan) PDF: keep only the wanted ids that actually belong to
// the given project list (so cross-project ids can never be included) and sort them date asc →
// time asc, independent of the order the user ticked them. Deduping is inherent (a Set of ids over
// a unique-id project list yields each delivery at most once). Empty selection → empty result.
export function selectDeliveriesForPdf<T extends { id: number; deliveryDate: string; deliveryTime: string }>(projectDeliveries: T[], wantedIds: number[]): T[] {
  const wanted = new Set(wantedIds);
  return projectDeliveries
    .filter((d) => wanted.has(d.id))
    .sort((a, b) => (a.deliveryDate === b.deliveryDate ? a.deliveryTime.localeCompare(b.deliveryTime) : a.deliveryDate.localeCompare(b.deliveryDate)));
}

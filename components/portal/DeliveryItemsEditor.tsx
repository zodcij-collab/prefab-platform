"use client";
import { useState } from "react";

// Repeatable material line-item editor for a Material Delivery, laid out as a labelled table:
//   MATERIAL | QUANTITY | UNIT | NOTE | (remove)
// Column headers are permanently visible on desktop; on narrow screens each row reflows into a
// stacked card with per-field labels (no cramped horizontal table). Values are controlled client
// state, so adding/removing a row never loses what the user typed in the others. Each row posts the
// parallel fields itemName / itemQty / itemUnit / itemNote, which the server action zips back
// together (blank-name rows are dropped there). Labels arrive pre-translated (server parent).
type Row = { uid: number; name: string; quantity: string; unit: string; note: string };
type InitialItem = { name: string; quantity: number; unit: string; note: string };
type Labels = { items: string; material: string; quantity: string; unit: string; note: string; add: string; remove: string; hint: string };

function toRow(uid: number, item: InitialItem | undefined, fallbackUnit: string): Row {
  return { uid, name: item?.name ?? "", quantity: item && item.quantity ? String(item.quantity) : "", unit: item?.unit || fallbackUnit, note: item?.note ?? "" };
}

export function DeliveryItemsEditor({ units, initial, labels }: { units: string[]; initial: InitialItem[]; labels: Labels }) {
  const fallbackUnit = units[0] ?? "";
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial.map((it, i) => toRow(i, it, fallbackUnit)) : [toRow(0, undefined, fallbackUnit)]));
  const nextUid = (rs: Row[]) => rs.reduce((max, r) => Math.max(max, r.uid), -1) + 1;
  const update = (uid: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, toRow(nextUid(rs), undefined, fallbackUnit)]);
  // Always keep at least one row so the section never disappears; removing the last one clears it.
  const remove = (uid: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== uid) : [toRow(nextUid(rs), undefined, fallbackUnit)]));

  return (
    <div className="os-delivery-items">
      {/* Atomic submission: the whole line-item list as ONE field derived from React state, so the
          server reconstructs rows without index-zipping parallel arrays (a select that fails to
          submit — e.g. a stale/partly-hydrated bundle — can no longer misalign name↔unit). */}
      <input type="hidden" name="itemsJson" value={JSON.stringify(rows.map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit, note: r.note })))} readOnly />
      <p className="os-section-label">{labels.items}</p>
      <div className="os-di-head" aria-hidden="true">
        <span>{labels.material}</span><span>{labels.quantity}</span><span>{labels.unit}</span><span>{labels.note}</span><span className="os-di-head-x" />
      </div>
      {rows.map((r) => (
        <div className="os-delivery-item-row" key={r.uid}>
          <label className="os-di-cell os-di-name"><span className="os-di-mlabel">{labels.material}</span><input name="itemName" value={r.name} placeholder={labels.material} maxLength={160} onChange={(e) => update(r.uid, { name: e.target.value })} /></label>
          <label className="os-di-cell os-di-qty"><span className="os-di-mlabel">{labels.quantity}</span><input name="itemQty" type="number" min="0" step="any" inputMode="decimal" value={r.quantity} placeholder="0" onChange={(e) => update(r.uid, { quantity: e.target.value })} /></label>
          <label className="os-di-cell os-di-unit"><span className="os-di-mlabel">{labels.unit}</span><select name="itemUnit" value={r.unit} onChange={(e) => update(r.uid, { unit: e.target.value })}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
          <label className="os-di-cell os-di-note"><span className="os-di-mlabel">{labels.note}</span><input name="itemNote" value={r.note} placeholder={labels.note} maxLength={240} onChange={(e) => update(r.uid, { note: e.target.value })} /></label>
          <button type="button" className="os-di-remove" aria-label={labels.remove} title={labels.remove} onClick={() => remove(r.uid)}>×</button>
        </div>
      ))}
      <button type="button" className="os-secondary-action os-di-add" onClick={add}>+ {labels.add}</button>
      <p className="os-help os-di-hint">{labels.hint}</p>
    </div>
  );
}

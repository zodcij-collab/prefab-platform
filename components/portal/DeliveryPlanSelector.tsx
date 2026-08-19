"use client";
import { useState } from "react";

// Multi-delivery selection → combined "Delivery Plan" PDF. The user ticks any combination of the
// project's material deliveries (any dates/times) and generates one PDF; the server route sorts
// them date→time and never mutates anything. Selection is fully explicit (nothing auto-selected)
// and the empty case is handled (button disabled + hint). Opens the PDF in a new tab so standard
// browser print/save controls apply.
type PlanDelivery = { id: number; date: string; time: string; supplier: string; description: string };
type Labels = { title: string; hint: string; generate: string; empty: string; selectAll: string; clearAll: string };

export function DeliveryPlanSelector({ projectId, deliveries, labels }: { projectId: string; deliveries: PlanDelivery[]; labels: Labels }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = deliveries.length > 0 && selected.size === deliveries.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(deliveries.map((d) => d.id)));
  const open = () => {
    if (!selected.size) return;
    const ids = deliveries.filter((d) => selected.has(d.id)).map((d) => d.id).join(",");
    window.open(`/portal/projects/${projectId}/deliveries/pdf?ids=${ids}&inline=1`, "_blank", "noopener");
  };

  return (
    <div className="os-plan-selector">
      <div className="os-plan-head"><p className="os-section-label">{labels.title}</p>{deliveries.length > 1 && <button type="button" className="os-plan-selectall" onClick={toggleAll}>{allSelected ? labels.clearAll : labels.selectAll}</button>}</div>
      <ul className="os-plan-list">
        {deliveries.map((d) => (
          <li key={d.id}>
            <label className="os-plan-row">
              <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
              <span className="os-plan-when">{d.date}{d.time ? ` · ${d.time}` : ""}</span>
              <span className="os-plan-sup">{d.supplier || "—"}</span>
              <span className="os-plan-desc">{d.description}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="os-plan-actions">
        <button type="button" className="os-primary-action" onClick={open} disabled={!selected.size}>{labels.generate}{selected.size ? ` (${selected.size})` : ""}</button>
        <span className="os-help os-save-status">{selected.size ? labels.hint : labels.empty}</span>
      </div>
    </div>
  );
}

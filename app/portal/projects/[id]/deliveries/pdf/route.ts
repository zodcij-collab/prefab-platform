import { requireUser } from "../../../../../../lib/auth";
import { canAccessProject } from "../../../../../../lib/permissions";
import { getProject, listDeliveries, listDeliveryItems, logActivity } from "../../../../../../lib/repositories";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { selectDeliveriesForPdf } from "../../../../../../lib/deliveries";
import { generateMaterialDeliveryPdf, materialDeliveryPdfFilename, type PdfDelivery } from "../../../../../../lib/material-delivery-pdf";

export const runtime = "nodejs";

// Material Delivery / Delivery Plan PDF. `?ids=9` → single delivery; `?ids=9,10,11` → combined
// plan. Auth + project access; cross-project delivery ids are silently dropped (we only ever match
// THIS project's deliveries), and an empty/no-match selection is handled explicitly. Generation is
// read-only — it never mutates a delivery. Deliveries are sorted date asc → time asc for the PDF,
// independent of selection order.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = getProject(id);
  if (!project || !canAccessProject(user, id)) return new Response("Not found", { status: 404 });

  const wanted = new Set((new URL(request.url).searchParams.get("ids") || "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0));
  if (wanted.size === 0) return new Response("No deliveries selected", { status: 400 });
  // project-scoped: only THIS project's deliveries are passed in, so cross-project ids can never
  // match. Sorted date asc → time asc regardless of selection order.
  const sorted = selectDeliveriesForPdf(listDeliveries(id), [...wanted]);
  if (sorted.length === 0) return new Response("Not found", { status: 404 });

  const deliveries: PdfDelivery[] = sorted.map((d) => ({ deliveryDate: d.deliveryDate, deliveryTime: d.deliveryTime, supplier: d.supplier, loadRef: d.loadRef, status: d.status, description: d.description, notes: d.notes, items: listDeliveryItems(d.id).map((it) => ({ name: it.name, quantity: it.quantity, unit: it.unit, note: it.note })) }));
  const pdf = await generateMaterialDeliveryPdf({ language: await getPortalLanguage(), generatedBy: user.name, projectName: project.name, deliveries });
  const plan = deliveries.length > 1;
  logActivity({ userId: user.id, actor: user.name, action: plan ? "Delivery plan PDF generated" : "Material delivery PDF generated", entityType: "project", entityId: id, details: String(deliveries.length) });

  const filename = materialDeliveryPdfFilename(project.name, plan, sorted[0].deliveryDate);
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.length), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

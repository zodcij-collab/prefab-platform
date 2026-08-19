import { requireUser } from "../../../../../lib/auth";
import { canViewPersonnelDocuments } from "../../../../../lib/permissions";
import { getEmployeeDocumentById } from "../../../../../lib/personnel-repo";
import { contentDisposition, readStoredFile } from "../../../../../lib/storage";

// Private HR documents (OVP / certificates / safety evidence). Sensitive → Project Manager+ only
// (privacy tier). Never a public URL; served same-origin with no-store. Insufficient access = 403.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canViewPersonnelDocuments(user)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const doc = getEmployeeDocumentById(Number(id));
  if (!doc) return new Response("Not found", { status: 404 });
  try {
    const file = await readStoredFile(doc.storedPath);
    return new Response(file, { headers: { "Content-Type": doc.mimeType || "application/octet-stream", "Content-Length": String(file.length), "Content-Disposition": contentDisposition(doc.originalFilename), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch { return new Response("File unavailable", { status: 404 }); }
}

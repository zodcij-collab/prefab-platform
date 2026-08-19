import { requireUser } from "../../../../../lib/auth";
import { canViewPersonnel } from "../../../../../lib/permissions";
import { getEmployeePhoto } from "../../../../../lib/personnel-repo";
import { contentDisposition, readStoredFile } from "../../../../../lib/storage";

// Employee photo — operational identity (Foreman+). Private, same-origin, no-store.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canViewPersonnel(user)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const photo = getEmployeePhoto(id);
  if (!photo) return new Response("Not found", { status: 404 });
  try {
    const file = await readStoredFile(photo.storedPath);
    return new Response(file, { headers: { "Content-Type": photo.mimeType || "application/octet-stream", "Content-Length": String(file.length), "Content-Disposition": contentDisposition("photo"), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch { return new Response("File unavailable", { status: 404 }); }
}

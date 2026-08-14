import { requireUser } from "../../../../../lib/auth";
import { getIssueMediaById } from "../../../../../lib/issues-repo";
import { canViewProjectIssues } from "../../../../../lib/permissions";
import { contentDisposition, readStoredFile } from "../../../../../lib/storage";

// Serves issue evidence/resolution media. Authenticated + project-issue authorization only;
// stored paths are never exposed to the client and are validated against the storage root.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const media = getIssueMediaById(Number(id));
  if (!media?.storedPath || !canViewProjectIssues(user, media.projectId)) return new Response("Not found", { status: 404 });
  try {
    const file = await readStoredFile(media.storedPath);
    return new Response(file, { headers: { "Content-Type": media.mimeType || "application/octet-stream", "Content-Length": String(file.length), "Content-Disposition": contentDisposition(media.originalFilename), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch {
    return new Response("File unavailable", { status: 404 });
  }
}

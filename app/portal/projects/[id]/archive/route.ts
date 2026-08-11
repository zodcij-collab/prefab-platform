import { zipSync, strToU8 } from "fflate";
import { requireUser } from "../../../../../lib/auth";
import { canAccessProject, canManageProjectLifecycle } from "../../../../../lib/permissions";
import { getProject, logActivity } from "../../../../../lib/repositories";
import { collectProjectArchive } from "../../../../../lib/project-archive";
import { readStoredFile } from "../../../../../lib/storage";
import { contentDisposition } from "../../../../../lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = getProject(id);
  if (!project || !canAccessProject(user, id)) return new Response("Not found", { status: 404 });
  if (!canManageProjectLifecycle(user)) return new Response("Forbidden", { status: 403 });

  const { files, media } = collectProjectArchive(id, user.name, new Date().toISOString());
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);
  // Attach available media; missing files are skipped gracefully.
  for (const item of media) {
    try {
      const buffer = await readStoredFile(item.storedPath);
      entries[item.archivePath] = new Uint8Array(buffer);
    } catch {
      // media no longer on disk — recorded in the manifest but omitted from the ZIP
    }
  }
  const zipped = zipSync(entries, { level: 6 });
  logActivity({ userId: user.id, actor: user.name, action: "Generated project archive export", entityType: "project", entityId: id, details: `${project.name} · ${Object.keys(entries).length} files` });
  const filename = `project-archive-${id}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(zipped, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zipped.length),
      "Content-Disposition": contentDisposition(filename),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

import { requireUser } from "../../../../../../lib/auth";
import { canViewDailyLog } from "../../../../../../lib/permissions";
import { getProject, getProjectPhoto, logActivity } from "../../../../../../lib/repositories";
import { getDailyLog, dailyLogSnapshot } from "../../../../../../lib/daily-ops-repo";
import { readStoredFile } from "../../../../../../lib/storage";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { generateDailyLogPdf, dailyLogPdfFilename, type DailyLogPdfPhoto } from "../../../../../../lib/daily-log-pdf";

export const runtime = "nodejs";

// Daily Report PDF. Auth + dailylog.view + project scope; cross-project = 404. A confirmed report
// is rendered from its immutable snapshot (dailyLogSnapshot returns the frozen JSON when
// confirmed); exporting never mutates. Photo bytes are read defensively so a missing/corrupt
// image degrades to a text reference and never fails generation.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = getProject(id);
  if (!project || !canViewDailyLog(user, id)) return new Response("Not found", { status: 404 });
  const date = new URL(request.url).searchParams.get("date") || "";
  const log = getDailyLog(id, date);
  if (!log) return new Response("Not found", { status: 404 });

  const snapshot = dailyLogSnapshot(log);
  const photos: DailyLogPdfPhoto[] = [];
  for (const p of snapshot.photos) {
    const record = getProjectPhoto(p.id);
    let bytes: Buffer | null = null;
    if (record?.storedPath) { try { bytes = await readStoredFile(record.storedPath); } catch { bytes = null; } }
    photos.push({ id: p.id, caption: p.caption, area: p.area, mimeType: record?.mimeType ?? "", bytes });
  }

  const pdf = await generateDailyLogPdf({ language: await getPortalLanguage(), generatedBy: user.name, snapshot, photos });
  logActivity({ userId: user.id, actor: user.name, action: "Daily report PDF generated", entityType: "project", entityId: id, details: date });
  const filename = dailyLogPdfFilename(project.name, date), ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.length), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

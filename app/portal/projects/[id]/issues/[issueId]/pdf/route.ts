import { requireUser } from "../../../../../../../lib/auth";
import { canViewProjectIssues } from "../../../../../../../lib/permissions";
import { getProject, logActivity } from "../../../../../../../lib/repositories";
import { getIssue, listIssueEvents, listIssueMedia } from "../../../../../../../lib/issues-repo";
import { readStoredFile } from "../../../../../../../lib/storage";
import { getPortalLanguage } from "../../../../../../../lib/portal-locale";
import { appToday } from "../../../../../../../lib/datetime";
import { generateIssuePdf, issuePdfFilename, type IssuePdfMedia } from "../../../../../../../lib/issue-pdf";

export const runtime = "nodejs";

// Project-scoped Issue/Defect record PDF. Auth + issues.view + project scope; cross-project
// access is 404. Exporting never mutates the issue. ?inline=1 opens in-browser for printing.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const user = await requireUser();
  const { id, issueId } = await params;
  const project = getProject(id);
  if (!project || !canViewProjectIssues(user, id)) return new Response("Not found", { status: 404 });
  const issue = getIssue(Number(issueId));
  if (!issue || issue.projectId !== id) return new Response("Not found", { status: 404 });

  // Read each attachment defensively — a missing file becomes a text reference, never a crash.
  const media: IssuePdfMedia[] = [];
  for (const m of listIssueMedia(issue.id)) {
    let bytes: Buffer | null = null;
    try { bytes = await readStoredFile(m.storedPath); } catch { bytes = null; }
    media.push({ role: m.role, kind: m.kind, mimeType: m.mimeType, originalFilename: m.originalFilename, bytes });
  }

  const pdf = await generateIssuePdf({
    projectName: project.name, language: await getPortalLanguage(), generatedBy: user.name, today: appToday(),
    issue: { issueNumber: issue.issueNumber, type: issue.type, status: issue.status, priority: issue.priority, title: issue.title, details: issue.details, classified: issue.classified, installationZoneName: issue.installationZoneName, elementCode: issue.elementCode, assignedTo: issue.assignedTo, dueDate: issue.dueDate, createdBy: issue.createdBy, createdAt: issue.createdAt, resolution: issue.resolution, resolvedBy: issue.resolvedBy, resolvedAt: issue.resolvedAt, closedBy: issue.closedBy, closedAt: issue.closedAt, cancelReason: issue.cancelReason },
    media,
    events: listIssueEvents(issue.id).map((e) => ({ kind: e.kind, detail: e.detail, actor: e.actor, createdAt: e.createdAt })),
  });

  logActivity({ userId: user.id, actor: user.name, action: "Issue PDF generated", entityType: "project", entityId: id, details: `Issue #${issue.issueNumber}` });
  const filename = issuePdfFilename(project.name, issue.issueNumber), ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.length), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

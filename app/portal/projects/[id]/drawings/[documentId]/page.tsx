import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../../components/portal/BackLink";
import { DrawingViewer } from "../../../../../../components/portal/DrawingViewer";
import { requireUser } from "../../../../../../lib/auth";
import { canCaptureProjectIssues, canManageProjectIssues, canViewProjectIssues } from "../../../../../../lib/permissions";
import { getProject, getProjectDocument } from "../../../../../../lib/repositories";
import { getIssue, listDocumentMarkers } from "../../../../../../lib/issues-repo";
import { drawingBackHref } from "../../../../../../lib/issues";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { portalText } from "../../../../../../data/portal-i18n";
import { setIssueMarkerAction } from "../actions";

export default async function DrawingViewerPage({ params, searchParams }: { params: Promise<{ id: string; documentId: string }>; searchParams: Promise<{ page?: string; issue?: string; setIssue?: string }> }) {
  const { id, documentId } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canViewProjectIssues(user, id)) notFound();
  const document = getProjectDocument(Number(documentId));
  if (!document || document.projectId !== id || document.mimeType !== "application/pdf") notFound();
  const f = await searchParams, language = await getPortalLanguage(), t = (v: string) => portalText(language, v);
  const canManage = canManageProjectIssues(user, id) && !project.archivedAt;
  const canCapture = canCaptureProjectIssues(user, id) && !project.archivedAt;

  // Set-location mode (from Issue Detail "Set location on drawing"): validate the target issue
  // belongs to this project and the user may manage it.
  let setIssue: { id: number; number: number } | undefined;
  if (f.setIssue && canManage) {
    const issue = getIssue(Number(f.setIssue));
    if (issue && issue.projectId === id) setIssue = { id: issue.id, number: issue.issueNumber };
  }
  const markers = listDocumentMarkers(id, document.id);
  const initialPage = f.page ? Math.max(1, Number(f.page)) : 1;
  const focusIssueId = f.issue ? Number(f.issue) : undefined;

  // Contextual Back (explicit project-scoped return contract, refresh/bookmark-safe): entering
  // from an issue (Show on drawing → ?issue=N, or Set location on drawing → ?setIssue=N) returns
  // to that exact issue; entering from Project → Drawings returns to the drawings list. Derived
  // from the URL only (no browser-history dependence). The referenced issue is validated to this
  // project so a stale/foreign id can never redirect off-project.
  const returnIssue = setIssue ?? (focusIssueId ? (() => { const it = getIssue(focusIssueId); return it && it.projectId === id ? { id: it.id, number: it.issueNumber } : undefined; })() : undefined);
  const back = returnIssue
    ? { href: drawingBackHref(id, returnIssue.id), label: `${t("Back to issue")} #${returnIssue.number}` }
    : { href: drawingBackHref(id, null), label: t("Back to drawings") };

  return <PortalShell active="/portal/projects">
    <BackLink href={back.href} label={back.label} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Drawing")}`} title={document.title} />
    {project.archivedAt && <p className="os-archived-banner">{t("This project is archived and read-only.")}</p>}
    <DrawingViewer projectId={id} doc={{ id: document.id, title: document.title }} markers={markers.map((m) => ({ ...m }))} canCapture={canCapture} canManage={canManage} language={language} initialPage={initialPage} focusIssueId={focusIssueId} setIssue={setIssue} setMarkerAction={setIssueMarkerAction} />
  </PortalShell>;
}

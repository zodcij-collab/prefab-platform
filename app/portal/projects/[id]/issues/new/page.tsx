import { notFound, redirect } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../../components/portal/BackLink";
import { IssueCaptureForm } from "../../../../../../components/portal/IssueCaptureForm";
import { requireUser } from "../../../../../../lib/auth";
import { canCaptureProjectIssues } from "../../../../../../lib/permissions";
import { getProject, getProjectDocument } from "../../../../../../lib/repositories";
import { isValidMarker } from "../../../../../../lib/issues";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { portalText } from "../../../../../../data/portal-i18n";

// Quick site capture. Nothing is written until Save — abandoning this page creates no record
// and consumes no issue number. May arrive pre-populated with a drawing marker (capture-from-
// drawing) — the marker is re-validated here before it is offered to the form.
export default async function NewIssuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ documentId?: string; drawingPage?: string; drawingX?: string; drawingY?: string; intent?: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canCaptureProjectIssues(user, id)) notFound();
  if (project.archivedAt) redirect(`/portal/projects/${id}/issues`);
  const q = await searchParams, language = await getPortalLanguage(), t = (v: string) => portalText(language, v);
  let marker: { documentId: number; page: number; x: number; y: number; title: string } | undefined;
  if (q.documentId && q.drawingPage && q.drawingX && q.drawingY) {
    const page = Number(q.drawingPage), x = Number(q.drawingX), y = Number(q.drawingY), document = getProjectDocument(Number(q.documentId));
    if (document && document.projectId === id && document.mimeType === "application/pdf" && isValidMarker(page, x, y)) marker = { documentId: document.id, page, x, y, title: document.title };
  }
  const defaultIntent = q.intent === "Task" ? "Task" : "Defect";
  return <PortalShell active="/portal/projects">
    <BackLink href={marker ? `/portal/projects/${id}/drawings/${marker.documentId}?page=${marker.page}` : `/portal/projects/${id}/issues`} label={marker ? t("Back to drawing") : t("Back to issues")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Capture")}`} title={t("New capture")} />
    <IssueCaptureForm projectId={id} language={language} marker={marker} defaultIntent={defaultIntent} />
  </PortalShell>;
}

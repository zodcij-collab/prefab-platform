import { notFound, redirect } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../../components/portal/BackLink";
import { IssueCaptureForm } from "../../../../../../components/portal/IssueCaptureForm";
import { requireUser } from "../../../../../../lib/auth";
import { canCaptureProjectIssues } from "../../../../../../lib/permissions";
import { getProject } from "../../../../../../lib/repositories";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { portalText } from "../../../../../../data/portal-i18n";

// Quick site capture. Nothing is written until Save — abandoning this page creates no record
// and consumes no issue number.
export default async function NewIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canCaptureProjectIssues(user, id)) notFound();
  if (project.archivedAt) redirect(`/portal/projects/${id}/issues`);
  const language = await getPortalLanguage();
  const t = (v: string) => portalText(language, v);
  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}/issues`} label={t("Back to issues")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Capture")}`} title={t("New capture")} />
    <IssueCaptureForm projectId={id} language={language} />
  </PortalShell>;
}

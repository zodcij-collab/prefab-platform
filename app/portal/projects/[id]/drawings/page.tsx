import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../components/portal/BackLink";
import { requireUser } from "../../../../../lib/auth";
import { canViewProjectIssues } from "../../../../../lib/permissions";
import { getProject, listProjectDocuments } from "../../../../../lib/repositories";
import { getPortalLanguage } from "../../../../../lib/portal-locale";
import { portalText } from "../../../../../data/portal-i18n";

// Project drawings = the project's PDF documents. Opening one enters the in-portal viewer with
// the issue-marker overlay. Viewing drawings + markers requires issues.view (project scope).
export default async function DrawingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ setIssue?: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canViewProjectIssues(user, id)) notFound();
  const q = await searchParams, language = await getPortalLanguage(), t = (v: string) => portalText(language, v);
  const setIssueQuery = q.setIssue && /^\d+$/.test(q.setIssue) ? `?setIssue=${q.setIssue}` : "";
  const drawings = listProjectDocuments(id).filter((d) => d.mimeType === "application/pdf");
  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Drawings")}`} title={t("Drawings")} />
    <p className="os-help">{t("Open a PDF drawing to view site markers or place a new one on the exact location.")}</p>
    {drawings.length === 0
      ? <p className="os-empty-state">{t("No PDF drawings uploaded yet. Upload PDF drawings in project Documents.")}</p>
      : <section className="os-card-grid">{drawings.map((d) => <Link className="os-drawing-card" key={d.id} href={`/portal/projects/${id}/drawings/${d.id}${setIssueQuery}`}>
          <span className="os-drawing-icon" aria-hidden="true">📐</span>
          <div><strong>{d.title}</strong><span>{t(d.category)}{d.revision ? ` · ${t("Rev.")} ${d.revision}` : ""}</span><small>{d.originalFilename}</small></div>
          <span className="os-drawing-open">{t("Open")} →</span>
        </Link>)}</section>}
  </PortalShell>;
}

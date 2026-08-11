import Link from "next/link";
import {PortalShell,PortalTopbar,StatusBadge} from "../../../components/portal/PortalShell";
import {requireUser} from "../../../lib/auth";
import {canAccessProject,canManageProjects} from "../../../lib/permissions";
import {isGlobalRole} from "../../../lib/project-access";
import {listProjects} from "../../../lib/repositories";
import {getPortalLanguage} from "../../../lib/portal-locale";
import {portalText} from "../../../data/portal-i18n";

export default async function ProjectsPage({searchParams}:{searchParams:Promise<{view?:string}>}){
  const user=await requireUser();
  const language=await getPortalLanguage();
  const t=(v:string)=>portalText(language,v);
  const params=await searchParams;
  const canSeeArchived=isGlobalRole(user.role);
  const showArchived=params.view==="archived"&&canSeeArchived;
  const projects=listProjects().filter((project)=>(showArchived?Boolean(project.archivedAt):!project.archivedAt)&&canAccessProject(user,project.id));
  return <PortalShell active="/portal/projects">
    <PortalTopbar eyebrow={t("Project management")} title={t("Projects")} action={canManageProjects(user)?<Link className="os-primary-action" href="/portal/projects/new">+ {t("New project")}</Link>:undefined}/>
    {canSeeArchived&&<div className="os-tabs" role="tablist">
      <Link className={showArchived?"":"active"} href="/portal/projects" role="tab" aria-selected={!showArchived}>{t("Active projects")}</Link>
      <Link className={showArchived?"active":""} href="/portal/projects?view=archived" role="tab" aria-selected={showArchived}>{t("Archived projects")}</Link>
    </div>}
    <section className="os-card-grid">{projects.map(project=><Link className="os-project-card" href={`/portal/projects/${project.id}`} key={project.id}><div className="os-project-card-top"><span className="os-project-code">PF-{project.id.slice(0,3).toUpperCase()}</span><StatusBadge status={project.archivedAt?"Archived":project.status} label={t(project.archivedAt?"Archived":project.status)}/></div><h2>{project.name}</h2><p>{project.location}<br/>{project.client}</p><div className="os-project-meta"><div><span>{t("Start")}</span><strong className="os-date-value">{project.startDate||"—"}</strong></div><div><span>{t("Target")}</span><strong className="os-date-value">{project.targetDate||"—"}</strong></div></div><div className="os-progress"><i style={{width:`${project.progress}%`}}/></div><footer><span>{t("Project manager")} · {project.manager}</span><span>{t("Open")} →</span></footer></Link>)}</section>
    {projects.length===0&&<p className="os-empty-state">{showArchived?t("No archived projects."):t("No projects yet.")}</p>}
  </PortalShell>;
}

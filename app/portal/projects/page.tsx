import Link from "next/link";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../components/portal/PortalShell";
import { requireUser } from "../../../lib/auth";
import { canManageProjects } from "../../../lib/permissions";
import { listProjects } from "../../../lib/repositories";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = listProjects();
  return <PortalShell active="/portal/projects">
    <PortalTopbar eyebrow="Project management" title="Projects" action={canManageProjects(user) ? <Link className="os-primary-action" href="/portal/projects/new">+ New project</Link> : undefined} />
    <div className="os-toolbar"><div className="os-search">⌕ <input aria-label="Search projects" placeholder="Search projects…" /></div><div className="os-filter">All statuses ▾</div></div>
    <section className="os-card-grid">{projects.map((project) => <Link className="os-project-card" href={`/portal/projects/${project.id}`} key={project.id}><div className="os-project-card-top"><span className="os-project-code">PF-{project.id.slice(0,3).toUpperCase()}</span><StatusBadge status={project.status} /></div><h2>{project.name}</h2><p>{project.location}<br />{project.client}</p><div className="os-project-meta"><div><span>Progress</span><strong>{project.progress}%</strong></div><div><span>Target</span><strong className="os-date-value">{project.targetDate || "—"}</strong></div></div><div className="os-progress"><i style={{ width: `${project.progress}%` }} /></div><footer><span>PM · {project.manager}</span><span>Open →</span></footer></Link>)}</section>
  </PortalShell>;
}

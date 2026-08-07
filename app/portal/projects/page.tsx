import Link from "next/link";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../components/portal/PortalShell";
import { listProjects } from "../../../lib/repositories";

export default function ProjectsPage() {
  const projects = listProjects();
  return <PortalShell active="/portal/projects">
    <PortalTopbar eyebrow="Project management" title="Projects" action={<button className="os-primary-action" type="button">+ New project</button>} />
    <div className="os-toolbar"><div className="os-search">⌕ <input aria-label="Search projects" placeholder="Search projects…" /></div><div className="os-filter">All statuses ▾</div></div>
    <section className="os-card-grid">{projects.map((project) => <Link className="os-project-card" href={`/portal/projects/${project.id}`} key={project.id}><div className="os-project-card-top"><span className="os-project-code">PF-{project.id.slice(0,3).toUpperCase()}</span><StatusBadge status={project.status} /></div><h2>{project.name}</h2><p>{project.location}<br />{project.client}</p><div className="os-project-meta"><div><span>Progress</span><strong>{project.progress}%</strong></div><div><span>People today</span><strong>{project.peopleToday}</strong></div></div><div className="os-progress"><i style={{ width: `${project.progress}%` }} /></div><footer><span>PM · {project.manager}</span><span>Open →</span></footer></Link>)}</section>
  </PortalShell>;
}

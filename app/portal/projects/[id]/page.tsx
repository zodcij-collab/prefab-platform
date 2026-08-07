import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard } from "../../../../components/portal/MetricCard";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../../components/portal/PortalShell";
import { getProject, listDocuments, listProjectEvents, listReports } from "../../../../lib/repositories";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const project = getProject(id); if (!project) notFound();
  const projectDocs = listDocuments().filter((d)=>d.project===project.name||d.project==="All projects");
  const projectReports = listReports().filter((r)=>r.projectId===project.id);
  const events = listProjectEvents(project.id);
  const latestIssueCount = projectReports.slice(0, 7).reduce((sum,r)=>sum+r.issues,0);
  return <PortalShell active="/portal/projects"><PortalTopbar eyebrow={`${project.location} · ${project.client}`} title={project.name} action={<StatusBadge status={project.status} />} />
    <div className="os-project-tabs"><a className="active" href="#overview">Overview</a><a href="#history">History</a><a href="#documents">Documents</a><a href="#reports">Reports</a></div>
    <section className="os-metrics-grid os-metrics-compact" id="overview"><MetricCard value={`${project.progress}%`} label="Progress" note="Overall project" /><MetricCard value={project.peopleToday} label="People today" note="On this project" /><MetricCard value={project.nextDelivery} label="Next delivery" /><MetricCard value={latestIssueCount} label="Recent issues" note="Last 7 reports" /></section>
    <section className="os-dashboard-grid">
      <article className="os-panel os-panel-wide" id="history"><div className="os-panel-head"><div><p>PROJECT HUB</p><h2>Operational timeline</h2></div><span className="os-muted">{events.length} events</span></div><div className="os-event-feed">{events.map((e)=><div className="os-event-row" key={e.id}><time>{e.date}<small>{e.time}</small></time><span className={`os-event-type os-event-${e.type.toLowerCase()}`}>{e.type}</span><section><strong>{e.title}</strong><p>{e.details}</p><small>{e.author}</small></section></div>)}</div></article>
      <article className="os-panel" id="documents"><div className="os-panel-head"><div><p>DOCUMENTS</p><h2>Current set</h2></div><Link href="/portal/documents">View all →</Link></div><div className="os-doc-list">{projectDocs.map((d)=><div key={d.id}><span>{d.category}</span><section><strong>{d.name}</strong><small>{d.revision} · {d.updated}</small></section></div>)}</div></article>
      <article className="os-panel os-panel-wide" id="reports"><div className="os-panel-head"><div><p>REPORTS</p><h2>Daily records</h2></div><Link href="/portal/reports/new">+ Report</Link></div><div className="os-timeline">{projectReports.length?projectReports.slice(0,6).map((r)=><div key={r.id}><time>{r.date}</time><i/><section><strong>{r.work}</strong><span>{r.people} people · {r.deliveries} deliveries · {r.author}</span></section></div>):<p className="os-empty">No daily reports yet.</p>}</div></article>
    </section>
  </PortalShell>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard } from "../../../../components/portal/MetricCard";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../../components/portal/PortalShell";
import { getProject, listDeliveries, listDocuments, listEmployees, listProjectEvents, listProjectIssues, listProjectPhotos, listReports } from "../../../../lib/repositories";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const projectDocs = listDocuments().filter((d) => d.project === project.name || d.project === "All projects");
  const projectReports = listReports().filter((r) => r.projectId === project.id);
  const events = listProjectEvents(project.id);
  const deliveries = listDeliveries(project.id);
  const issues = listProjectIssues(project.id);
  const photos = listProjectPhotos(project.id);
  const people = listEmployees().filter((e) => e.project === project.name);
  const openIssues = issues.filter((issue) => issue.status !== "Closed").length;
  const nextPlannedDelivery = deliveries.find((delivery) => delivery.status === "Planned");

  return <PortalShell active="/portal/projects">
    <PortalTopbar eyebrow={`${project.location} · ${project.client}`} title={project.name} action={<StatusBadge status={project.status} />} />
    <div className="os-project-tabs"><a className="active" href="#overview">Overview</a><a href="#deliveries">Deliveries</a><a href="#issues">Issues</a><a href="#people">People</a><a href="#photos">Photos</a><a href="#documents">Documents</a><a href="#reports">Reports</a><a href="#history">History</a></div>

    <section className="os-metrics-grid os-metrics-compact" id="overview">
      <MetricCard value={`${project.progress}%`} label="Progress" note="Overall project" />
      <MetricCard value={people.length} label="Assigned people" note={`${people.filter((p) => p.status === "On site").length} on site`} />
      <MetricCard value={nextPlannedDelivery ? `${nextPlannedDelivery.deliveryDate} ${nextPlannedDelivery.deliveryTime}` : "—"} label="Next delivery" note={nextPlannedDelivery?.loadRef ?? "No planned load"} />
      <MetricCard value={openIssues} label="Open issues" note={`${issues.length} total records`} />
    </section>

    <section className="os-dashboard-grid">
      <article className="os-panel os-panel-wide" id="deliveries"><div className="os-panel-head"><div><p>LOGISTICS</p><h2>Deliveries</h2></div><span className="os-muted">{deliveries.length} loads</span></div><div className="os-timeline">{deliveries.length ? deliveries.map((d) => <div key={d.id}><time>{d.deliveryDate}<small>{d.deliveryTime}</small></time><i/><section><strong>{d.loadRef} · {d.description}</strong><span>{d.supplier} · {d.status}</span><small>{d.notes}</small></section></div>) : <p className="os-empty">No deliveries registered.</p>}</div></article>

      <article className="os-panel" id="issues"><div className="os-panel-head"><div><p>CONTROL</p><h2>Issues</h2></div><span className="os-muted">{openIssues} open</span></div><div className="os-doc-list">{issues.map((issue) => <div key={issue.id}><span>{issue.priority}</span><section><strong>{issue.title}</strong><small>{issue.category} · {issue.status} · {issue.owner}</small></section></div>)}</div></article>

      <article className="os-panel" id="people"><div className="os-panel-head"><div><p>TEAM</p><h2>People</h2></div><Link href="/portal/employees">Register →</Link></div><div className="os-doc-list">{people.map((person) => <div key={person.id}><span>{person.status}</span><section><strong>{person.name}</strong><small>{person.role}</small></section></div>)}</div></article>

      <article className="os-panel" id="photos"><div className="os-panel-head"><div><p>PHOTO LOG</p><h2>Site photos</h2></div><span className="os-muted">{photos.length} records</span></div><div className="os-doc-list">{photos.map((photo) => <div key={photo.id}><span>{photo.photoDate}</span><section><strong>{photo.caption}</strong><small>{photo.area} · {photo.author}</small></section></div>)}</div></article>

      <article className="os-panel" id="documents"><div className="os-panel-head"><div><p>DOCUMENTS</p><h2>Current set</h2></div><Link href="/portal/documents">View all →</Link></div><div className="os-doc-list">{projectDocs.map((d) => <div key={d.id}><span>{d.category}</span><section><strong>{d.name}</strong><small>{d.revision} · {d.updated}</small></section></div>)}</div></article>

      <article className="os-panel os-panel-wide" id="reports"><div className="os-panel-head"><div><p>REPORTS</p><h2>Daily records</h2></div><Link href="/portal/reports/new">+ Report</Link></div><div className="os-timeline">{projectReports.length ? projectReports.slice(0, 6).map((r) => <div key={r.id}><time>{r.date}</time><i/><section><strong>{r.work}</strong><span>{r.people} people · {r.deliveries} deliveries · {r.issues} issues · {r.author}</span></section></div>) : <p className="os-empty">No daily reports yet.</p>}</div></article>

      <article className="os-panel os-panel-wide" id="history"><div className="os-panel-head"><div><p>PROJECT HUB</p><h2>Operational timeline</h2></div><span className="os-muted">{events.length} events</span></div><div className="os-event-feed">{events.map((e) => <div className="os-event-row" key={e.id}><time>{e.date}<small>{e.time}</small></time><span className={`os-event-type os-event-${e.type.toLowerCase()}`}>{e.type}</span><section><strong>{e.title}</strong><p>{e.details}</p><small>{e.author}</small></section></div>)}</div></article>
    </section>
  </PortalShell>;
}

import Link from "next/link";
import { PortalShell, PortalTopbar } from "../../../components/portal/PortalShell";
import { listReports } from "../../../lib/repositories";

function displayDate(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
export default function ReportsPage() {
  const reports = listReports();
  return <PortalShell active="/portal/reports"><PortalTopbar eyebrow="Site reporting" title="Daily reports" action={<Link className="os-primary-action" href="/portal/reports/new">+ New report</Link>} /><div className="os-toolbar"><div className="os-search">⌕ <input aria-label="Search reports" placeholder="Search reports…" /></div><div className="os-filter">All dates ▾</div></div><section className="os-report-grid">{reports.map((report) => <article className="os-report-card" key={report.id}><header><div><span>{displayDate(report.date)}</span><h2>{report.project}</h2></div><strong>{report.people}<small>people</small></strong></header><p>{report.work}</p><footer><span>{report.deliveries} deliveries</span><span>{report.issues} issues</span><span>{report.author}</span></footer></article>)}</section></PortalShell>;
}

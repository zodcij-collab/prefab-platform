import Link from "next/link";
import { PortalShell, PortalTopbar } from "../../../../components/portal/PortalShell";
import { listProjects } from "../../../../lib/repositories";
import { createDailyReportAction } from "./actions";
import { appToday } from "../../../../lib/datetime";
import { requireUser } from "../../../../lib/auth";
import { canManageProjectOperations } from "../../../../lib/permissions";

export default async function NewReportPage() {
  const user=await requireUser();
  if(!canManageProjectOperations(user))return <PortalShell active="/portal/reports"><PortalTopbar eyebrow="Site reporting" title="New daily report"/><section className="os-panel"><h2>Restricted</h2><p>Your role does not allow official Daily Report creation.</p><Link href="/portal/reports">View daily reports</Link></section></PortalShell>;
  const projects = listProjects().filter((p) => p.status === "Active");
  return <PortalShell active="/portal/reports">
    <PortalTopbar eyebrow="Site reporting · 2 minute workflow" title="New daily report" />
    <form action={createDailyReportAction} className="os-report-form">
      <section className="os-form-section"><div><span>01</span><h2>Project & team</h2></div><div className="os-form-grid"><label>Project<select name="projectId" defaultValue="" required><option value="" disabled>Select project</option>{projects.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label>Date<input name="date" type="date" defaultValue={appToday()} required /></label><label>People on site<input name="people" type="number" min="0" defaultValue="8" required /></label><label>Weather<select name="weather" defaultValue="Dry"><option>Dry</option><option>Rain</option><option>Snow</option><option>Wind</option></select></label></div></section>
      <section className="os-form-section"><div><span>02</span><h2>Work completed</h2></div><label>What was completed today?<textarea name="work" rows={5} required placeholder="Installed wall panels A01–A08, welded connections, prepared vertical joints…" /></label></section>
      <section className="os-form-section"><div><span>03</span><h2>Logistics & issues</h2></div><div className="os-form-grid"><label>Deliveries received<input name="deliveries" type="number" min="0" defaultValue="0" /></label><label>Open issues<input name="issues" type="number" min="0" defaultValue="0" /></label></div><label>Notes / blockers<textarea name="notes" rows={4} placeholder="Anything management should know before tomorrow…" /></label></section>
      <section className="os-form-section"><div><span>04</span><h2>Photos</h2></div><div className="os-upload-zone"><strong>Photo storage comes next.</strong><span>The report itself is now saved to the database.</span></div></section>
      <div className="os-form-actions"><Link href="/portal/reports">Cancel</Link><button className="os-primary-action os-primary-action-dark" type="submit">Submit report →</button></div>
    </form>
  </PortalShell>;
}

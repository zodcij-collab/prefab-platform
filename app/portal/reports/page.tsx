import Link from "next/link";
import {PortalShell,PortalTopbar,StatusBadge} from "../../../components/portal/PortalShell";
import {BackLink} from "../../../components/portal/BackLink";
import {listProjects,listReports} from "../../../lib/repositories";
import {requireUser} from "../../../lib/auth";
import {canAccessProject,canManageProjectOperations} from "../../../lib/permissions";
import {getPortalLanguage} from "../../../lib/portal-locale";
import {portalText} from "../../../data/portal-i18n";
import {appToday,formatAppDate} from "../../../lib/datetime";

export default async function ReportsPage({searchParams}:{searchParams:Promise<{q?:string;project?:string;reporter?:string;status?:string;from?:string;to?:string;success?:string;report?:string}>}){
  const user=await requireUser(),language=await getPortalLanguage(),t=(value:string)=>portalText(language,value),params=await searchParams;
  const projects=listProjects().filter((project)=>canAccessProject(user,project.id)),q=(params.q??"").trim().toLocaleLowerCase();
  const reports=listReports().filter((report)=>projects.some((project)=>project.id===report.projectId)).filter((report)=>!q||`${report.project} ${report.author} ${report.work}`.toLocaleLowerCase().includes(q)).filter((report)=>!params.project||report.projectId===params.project).filter((report)=>!params.reporter||report.author.toLocaleLowerCase().includes(params.reporter.toLocaleLowerCase())).filter((report)=>!params.status||report.status===params.status).filter((report)=>!params.from||report.date>=params.from).filter((report)=>!params.to||report.date<=params.to);
  const [defaultYear,defaultMonth]=appToday().split("-");
  const backProject=params.project&&projects.some((project)=>project.id===params.project)?params.project:"";
  return <PortalShell active="/portal/reports">
    <BackLink href={backProject?`/portal/projects/${backProject}`:"/portal/projects"} label={backProject?t("Back to project"):t("Back to projects")}/>
    <PortalTopbar eyebrow={t("Site reporting")} title={t("Daily reports")} action={canManageProjectOperations(user)?<Link className="os-primary-action" href="/portal/reports/new">+ {t("New report")}</Link>:undefined}/>
    {params.success&&<p className="os-form-success os-report-success" role="status">{t(params.success==="approved"?"Report saved and approved successfully.":params.success==="submitted"?"Report submitted successfully.":params.success==="deleted"?"Draft report deleted.":"Draft report saved.")}</p>}
    <section className="os-panel os-report-archive-panel">
      <div><p>{t("Site inspection paper archive").toUpperCase()}</p><h2>{t("Monthly Daily Reports archive")}</h2><span>{t("Generate one authorized, chronological A4 PDF for physical site filing.")}</span></div>
      <form action="/portal/reports/archive" method="get">
        <label>{t("Project")}<select name="project" required defaultValue=""><option value="" disabled>{t("Select project")}</option>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>{t("Month")}<select name="month" defaultValue={defaultMonth}>{Array.from({length:12},(_,index)=>String(index+1).padStart(2,"0")).map((month)=><option value={month} key={month}>{month}</option>)}</select></label>
        <label>{t("Year")}<input name="year" type="number" min="2000" max="2100" defaultValue={defaultYear}/></label>
        <button className="os-secondary-action" type="submit">{t("Download monthly PDF")}</button>
      </form>
    </section>
    <form className="os-filter-grid" method="get"><input name="q" aria-label={t("Search reports")} placeholder={t("Search reports…")} defaultValue={params.q}/><select name="project" defaultValue={params.project??""}><option value="">{t("All projects")}</option>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select><input name="reporter" placeholder={t("Reporter")} defaultValue={params.reporter}/><select name="status" defaultValue={params.status??""}><option value="">{t("All statuses")}</option>{["Draft","Submitted","Approved"].map((status)=><option value={status} key={status}>{t(status)}</option>)}</select><label>{t("From")}<input name="from" type="date" defaultValue={params.from}/></label><label>{t("To")}<input name="to" type="date" defaultValue={params.to}/></label><button className="os-secondary-action" type="submit">{t("Filter")}</button></form>
    <section className="os-report-grid">{reports.map((report)=><Link className="os-report-card" href={`/portal/reports/${report.id}`} key={report.id}><header><div><span>{formatAppDate(`${report.date}T12:00:00Z`)}</span><h2>{report.project}</h2></div><StatusBadge status={report.status} label={t(report.status)}/></header><p>{report.work||t("Draft report")}</p><footer><span>{report.people} {t("people")}</span><span>{report.author}</span><span>{t("Open")} →</span></footer></Link>)}</section>
    {reports.length===0&&<p className="os-empty-state">{t("No reports match these filters.")}</p>}
  </PortalShell>;
}

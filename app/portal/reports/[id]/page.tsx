import Link from "next/link";
import {notFound} from "next/navigation";
import {PortalShell,PortalTopbar,StatusBadge} from "../../../../components/portal/PortalShell";
import {ReportMediaUploadForm} from "../../../../components/portal/ReportMediaUploadForm";
import {DailyReportExportMenu} from "../../../../components/portal/DailyReportExportMenu";
import {ReportApprovalForm} from "../../../../components/portal/ReportApprovalForm";
import {DestructiveAction} from "../../../../components/portal/DestructiveAction";
import {getReport,getUserAccess,listAttendanceForReport,listReportElements,listReportPhotos,listReportWeather} from "../../../../lib/repositories";
import {requireUser} from "../../../../lib/auth";
import {canAccessProject,canManageProjectOperations,canReviewDailyReports} from "../../../../lib/permissions";
import {getPortalLanguage} from "../../../../lib/portal-locale";
import {portalText} from "../../../../data/portal-i18n";
import {formatAppDateTime} from "../../../../lib/datetime";
import {dailyReportRevision} from "../../../../lib/daily-report-pdf";
import {approveDailyReportAction,deleteDraftReportAction} from "../new/actions";

export default async function ReportPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const report=getReport(Number(id));
  if(!report)notFound();
  const user=await requireUser();
  if(!canAccessProject(user,report.projectId))notFound();
  const language=await getPortalLanguage();
  const t=(value:string)=>portalText(language,value);
  const entries=listAttendanceForReport(report.id),photos=listReportPhotos(report.id),elements=listReportElements(report.id),weather=listReportWeather(report.id);
  const approvedBy=report.approvedById?getUserAccess(report.approvedById)?.name??"":"";
  const canEdit=(report.status==="Draft"&&report.reporterUserId===user.id)||canReviewDailyReports(user);
  const canUpload=canManageProjectOperations(user);
  const canDeleteDraft=report.status==="Draft"&&(canReviewDailyReports(user)||(canManageProjectOperations(user)&&report.reporterUserId===user.id));
  return <PortalShell active="/portal/reports"><div className="os-report-print">
    <PortalTopbar eyebrow={`${report.project} · ${report.date} · #${report.id}`} title={t("Daily report")} action={<>
      <DailyReportExportMenu reportId={report.id} project={report.project} date={report.date} language={language}/>
      <StatusBadge status={report.status} label={t(report.status)}/>
      {canEdit&&report.status!=="Approved"&&<Link className="os-secondary-action os-print-hide" href={`/portal/reports/${report.id}/edit`}>{t("Edit")}</Link>}
      {canReviewDailyReports(user)&&report.status==="Submitted"&&<ReportApprovalForm action={approveDailyReportAction} reportId={report.id} language={language}/>}
      {canDeleteDraft&&<DestructiveAction action={deleteDraftReportAction} itemLabel={`#${report.id} · ${report.project} · ${report.date}`} itemType={t("Draft Daily Report")} fields={{reportId:report.id}} language={language} triggerLabel={t("Delete draft")}/>}
    </>}/>
    <section className="os-report-official-meta">
      <Meta label={t("Project")} value={report.project}/><Meta label={t("Report reference")} value={`#${report.id}`}/><Meta label={t("Report date")} value={report.date}/><Meta label={t("Report status")} value={t(report.status)}/><Meta label={t("Prepared by")} value={report.author}/>
      {report.status==="Approved"&&<Meta label={t("Approved by")} value={approvedBy||t("Unknown approver")}/>}<Meta label={t("Revision")} value={dailyReportRevision(report)}/><Meta label={t("Generated")} value={formatAppDateTime(new Date().toISOString())}/>
    </section>
    <section className="os-project-summary"><div><span>{t("Reporter")}</span><strong>{report.author}</strong></div><div><span>{t("Weather")}</span><strong>{report.weather||"—"}</strong></div><div><span>{t("General work performed")}</span><p>{report.work||"—"}</p></div></section>
    {weather.length>0&&<section className="os-weather-grid os-panel">{weather.map((row)=><article key={row.id}><strong>{row.timepoint}</strong><span>{row.temperature===null?"—":`${row.temperature>0?"+":""}${row.temperature}°C`}</span><small>{t(row.condition)}</small><small>{t("Wind")} {row.windSpeed??"—"} m/s{row.windGust!==null?` · ${t("Gust")} ${row.windGust} m/s`:""}</small><small>{t("Precipitation")} {row.precipitation??"—"} mm</small></article>)}</section>}
    <section className="os-panel"><div className="os-panel-head"><h2>{t("Workforce attendance")}</h2><span>{entries.length} {t("employees")}</span></div><div className="os-attendance-summary">{entries.map((entry)=><article key={entry.id}><div><strong>{entry.employeeName}</strong><small>{t(entry.position)} · {t(entry.status)}</small></div><span>{entry.regularHours} + {entry.overtimeHours} = <strong>{entry.regularHours+entry.overtimeHours} h</strong></span>{entry.comment&&<p>{entry.comment}</p>}</article>)}</div></section>
    <section className="os-panel"><div className="os-panel-head"><h2>{t("Installed elements")}</h2><span>{elements.length}</span></div><div className="os-element-register">{elements.map((element)=><Link className="os-element-card" href={`/portal/projects/${element.projectId}/elements/${element.id}`} key={element.id}><div><strong>{element.code}</strong><StatusBadge status={element.status} label={t(element.status)}/></div><span>{t(element.elementType)} · {element.floor||"—"} · {element.zone||"—"}</span></Link>)}</div></section>
    <section className="os-panel os-report-media-section"><div className="os-panel-head"><div><p>{t("Site-day evidence").toUpperCase()}</p><h2>{t("Photos / Attachments")}</h2></div><span>{photos.length} {t("photos")}</span></div>{photos.length>0?<div className="os-photo-grid">{photos.map((photo)=><article key={photo.id}><Link href={`/portal/files/photos/${photo.id}`} target="_blank"><div className="os-photo-image" role="img" aria-label={photo.caption} style={{backgroundImage:`url(/portal/files/photos/${photo.id})`}}/></Link><div><strong>{photo.caption}</strong><span>{photo.photoDate}{photo.area?` · ${photo.area}`:""}</span><small>{photo.author} · {formatAppDateTime(photo.uploadedAt)}</small><small>{photo.originalFilename}</small>{photo.notes&&<p>{photo.notes}</p>}</div></article>)}</div>:<p className="os-empty-state">{t("No photos are attached to this Daily Report.")}</p>}{canUpload&&<details className="os-report-media-uploader"><summary>+ {t("Attach photos")}</summary><ReportMediaUploadForm reportId={report.id} language={language}/></details>}</section>
    <section className="os-workspace-grid"><ReportText title={t("Materials / deliveries")} value={report.materials}/><ReportText title={t("Equipment used")} value={report.equipment}/><ReportText title={t("Problems / delays")} value={report.problems}/><ReportText title={t("Safety observations")} value={report.safety}/><ReportText title={t("Additional notes")} value={report.additionalNotes}/></section>
  </div></PortalShell>;
}

function Meta({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>}
function ReportText({title,value}:{title:string;value:string}){return <article className="os-panel"><div className="os-panel-head"><h2>{title}</h2></div><p>{value||"—"}</p></article>}

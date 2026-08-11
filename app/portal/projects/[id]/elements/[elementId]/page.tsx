import Link from "next/link";
import {notFound} from "next/navigation";
import {PortalShell,PortalTopbar,StatusBadge} from "../../../../../../components/portal/PortalShell";
import {BackLink} from "../../../../../../components/portal/BackLink";
import {requireUser} from "../../../../../../lib/auth";
import {canCorrectElementInstallation,canManageProjectElements,canViewProjectElements} from "../../../../../../lib/permissions";
import {getProjectElement,listElementHistory} from "../../../../../../lib/repositories";
import {getPortalLanguage} from "../../../../../../lib/portal-locale";
import {portalText} from "../../../../../../data/portal-i18n";
import {formatAppDateTime} from "../../../../../../lib/datetime";
import {archiveElementAction,correctElementAction} from "../actions";

export default async function ElementPage({params}:{params:Promise<{id:string;elementId:string}>}){
  const {id,elementId}=await params,user=await requireUser(),element=getProjectElement(Number(elementId));
  if(!element||element.projectId!==id||!canViewProjectElements(user,id))notFound();
  const language=await getPortalLanguage(),t=(value:string)=>portalText(language,value),history=listElementHistory(element.id),canManage=canManageProjectElements(user,id);
  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}/elements`} label={t("Back to element register")}/>
    <PortalTopbar eyebrow={element.projectName} title={element.code} action={<><StatusBadge status={element.status} label={t(element.status)}/>{canManage&&<Link className="os-secondary-action" href={`/portal/projects/${id}/elements/${element.id}/edit`}>{t("Edit")}</Link>}</>}/>
    <div className="os-project-tabs"><Link href={`/portal/projects/${id}/elements`}>{t("Element register")}</Link><span className="active">{element.code}</span></div>
    <section className="os-project-summary"><div><span>{t("Element type")}</span><strong>{t(element.elementType)}</strong></div><div><span>{t("Floor / level")} · {t("Zone / section")}</span><strong>{element.floor||"—"} · {element.zone||"—"}</strong></div><div><span>{t("Drawing / reference")}</span><strong>{element.drawingRef||"—"}</strong></div></section>
    <section className="os-workspace-grid">
      <article className="os-panel"><h2>{t("Description")}</h2><p>{element.description||"—"}</p><p>{t("Supplier")}: <strong>{element.supplier||"—"}</strong></p><p>{t("Planned delivery date")}: {element.plannedDeliveryDate||"—"}</p><p>{t("Actual delivery date")}: {element.actualDeliveryDate||"—"}</p><p>{t("Installation date")}: {element.installationDate||"—"}</p>{element.installedReportId&&<Link href={`/portal/reports/${element.installedReportId}`}>{t("Daily report")} #{element.installedReportId} →</Link>}</article>
      <article className="os-panel"><h2>{t("Notes")}</h2><p>{element.issueNote||element.notes||"—"}</p>{element.status==="Installed"&&canCorrectElementInstallation(user,id)&&<form action={correctElementAction} className="os-mini-form"><input type="hidden" name="id" value={element.id}/><label>{t("Status")}<select name="status"><option value="On site">{t("On site")}</option><option value="Issue">{t("Issue")}</option><option value="Rejected / Hold">{t("Rejected / Hold")}</option></select></label><label className="wide">{t("Correction note")}<textarea name="note" required maxLength={1000}/></label><button type="submit">{t("Correct installation")}</button></form>}{canManage&&!element.installedReportId&&<form action={archiveElementAction}><input type="hidden" name="id" value={element.id}/><button className="os-delete-trigger" type="submit">{t("Archive element")}</button></form>}</article>
      <article className="os-panel os-workspace-full"><div className="os-panel-head"><h2>{t("Element history")}</h2><span>{history.length}</span></div><div className="os-event-feed">{history.map((event)=><div className="os-event-row" key={event.id}><time>{formatAppDateTime(event.createdAt)}</time><span className="os-event-type">{t(event.toStatus)}</span><section><strong>{event.fromStatus?`${t(event.fromStatus)} → `:""}{t(event.toStatus)}</strong><p>{localizeHistoryNote(event.note,t)}</p><small>{event.actor}{event.reportId?` · #${event.reportId}`:""}</small></section></div>)}</div></article>
    </section>
  </PortalShell>;
}

function localizeHistoryNote(note:string,t:(value:string)=>string){
  const installed=note.match(/^Installed through Daily Report (#\d+)$/);
  if(installed)return `${t("Installed through Daily Report")} ${installed[1]}`;
  return ["Created manually","Imported from CSV","Archived"].includes(note)?t(note):note;
}

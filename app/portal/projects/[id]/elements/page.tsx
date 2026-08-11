import Link from "next/link";
import {notFound} from "next/navigation";
import {PortalShell,PortalTopbar} from "../../../../../components/portal/PortalShell";
import {BackLink} from "../../../../../components/portal/BackLink";
import {MetricCard} from "../../../../../components/portal/MetricCard";
import {ElementBulkRegister} from "../../../../../components/portal/ElementBulkRegister";
import {ElementSyncSuccess} from "../../../../../components/portal/ElementSyncSuccess";
import {requireUser} from "../../../../../lib/auth";
import {canManageProjectElements,canUpdateElementOperations,canViewProjectElements} from "../../../../../lib/permissions";
import {getProject,listProjectElements} from "../../../../../lib/repositories";
import {elementProgress,elementStatuses,elementTypes} from "../../../../../lib/elements";
import {getPortalLanguage} from "../../../../../lib/portal-locale";
import {portalText} from "../../../../../data/portal-i18n";
import {bulkElementStatusAction} from "./bulk-actions";

export default async function ElementsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{q?:string;floor?:string;zone?:string;type?:string;status?:string}>}){
  const {id}=await params,user=await requireUser(),project=getProject(id);
  if(!project||!canViewProjectElements(user,id))notFound();
  const filters=await searchParams,language=await getPortalLanguage(),t=(v:string)=>portalText(language,v),all=listProjectElements(id),rows=listProjectElements(id,filters),progress=elementProgress(all),floors=[...new Set(all.map((row)=>row.floor).filter(Boolean))],zones=[...new Set(all.map((row)=>row.zone).filter(Boolean))],canManage=canManageProjectElements(user,id),canOperate=canUpdateElementOperations(user,id);
  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")}/>
    <PortalTopbar eyebrow={project.name} title={t("Element register")} action={<>{canManage&&<Link className="os-secondary-action" href={`/portal/projects/${id}/elements/import`}>{t("Import CSV")}</Link>}{canManage&&<Link className="os-secondary-action" href={`/portal/projects/${id}/elements/sync`}>{t("Synchronize XLSX")}</Link>}{canManage&&<Link className="os-primary-action" href={`/portal/projects/${id}/elements/new`}>+ {t("Add element")}</Link>}</>}/>
    <ElementSyncSuccess language={language}/>
    <div className="os-project-tabs"><Link href={`/portal/projects/${id}`}>{t("Overview")}</Link><Link className="active" href={`/portal/projects/${id}/elements`}>{t("Element register")}</Link></div>
    <section className="os-metrics-grid os-metrics-compact"><MetricCard value={progress.total} label={t("Total elements")} note={project.name}/><MetricCard value={`${progress.installed} / ${progress.total}`} label={t("Installed")} note={`${progress.percentage}%`}/><MetricCard value={progress.remaining} label={t("Remaining")} note={t("Available for installation")}/><MetricCard value={all.filter((row)=>row.status==="Issue"||row.status==="Rejected / Hold").length} label={t("Issue")} note={t("Control")}/></section>
    <form className="os-filter-grid" method="get"><input name="q" defaultValue={filters.q} placeholder={t("Element code / mark")}/><select name="floor" defaultValue={filters.floor??""}><option value="">{t("Floor / level")}</option>{floors.map((value)=><option key={value}>{value}</option>)}</select><select name="zone" defaultValue={filters.zone??""}><option value="">{t("Zone / section")}</option>{zones.map((value)=><option key={value}>{value}</option>)}</select><select name="type" defaultValue={filters.type??""}><option value="">{t("Element type")}</option>{elementTypes.map((value)=><option key={value} value={value}>{t(value)}</option>)}</select><select name="status" defaultValue={filters.status??""}><option value="">{t("All statuses")}</option>{elementStatuses.map((value)=><option key={value} value={value}>{t(value)}</option>)}</select><button className="os-secondary-action" type="submit">{t("Filter")}</button></form>
    <ElementBulkRegister projectId={id} rows={rows.map((row)=>({...row}))} action={bulkElementStatusAction} language={language} canOperate={canOperate}/>
    {!rows.length&&<p className="os-empty-state">{t("No elements match these filters.")}</p>}
    <section className="os-workspace-grid"><article className="os-panel"><div className="os-panel-head"><h2>{t("By element type")}</h2></div>{progress.byType.map((group)=><p key={group.value}>{t(group.value)} <strong>{group.installed} / {group.total}</strong></p>)}</article><article className="os-panel"><div className="os-panel-head"><h2>{t("By floor")}</h2></div>{progress.byFloor.map((group)=><p key={group.value}>{group.value} <strong>{group.installed} / {group.total}</strong></p>)}</article></section>
  </PortalShell>;
}

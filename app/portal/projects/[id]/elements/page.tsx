import Link from "next/link";
import {notFound} from "next/navigation";
import {PortalShell,PortalTopbar} from "../../../../../components/portal/PortalShell";
import {BackLink} from "../../../../../components/portal/BackLink";
import {MetricCard} from "../../../../../components/portal/MetricCard";
import {ElementBulkRegister} from "../../../../../components/portal/ElementBulkRegister";
import {InstallationZoneManager} from "../../../../../components/portal/InstallationZoneManager";
import {ElementSyncSuccess} from "../../../../../components/portal/ElementSyncSuccess";
import {requireUser} from "../../../../../lib/auth";
import {canManageProjectElements,canUpdateElementOperations,canViewProjectElements} from "../../../../../lib/permissions";
import {getProject,listInstallationZones,listProjectElements} from "../../../../../lib/repositories";
import {elementProgress,elementStatuses,elementTypes} from "../../../../../lib/elements";
import {getPortalLanguage} from "../../../../../lib/portal-locale";
import {portalText} from "../../../../../data/portal-i18n";
import {bulkElementStatusAction} from "./bulk-actions";
import {assignInstallationZoneAction,createInstallationZoneAction,deleteInstallationZoneAction,renameInstallationZoneAction} from "./zone-actions";

export default async function ElementsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{q?:string;floor?:string;zone?:string;type?:string;status?:string;izone?:string}>}){
  const {id}=await params,user=await requireUser(),project=getProject(id);
  if(!project||!canViewProjectElements(user,id))notFound();
  const filters=await searchParams,language=await getPortalLanguage(),t=(v:string)=>portalText(language,v),all=listProjectElements(id),installZones=listInstallationZones(id);
  const elementFilters={q:filters.q,floor:filters.floor,zone:filters.zone,type:filters.type,status:filters.status,...(filters.izone==="none"?{unassignedZone:true}:filters.izone?{installationZoneId:Number(filters.izone)}:{})};
  const rows=listProjectElements(id,elementFilters),progress=elementProgress(all),floors=[...new Set(all.map((row)=>row.floor).filter(Boolean))],zones=[...new Set(all.map((row)=>row.zone).filter(Boolean))],canManage=canManageProjectElements(user,id),canOperate=canUpdateElementOperations(user,id),writable=canManage&&!project.archivedAt;
  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")}/>
    <PortalTopbar eyebrow={project.name} title={t("Element register")} action={<>{canManage&&<Link className="os-secondary-action" href={`/portal/projects/${id}/elements/import`}>{t("Import CSV")}</Link>}{canManage&&<Link className="os-secondary-action" href={`/portal/projects/${id}/elements/sync`}>{t("Synchronize XLSX")}</Link>}{canManage&&<Link className="os-primary-action" href={`/portal/projects/${id}/elements/new`}>+ {t("Add element")}</Link>}</>}/>
    <ElementSyncSuccess language={language}/>
    <div className="os-project-tabs"><Link href={`/portal/projects/${id}`}>{t("Overview")}</Link><Link className="active" href={`/portal/projects/${id}/elements`}>{t("Element register")}</Link></div>
    <section className="os-metrics-grid os-metrics-compact"><MetricCard value={progress.total} label={t("Total elements")} note={project.name}/><MetricCard value={`${progress.installed} / ${progress.total}`} label={t("Installed")} note={`${progress.percentage}%`}/><MetricCard value={progress.remaining} label={t("Remaining")} note={t("Available for installation")}/><MetricCard value={all.filter((row)=>row.status==="Issue"||row.status==="Rejected / Hold").length} label={t("Issue")} note={t("Control")}/></section>
    <form className="os-filter-grid" method="get"><input name="q" defaultValue={filters.q} placeholder={t("Element code / mark")}/><select name="floor" defaultValue={filters.floor??""}><option value="">{t("Floor / level")}</option>{floors.map((value)=><option key={value}>{value}</option>)}</select><select name="zone" defaultValue={filters.zone??""}><option value="">{t("Zone / section")}</option>{zones.map((value)=><option key={value}>{value}</option>)}</select><select name="type" defaultValue={filters.type??""}><option value="">{t("Element type")}</option>{elementTypes.map((value)=><option key={value} value={value}>{t(value)}</option>)}</select><select name="status" defaultValue={filters.status??""}><option value="">{t("All statuses")}</option>{elementStatuses.map((value)=><option key={value} value={value}>{t(value)}</option>)}</select><select name="izone" defaultValue={filters.izone??""}><option value="">{t("All installation zones")}</option><option value="none">{t("Unassigned")}</option>{installZones.map((zone)=><option key={zone.id} value={zone.id}>{zone.name}</option>)}</select><button className="os-secondary-action" type="submit">{t("Filter")}</button></form>
    {(installZones.length>0||writable)&&<InstallationZoneManager projectId={id} zones={installZones.map((zone)=>({id:zone.id,name:zone.name,description:zone.description,elementCount:zone.elementCount}))} canManage={writable} language={language} createAction={createInstallationZoneAction} renameAction={renameInstallationZoneAction} deleteAction={deleteInstallationZoneAction}/>}
    <ElementBulkRegister projectId={id} rows={rows.map((row)=>({...row}))} action={bulkElementStatusAction} language={language} canOperate={canOperate} zones={installZones.map((zone)=>({id:zone.id,name:zone.name}))} assignAction={canOperate&&!project.archivedAt?assignInstallationZoneAction:undefined}/>
    {!rows.length&&<p className="os-empty-state">{t("No elements match these filters.")}</p>}
    <section className="os-workspace-grid"><article className="os-panel"><div className="os-panel-head"><h2>{t("By element type")}</h2></div>{progress.byType.map((group)=><p key={group.value}>{t(group.value)} <strong>{group.installed} / {group.total}</strong></p>)}</article><article className="os-panel"><div className="os-panel-head"><h2>{t("By floor")}</h2></div>{progress.byFloor.map((group)=><p key={group.value}>{group.value} <strong>{group.installed} / {group.total}</strong></p>)}</article></section>
  </PortalShell>;
}

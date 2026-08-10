import Link from "next/link";
import {notFound} from "next/navigation";
import {PortalShell,PortalTopbar} from "../../../../../../components/portal/PortalShell";
import {ElementSync} from "../../../../../../components/portal/ElementSync";
import {requireUser} from "../../../../../../lib/auth";
import {canManageProjectElements} from "../../../../../../lib/permissions";
import {getProject,listElementImports} from "../../../../../../lib/repositories";
import {getPortalLanguage} from "../../../../../../lib/portal-locale";
import {portalText} from "../../../../../../data/portal-i18n";
import {formatAppDateTime} from "../../../../../../lib/datetime";
import {applyXlsxSyncAction,loadXlsxSyncSessionState,previewXlsxSyncAction} from "./actions";
import {elementReviewKey} from "../../../../../../lib/element-review-session";

export default async function SyncPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{session?:string;stage?:string}>}){
  const{id}=await params,user=await requireUser(),project=getProject(id);
  if(!project||!canManageProjectElements(user,id))notFound();
  const query=await searchParams,language=await getPortalLanguage(),t=(value:string)=>portalText(language,value),imports=listElementImports(id),sessionId=Number(query.session),initialState=Number.isInteger(sessionId)&&sessionId>0?await loadXlsxSyncSessionState(id,sessionId):undefined,stage=initialState?.diff?"preview":"mapping";
  return <PortalShell active="/portal/projects"><PortalTopbar eyebrow={project.name} title={t("XLSX register synchronization")}/><ElementSync key={elementReviewKey(sessionId,stage==="preview")} projectId={id} action={previewXlsxSyncAction} applyAction={applyXlsxSyncAction} language={language} initialState={initialState}/><section className="os-panel"><div className="os-panel-head"><h2>{t("Import revision history")}</h2><span>{imports.length}</span></div><div className="os-event-feed">{imports.map((item)=><div className="os-event-row" key={item.id}><time>{formatAppDateTime(item.importedAt)}</time><span className="os-event-type">{t(item.status)}</span><section><strong>{item.originalFilename} · {item.sourceRevision||`#${item.id}`}</strong><p>{item.importedBy} · {item.worksheetName}</p>{["Mapping","Preview"].includes(item.status)&&<Link href={`/portal/projects/${id}/elements/sync?session=${item.id}&stage=${item.status.toLocaleLowerCase()}`}>{t("Resume review")}</Link>}</section></div>)}</div></section></PortalShell>;
}

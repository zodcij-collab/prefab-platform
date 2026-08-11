import Link from "next/link";
import {PortalShell,PortalTopbar,StatusBadge} from "../../../components/portal/PortalShell";
import {listDocuments,listProjects} from "../../../lib/repositories";
import {getPortalLanguage} from "../../../lib/portal-locale";
import {portalText} from "../../../data/portal-i18n";
import {requireUser} from "../../../lib/auth";
import {permittedProjectIds} from "../../../lib/permissions";

// Sprint 11.3 — the global "Library" is company-level, reusable documentation
// (templates, procedures, standard forms). Project-specific documents live inside
// each project and are intentionally not mixed in here.
export default async function LibraryPage({searchParams}:{searchParams:Promise<{q?:string;category?:string;status?:string}>}){
  const user=await requireUser(),language=await getPortalLanguage(),t=(v:string)=>portalText(language,v),{q="",category="",status=""}=await searchParams,query=q.trim().toLocaleLowerCase();
  const projects=listProjects(),allowedNames=new Set(projects.filter((item)=>permittedProjectIds(user,[item.id]).length>0).map((item)=>item.name));
  const documents=listDocuments().filter((document)=>(document.project==="All projects"||allowedNames.has(document.project))&&(!query||`${document.name} ${document.project} ${document.revision}`.toLocaleLowerCase().includes(query))&&(!category||document.category===category)&&(!status||document.status===status));
  const categories=[...new Set(documents.map((document)=>document.category))].sort();
  return <PortalShell active="/portal/documents">
    <PortalTopbar eyebrow={t("Company documentation library")} title={t("Library")} action={<Link className="os-primary-action" href="/portal/projects">{t("Project documents are inside each project")} →</Link>}/>
    <p className="os-empty-state" style={{marginTop:0}}>{t("The Library holds reusable company documentation such as templates, procedures and standard forms. Project-specific documents are managed inside each project.")}</p>
    <form className="os-filter-grid" method="get"><input aria-label={t("Search documents")} name="q" defaultValue={q} placeholder={t("Search document, project, revision…")}/><select name="category" defaultValue={category} aria-label={t("Filter category")}><option value="">{t("All categories")}</option>{categories.map((item)=><option key={item}>{item}</option>)}</select><select name="status" defaultValue={status}><option value="">{t("All statuses")}</option>{["Current","Review","Draft","Archived","Superseded"].map((item)=><option value={item} key={item}>{t(item)}</option>)}</select><button className="os-secondary-action" type="submit">{t("Filter")}</button></form>
    <div className="os-table-wrap os-table-card"><table className="os-table"><thead><tr><th>{t("Document")}</th><th>{t("Category")}</th><th>{t("Project")}</th><th>{t("Revision")}</th><th>{t("Document date")}</th><th>{t("Status")}</th></tr></thead><tbody>{documents.map((document)=><tr key={`legacy-${document.id}`}><td><strong>{document.name}</strong></td><td>{t(document.category)}</td><td>{document.project}</td><td>{document.revision}</td><td>{document.updated}</td><td><StatusBadge status={document.status} label={t(document.status)}/></td></tr>)}</tbody></table>{documents.length===0&&<p className="os-empty-state">{t("No documents match these filters.")}</p>}</div>
  </PortalShell>;
}

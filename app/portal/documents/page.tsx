import { PortalShell, PortalTopbar, StatusBadge } from "../../../components/portal/PortalShell";
import { listDocuments } from "../../../lib/repositories";

export default function DocumentsPage() {
  const documents = listDocuments();
  return <PortalShell active="/portal/documents"><PortalTopbar eyebrow="Single source of truth" title="Documents" action={<button className="os-primary-action" type="button">↑ Upload document</button>} /><div className="os-toolbar"><div className="os-search">⌕ <input aria-label="Search documents" placeholder="Search document, project, revision…" /></div><div className="os-filter">All categories ▾</div></div><div className="os-table-wrap os-table-card"><table className="os-table"><thead><tr><th>Document</th><th>Category</th><th>Project</th><th>Revision</th><th>Updated</th><th>Status</th></tr></thead><tbody>{documents.map((doc) => <tr key={doc.id}><td><strong>{doc.name}</strong></td><td>{doc.category}</td><td>{doc.project}</td><td>{doc.revision}</td><td>{doc.updated}</td><td><StatusBadge status={doc.status} /></td></tr>)}</tbody></table></div></PortalShell>;
}

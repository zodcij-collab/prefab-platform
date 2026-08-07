import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu";

const nav = [
  ["/portal", "Dashboard", "DB"],
  ["/portal/projects", "Projects", "PR"],
  ["/portal/employees", "Employees", "HR"],
  ["/portal/documents", "Documents", "DO"],
  ["/portal/reports", "Daily reports", "RP"],
  ["/portal/access", "Access & roles", "AC"],
] as const;

export function PortalShell({ children, active }: { children: ReactNode; active: string }) {
  return (
    <main className="os-shell">
      <aside className="os-sidebar">
        <Link className="os-brand" href="/">PREFAB<span>.LV</span></Link>
        <div className="os-product">Corporate Platform</div>
        <nav className="os-nav" aria-label="Portal navigation">
          {nav.map(([href, label, code]) => (
            <Link className={active === href ? "active" : ""} href={href} key={href}>
              <span className="os-nav-code">{code}</span><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="os-sidebar-footer">
          <span className="os-status-dot" /> System online
          <Link href="/">← Public website</Link>
        </div>
      </aside>
      <section className="os-main">{children}</section>
    </main>
  );
}

export function PortalTopbar({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <header className="os-topbar">
      <div><p>{eyebrow}</p><h1>{title}</h1></div>
      <div className="os-topbar-actions">{action}<AccountMenu/></div>
    </header>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`os-badge os-badge-${normalized}`}>{status}</span>;
}

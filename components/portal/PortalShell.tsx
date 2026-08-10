import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu";
import { getPortalLanguage } from "../../lib/portal-locale";
import { portalLanguages,portalText } from "../../data/portal-i18n";
import { setPortalLanguageAction } from "../../app/portal/actions";
import { requireUser } from "../../lib/auth";
import { canViewTimesheets } from "../../lib/permissions";

const nav=[["/portal","Dashboard","DB"],["/portal/projects","Projects","PR"],["/portal/employees","Employees","HR"],["/portal/documents","Documents","DO"],["/portal/reports","Reports","RP"],["/portal/timesheets","Timesheets","TS"],["/portal/access","Access & roles","AC"]] as const;

export async function PortalShell({children,active}:{children:ReactNode;active:string}){const [language,user]=await Promise.all([getPortalLanguage(),requireUser()]);const t=(value:string)=>portalText(language,value);const visibleNav=nav.filter(([href])=>href!=="/portal/timesheets"||canViewTimesheets(user));return <main className="os-shell">
  <aside className="os-sidebar"><Link className="os-brand" href="/">PREFAB<span>.LV</span></Link><div className="os-product">{t("Corporate Platform")}</div>
    <nav className="os-nav" aria-label={t("Portal navigation")}>{visibleNav.map(([href,label,code])=>{const localizedLabel=t(label);const isActive=active===href;return <Link aria-current={isActive?"page":undefined} aria-label={localizedLabel} className={isActive?"active":""} href={href} key={href} title={localizedLabel}><span aria-hidden="true" className="os-nav-code">{code}</span><span className="os-nav-label">{localizedLabel}</span></Link>})}</nav>
    <div className="os-sidebar-footer"><span><span className="os-status-dot"/> {t("System online")}</span><form action={setPortalLanguageAction} className="os-language-switcher" aria-label={t("Languages")}>{portalLanguages.map((item)=><button type="submit" name="language" value={item} className={item===language?"active":""} key={item}>{item.toUpperCase()}</button>)}</form><Link href="/">← {t("Public website")}</Link></div>
  </aside><section className="os-main">{children}</section>
</main>}

export function PortalTopbar({eyebrow,title,action}:{eyebrow:string;title:string;action?:ReactNode}){return <header className="os-topbar"><div><p>{eyebrow}</p><h1>{title}</h1></div><div className="os-topbar-actions">{action}<AccountMenu/></div></header>}

export function StatusBadge({status,label}:{status:string;label?:string}){const normalized=status.toLowerCase().replaceAll(" ","-");return <span className={`os-badge os-badge-${normalized}`}>{label??status}</span>}

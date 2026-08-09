import { logoutAction } from "../../app/portal/actions";
import { requireUser } from "../../lib/auth";
import { getPortalLanguage } from "../../lib/portal-locale";
import { portalText } from "../../data/portal-i18n";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export async function AccountMenu() {
  const user = await requireUser();
  const language=await getPortalLanguage(); const t=(value:string)=>portalText(language,value);

  return <details className="os-account-menu">
    <summary aria-label={`${t("Open account menu")}: ${user.name}`}>
      <span className="os-account-summary"><strong>{user.name}</strong><small>{user.role}</small></span>
      <span className="os-avatar" aria-hidden="true">{initials(user.name)}</span>
    </summary>
    <div className="os-account-popover">
      <span>{t("Signed in as")}</span>
      <strong>{user.name}</strong>
      <small>{user.role}</small>
      <form action={logoutAction}>
        <button type="submit">{t("Sign out")}</button>
      </form>
    </div>
  </details>;
}

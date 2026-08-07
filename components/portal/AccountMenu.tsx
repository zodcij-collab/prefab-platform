import { logoutAction } from "../../app/portal/actions";
import { requireUser } from "../../lib/auth";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export async function AccountMenu() {
  const user = await requireUser();

  return <details className="os-account-menu">
    <summary aria-label={`Open account menu for ${user.name}`}>
      <span className="os-account-summary"><strong>{user.name}</strong><small>{user.role}</small></span>
      <span className="os-avatar" aria-hidden="true">{initials(user.name)}</span>
    </summary>
    <div className="os-account-popover">
      <span>Signed in as</span>
      <strong>{user.name}</strong>
      <small>{user.role}</small>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  </details>;
}

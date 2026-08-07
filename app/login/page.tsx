import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth";
import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/portal");
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-card">
        <Link className="login-brand" href="/">PREFAB<span>.LV</span></Link>
        <p className="login-kicker">CORPORATE PLATFORM</p>
        <h1>Sign in</h1>
        <p>Secure access for PREFAB.LV personnel.</p>
        {error ? <div className="login-error">Incorrect email or password.</div> : null}
        <form action={loginAction} className="login-form">
          <label>Email<input name="email" type="email" autoComplete="email" defaultValue="admin@prefab.lv" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="os-primary-action os-primary-action-dark" type="submit">Sign in →</button>
        </form>
        <small>Local development account is described in README.md.</small>
      </section>
    </main>
  );
}

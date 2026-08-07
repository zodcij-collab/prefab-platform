import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { hashToken, newSessionToken, verifyPassword } from "./security";
import { logActivity } from "./repositories";

const COOKIE = "prefab_session";
const SESSION_DAYS = 7;

export type SessionUser = { id: number; email: string; name: string; role: string };

export async function authenticate(email: string, password: string) {
  const row = db.prepare("SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as (SessionUser & { password_hash: string; active: number }) | undefined;
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) return null;

  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
  db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(row.id, tokenHash, expires.toISOString());
  logActivity({ userId: row.id, actor: row.name, action: "Signed in", entityType: "session", details: row.role });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return { id: row.id, email: row.email, name: row.name, role: row.role } satisfies SessionUser;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `).get(hashToken(token), new Date().toISOString()) as SessionUser | undefined;
  return row ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const user = await getSessionUser();
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    if (user) logActivity({ userId: user.id, actor: user.name, action: "Signed out", entityType: "session" });
  }
  store.delete(COOKIE);
}

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { destroySession, requireUser } from "../../lib/auth";
import { normalizePortalLanguage } from "../../data/portal-i18n";
import { PORTAL_LANGUAGE_COOKIE } from "../../lib/portal-locale";

export async function logoutAction() {
  await destroySession();
  revalidatePath("/portal", "layout");
  redirect("/login");
}

export async function setPortalLanguageAction(data: FormData) {
  const language = normalizePortalLanguage(String(data.get("language") ?? "lv"));
  (await cookies()).set(PORTAL_LANGUAGE_COOKIE, language, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/portal", maxAge: 31536000 });
  revalidatePath("/portal", "layout");
}

export async function ensurePortalUser() {
  return requireUser();
}

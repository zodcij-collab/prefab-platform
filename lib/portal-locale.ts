import { cookies } from "next/headers";
import { normalizePortalLanguage } from "@/data/portal-i18n";

export const PORTAL_LANGUAGE_COOKIE = "prefab_portal_language";

export async function getPortalLanguage() {
  return normalizePortalLanguage((await cookies()).get(PORTAL_LANGUAGE_COOKIE)?.value);
}

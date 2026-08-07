"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, requireUser } from "../../lib/auth";

export async function logoutAction() {
  await destroySession();
  revalidatePath("/portal", "layout");
  redirect("/login");
}

export async function ensurePortalUser() {
  return requireUser();
}

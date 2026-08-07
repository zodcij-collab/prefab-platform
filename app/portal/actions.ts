"use server";
import { redirect } from "next/navigation";
import { destroySession, requireUser } from "../../lib/auth";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function ensurePortalUser() {
  return requireUser();
}

"use server";
import { redirect } from "next/navigation";
import { authenticate } from "../../lib/auth";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await authenticate(email, password);
  if (!user) redirect("/login?error=1");
  redirect("/portal");
}

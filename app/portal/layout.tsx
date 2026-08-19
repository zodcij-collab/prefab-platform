import type { ReactNode } from "react";
import { requireUser } from "../../lib/auth";
import { AssetReloadGuard } from "../../components/portal/AssetReloadGuard";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <>
    <AssetReloadGuard />
    {children}
  </>;
}

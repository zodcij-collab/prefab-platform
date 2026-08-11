import Link from "next/link";

// Destination-aware in-app back control. Prefer passing an explicit parent `href`
// (optionally carrying preserved filter/search params) rather than relying on
// browser history.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="os-back-link" href={href}>
      ← {label}
    </Link>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";

// Renders an employee's profile photo through the authenticated same-origin route. If the image
// cannot load (e.g. the stored file is unavailable), it degrades gracefully to the initials
// avatar rather than showing a broken image. This is the standard avatar fallback — it does not
// change the storage path, the route, or who may view the photo.
export function EmployeePhoto({ employeeId, name }: { employeeId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const initials = name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 3).toUpperCase();

  // A server-rendered <img> can finish loading (and fail) BEFORE React hydrates and attaches the
  // onError handler below — that first error event is dispatched and then lost, and React never
  // replays it, so onError alone leaves a broken image on screen. On mount, detect an image that
  // has already failed: a broken load reports complete === true with naturalWidth === 0.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <div className="os-employee-photo os-employee-photo-fallback" role="img" aria-label={name}>{initials || "—"}</div>;
  return (
    // Private, auth-gated media served no-store; next/image optimization does not apply.
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imgRef} className="os-employee-photo" src={`/portal/files/employee-photo/${employeeId}`} alt={name} onError={() => setFailed(true)} />
  );
}

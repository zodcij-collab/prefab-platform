// Shown immediately while a load page (schedule / editor / new) compiles or renders,
// so a click is acknowledged instantly even when the server render is slow.
export default function LoadsLoading() {
  return (
    <div className="os-route-loading" role="status" aria-live="polite">
      <span className="os-spinner" aria-hidden="true" />
    </div>
  );
}

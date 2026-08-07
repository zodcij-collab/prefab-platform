import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404</p>
      <h1>Lapa nav atrasta.</h1>
      <p>Pieprasītā lapa neeksistē vai vēl nav publicēta.</p>
      <Link className="button primary" href="/">Atgriezties sākumā</Link>
    </main>
  );
}

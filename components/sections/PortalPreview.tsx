import Link from "next/link";
import { Container } from "@/components/ui/Container";

const stats = [
  ["4", "Aktīvi objekti"],
  ["38", "Darbinieki objektos"],
  ["2", "Šodienas piegādes"],
  ["7", "Iesniegti ziņojumi"],
] as const;

export function PortalPreview() {
  return (
    <section className="section portal-preview">
      <Container className="portal-preview-grid">
        <div>
          <p className="eyebrow">PREFAB PLATFORM</p>
          <h2>Viens darba centrs visai komandai.</h2>
          <p className="section-description">Objekti, cilvēki, dokumenti un ikdienas atskaites vienā pārskatāmā sistēmā.</p>
          <Link className="text-link" href="/portal">Atvērt portāla priekšskatījumu →</Link>
        </div>
        <div className="dashboard-mockup">
          <div className="dashboard-topbar">
            <span>PREFAB.LV</span>
            <span>Edvards</span>
          </div>
          <div className="dashboard-content">
            <p>Labdien, Edvard.</p>
            <div className="dashboard-stat-grid">
              {stats.map(([value, label]) => (
                <article key={label}><strong>{value}</strong><span>{label}</span></article>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

import Link from "next/link";
import { Container } from "@/components/ui/Container";

export function Footer() {
  return (
    <footer className="footer">
      <Container>
        <div className="footer-topline" />
        <div className="footer-grid">
          <div>
            <div className="footer-brand">PREFAB<span>.LV</span></div>
            <p>Saliekamo dzelzsbetona konstrukciju montāža un betona darbi Latvijā un Eiropā.</p>
          </div>
          <div>
            <h3>Kontakti</h3>
            <a href="tel:+37129446034">+371 29 446 034</a>
            <a href="mailto:edvards@teamprefabtec.eu">edvards@teamprefabtec.eu</a>
            <span>Pērnavas iela 30, Rīga</span>
          </div>
          <div>
            <h3>Navigācija</h3>
            <a href="#services">Pakalpojumi</a>
            <a href="#projects">Projekti</a>
            <a href="#careers">Karjera</a>
            <Link href="/login">Darbinieku portāls</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 PREFAB.LV SIA</span>
          <span>Reg. No. 40003009726</span>
        </div>
      </Container>
    </footer>
  );
}

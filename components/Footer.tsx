import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { company,socialLinks } from "@/data/site";

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
            <a href="tel:+37129446034">{company.phone}</a>
            <a href={`mailto:${company.email}`}>{company.email}</a>
            <a href={company.website} target="_blank" rel="noreferrer">www.prefab.lv</a>
            <span>{company.address}</span>
          </div>
          <div className="footer-socials"><h3>Follow us</h3>{socialLinks.some((social)=>social.url.startsWith("https://"))?socialLinks.filter((social)=>social.url.startsWith("https://")).map((social)=><a href={social.url} target="_blank" rel="noreferrer" aria-label={`PREFAB.LV on ${social.name}`} key={social.name}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10v7M8 7.5v.1M12 17v-4a3 3 0 0 1 6 0v4M12 10v7"/></svg><span>{social.name}</span></a>):<span className="footer-social-disabled">Sociālie profili drīzumā.</span>}</div>
          <div>
            <h3>Navigācija</h3>
            <a href="#services">Pakalpojumi</a>
            <a href="#projects">Projekti</a>
            <a href="#careers">Karjera</a>
            <Link href="/login">Darbinieku portāls</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 {company.name}</span>
          <span>Reg. No. {company.registrationNumber}</span>
        </div>
      </Container>
    </footer>
  );
}

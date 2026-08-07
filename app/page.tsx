import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/sections/Hero";
import { PortalPreview } from "@/components/sections/PortalPreview";
import { Services } from "@/components/sections/Services";
import { WhyPrecast } from "@/components/sections/WhyPrecast";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="top">
        <Hero />

        <section className="metrics" aria-label="Uzņēmuma galvenie rādītāji">
          <Container className="metrics-grid">
            <div><strong>20+</strong><span>gadu pieredze būvniecībā</span></div>
            <div><strong>50+</strong><span>liela mēroga projekti</span></div>
            <div><strong>EU</strong><span>pieredze Eiropas tirgū</span></div>
            <div><strong>360°</strong><span>process no plāna līdz montāžai</span></div>
          </Container>
        </section>

        <section className="section company-section" id="company">
          <Container className="split-grid">
            <SectionHeading eyebrow="PAR PREFAB.LV" title="Kārtība procesā. Precizitāte montāžā." />
            <div className="body-copy">
              <p>PREFAB.LV organizē un veic saliekamo dzelzsbetona elementu montāžu, betonēšanas, metināšanas un stropēšanas darbus.</p>
              <p>Mūsu darba pamatā ir skaidra montāžas secība, kvalificēta komanda, drošība un kontrolējams rezultāts.</p>
              <a className="text-link" href="#services">Mūsu kompetences →</a>
            </div>
          </Container>
        </section>

        <Services />
        <WhyPrecast />

        <section className="section projects-section" id="projects">
          <Container>
            <SectionHeading eyebrow="PROJEKTI" title="Pieredze, kuru var pārbaudīt objektā." description="Reālie projektu materiāli tiks pievienoti, tiklīdz būs pabeigta foto arhīva atlase." />
            <div className="project-grid">
              <article className="project-card project-large"><span>DAUDZDZĪVOKĻU ĒKAS</span><strong>Saliekamā dzelzsbetona montāža</strong><small>Latvija · 2026</small></article>
              <article className="project-card project-warm"><span>KOMERCOBJEKTI</span><strong>Konstrukcijas un betona darbi</strong><small>Baltija</small></article>
              <article className="project-card project-dark"><span>EIROPAS PROJEKTI</span><strong>Komandas un montāžas vadība</strong><small>Ziemeļeiropa</small></article>
            </div>
          </Container>
        </section>

        <PortalPreview />

        <section className="section dark" id="careers">
          <Container className="split-grid align-center">
            <SectionHeading eyebrow="KARJERA" title="Pievienojies komandai, kas prot būvēt." inverse />
            <div className="body-copy light-copy">
              <p>Meklējam betonētājus, galdniekus, stropētājus, metinātājus un saliekamo konstrukciju montāžas speciālistus.</p>
              <ButtonLink href="#contact" variant="light">Pieteikties darbam</ButtonLink>
            </div>
          </Container>
        </section>

        <section className="section" id="contact">
          <Container className="contact-grid">
            <div>
              <SectionHeading eyebrow="KONTAKTI" title="Sāksim ar sarunu par jūsu projektu." description="Nosūtiet īsu informāciju par objektu, darbu apjomu un plānoto sākumu." />
            </div>
            <form className="contact-form">
              <label>Vārds un uzņēmums<input name="name" type="text" placeholder="Jūsu vārds" /></label>
              <label>E-pasts<input name="email" type="email" placeholder="name@company.lv" /></label>
              <label>Tālrunis<input name="phone" type="tel" placeholder="+371" /></label>
              <label>Ziņa<textarea name="message" rows={4} placeholder="Īss projekta apraksts" /></label>
              <button className="button button-primary" type="submit"><span>Nosūtīt pieprasījumu</span><span>↗</span></button>
            </form>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}

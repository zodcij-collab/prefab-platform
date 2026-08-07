import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";

export function Hero() {
  return (
    <section className="hero">
      <Container className="hero-grid">
        <div className="hero-copy reveal reveal-1">
          <p className="eyebrow">PREFAB.LV · INDUSTRIĀLĀ BŪVNIECĪBA</p>
          <h1>Ātrāk. Precīzāk. Drošāk.</h1>
          <p className="lead">
            Saliekamo dzelzsbetona konstrukciju montāža un betona darbi Baltijas un Ziemeļeiropas klimatam.
          </p>
          <div className="hero-actions">
            <ButtonLink href="#contact">Saņemt piedāvājumu</ButtonLink>
            <ButtonLink href="#projects" variant="secondary">Skatīt projektus</ButtonLink>
          </div>
        </div>

        <div className="hero-stage reveal reveal-2" aria-label="PREFAB.LV būvniecības vizuālais laukums">
          <div className="hero-grid-lines" />
          <div className="concrete-frame frame-a" />
          <div className="concrete-frame frame-b" />
          <div className="crane-line" />
          <div className="orange-slab" />
          <div className="hero-caption">
            <span>01</span>
            <p>Engineered for Nordic conditions.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

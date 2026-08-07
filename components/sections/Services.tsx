import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

const services = [
  ["01", "Saliekamo konstrukciju montāža", "Sienas, dobās pārseguma plātnes, kāpnes, balkoni un parapeti."],
  ["02", "Betona darbi", "Šuvju aizpildīšana, monolītie mezgli, betonēšana un virsmu apstrāde."],
  ["03", "Metāla konstrukcijas", "Montāža, metināšana un savienojumu izpilde atbilstoši projektam."],
  ["04", "Darbu organizēšana", "Montāžas secība, piegāžu koordinēšana, kvalitātes un drošības kontrole."],
] as const;

export function Services() {
  return (
    <section className="section surface" id="services">
      <Container>
        <SectionHeading eyebrow="PAKALPOJUMI" title="No piegādes secības līdz gatavam mezglam." />
        <div className="service-list">
          {services.map(([number, title, text]) => (
            <article className="service-row" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="service-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

const benefits = [
  ["01", "Mazāka laikapstākļu ietekme", "Elementi tiek ražoti kontrolētos rūpnīcas apstākļos, bet objektā notiek ātra montāža."],
  ["02", "Prognozējams grafiks", "Precīza piegāžu un montāžas secība samazina dīkstāves un palīdz kontrolēt termiņus."],
  ["03", "Kontrolēta kvalitāte", "Rūpnieciska ražošana nodrošina ģeometriju, virsmas kvalitāti un atkārtojamību."],
  ["04", "Drošāks objekts", "Mazāk slapjo procesu, mazāk cilvēku darba zonā un skaidri definētas montāžas operācijas."],
] as const;

export function WhyPrecast() {
  return (
    <section className="section why-precast" id="why-precast">
      <Container>
        <SectionHeading
          eyebrow="KĀPĒC PREFAB"
          title="Tehnoloģija, kas atbilst mūsu klimatam."
          description="Saliekamā būvniecība ļauj pārcelt lielu daļu kvalitātes kontroles no būvlaukuma uz rūpnīcu un saīsināt darbu laiku objektā."
        />
        <div className="benefit-grid">
          {benefits.map(([number, title, text]) => (
            <article className="benefit-card" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

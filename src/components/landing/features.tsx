import { FEATURES, FEATURES_ID } from "./content";
import { SectionContainer } from "./section-container";

export function Features() {
  return (
    <section id={FEATURES_ID} aria-labelledby="features-heading" className="scroll-mt-14 py-16">
      <SectionContainer className="grid gap-6">
        <h2 id="features-heading" className="text-lg font-medium text-muted-foreground">
          Everything on the board
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <li key={title} className="grid content-start gap-3 rounded-xl border p-5">
              <Icon className="size-5" aria-hidden />
              <h3 className="font-heading font-bold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </SectionContainer>
    </section>
  );
}

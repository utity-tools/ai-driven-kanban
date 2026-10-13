import { FAQ } from "./content";
import { SectionContainer } from "./section-container";

/** A definition list: every answer is visible and readable without JavaScript. */
export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="py-16">
      <SectionContainer className="grid gap-8">
        <h2
          id="faq-heading"
          className="font-heading text-4xl font-bold tracking-[-0.03em] sm:text-5xl lg:text-6xl"
        >
          FAQ
        </h2>
        <dl className="grid max-w-3xl gap-6">
          {FAQ.map(({ question, answer }) => (
            <div key={question} className="grid gap-2 border-t pt-6">
              <dt className="font-heading text-xl font-bold tracking-[-0.02em]">{question}</dt>
              <dd className="text-muted-foreground">{answer}</dd>
            </div>
          ))}
        </dl>
      </SectionContainer>
    </section>
  );
}

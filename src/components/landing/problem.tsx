import { PROBLEM } from "./content";
import { SectionContainer } from "./section-container";

/** The case for draft-only AI, stated before the product walkthrough. */
export function Problem() {
  return (
    <section aria-labelledby="problem-heading" className="py-16 sm:py-24">
      <SectionContainer className="grid gap-6">
        <h2
          id="problem-heading"
          className="max-w-4xl font-heading text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl"
        >
          {PROBLEM.title}
        </h2>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
          {PROBLEM.body}
        </p>
      </SectionContainer>
    </section>
  );
}

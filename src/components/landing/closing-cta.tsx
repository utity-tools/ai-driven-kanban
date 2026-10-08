import type { Visitor } from "@/lib/auth/demo";

import { LandingCta } from "./landing-cta";
import { SectionContainer } from "./section-container";

export function ClosingCta({ visitor }: { visitor: Visitor }) {
  return (
    <section aria-labelledby="closing-heading" className="bg-muted/40 py-20 sm:py-28">
      <SectionContainer className="grid justify-items-center gap-8 text-center">
        <h2
          id="closing-heading"
          className="font-heading text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl"
        >
          Try it on a real board
        </h2>
        <LandingCta visitor={visitor} />
      </SectionContainer>
    </section>
  );
}

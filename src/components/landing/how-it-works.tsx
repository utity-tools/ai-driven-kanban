import { BrandMark } from "@/components/brand/brand-mark";

import { HOW_IT_WORKS_ID, STEPS } from "./content";
import { MediaPlaceholder } from "./media-placeholder";
import { SectionContainer } from "./section-container";

export function HowItWorks() {
  return (
    <section
      id={HOW_IT_WORKS_ID}
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-14 py-16"
    >
      <SectionContainer className="grid gap-10">
        <h2
          id="how-it-works-heading"
          className="font-heading text-4xl font-bold tracking-[-0.03em] sm:text-5xl lg:text-6xl"
        >
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map(({ eyebrow, title, description, ai }) => (
            <li
              key={title}
              className="grid content-between gap-8 rounded-2xl bg-muted/40 p-6 sm:p-8"
            >
              <div className="grid gap-2">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {ai ? <BrandMark size={16} className="text-ai" /> : null}
                  {eyebrow}
                </p>
                <h3 className="font-heading text-2xl font-bold tracking-[-0.02em]">{title}</h3>
                <p className="max-w-sm text-muted-foreground">{description}</p>
              </div>
              <MediaPlaceholder className="aspect-[4/3]" />
            </li>
          ))}
        </ol>
      </SectionContainer>
    </section>
  );
}

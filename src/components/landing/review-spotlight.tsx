import { REVIEW_SPOTLIGHT } from "./content";
import { LandingVideo } from "./landing-video";
import { SectionContainer } from "./section-container";

/** The review step in focus: copy on one side, a product mock on the other. */
export function ReviewSpotlight() {
  return (
    <section aria-labelledby="review-heading" className="py-16">
      <SectionContainer className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="grid content-start gap-4">
          <p className="text-sm font-medium tracking-wide text-ai-foreground uppercase">
            {REVIEW_SPOTLIGHT.eyebrow}
          </p>
          <h2
            id="review-heading"
            className="font-heading text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl"
          >
            {REVIEW_SPOTLIGHT.title}
          </h2>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            {REVIEW_SPOTLIGHT.body}
          </p>
        </div>
        <LandingVideo
          name={REVIEW_SPOTLIGHT.video}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="aspect-[4/3]"
        />
      </SectionContainer>
    </section>
  );
}

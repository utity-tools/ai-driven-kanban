import { PROMO_VIDEO } from "./content";
import { ExternalLink } from "./external-link";
import { PromoVideoPlayer } from "./promo-video-player";
import { SectionContainer } from "./section-container";

/** The promo video, loaded from YouTube only when the visitor presses play. */
export function PromoVideo() {
  return (
    <section aria-labelledby="promo-heading" className="py-16">
      <SectionContainer className="grid gap-10">
        <div className="grid gap-4">
          <p className="text-sm font-medium tracking-wide text-ai-foreground uppercase">
            {PROMO_VIDEO.eyebrow}
          </p>
          <h2
            id="promo-heading"
            className="font-heading text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl"
          >
            {PROMO_VIDEO.title}
          </h2>
        </div>
        <div className="grid gap-3">
          <PromoVideoPlayer
            youtubeId={PROMO_VIDEO.youtubeId}
            playLabel={PROMO_VIDEO.playLabel}
            frameTitle={PROMO_VIDEO.frameTitle}
          />
          <ExternalLink
            href={`https://www.youtube.com/watch?v=${PROMO_VIDEO.youtubeId}`}
            className="w-fit rounded-md text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {PROMO_VIDEO.watchLabel}
          </ExternalLink>
        </div>
      </SectionContainer>
    </section>
  );
}

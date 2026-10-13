import { ADR_URL, BUILT_WITH, HOW_ITS_BUILT } from "./content";
import { ExternalLink } from "./external-link";
import { SectionContainer } from "./section-container";

export function HowItsBuilt() {
  return (
    <section aria-labelledby="built-heading" className="py-16">
      <SectionContainer className="grid gap-10">
        <div className="grid gap-4">
          <h2
            id="built-heading"
            className="font-heading text-4xl font-bold tracking-[-0.03em] sm:text-5xl lg:text-6xl"
          >
            {HOW_ITS_BUILT.title}
          </h2>
          <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
            {HOW_ITS_BUILT.intro}
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {HOW_ITS_BUILT.pillars.map(({ title, description }) => (
            <div key={title} className="grid content-start gap-2">
              <h3 className="font-heading text-2xl font-bold tracking-[-0.02em]">{title}</h3>
              <p className="text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {BUILT_WITH.map((item, index) => (
            <li key={item} className="flex gap-3">
              {item}
              {/* After the item, so a wrapped line never starts with a separator. */}
              {index < BUILT_WITH.length - 1 ? <span aria-hidden="true">·</span> : null}
            </li>
          ))}
        </ul>
        <ExternalLink
          href={ADR_URL}
          className="w-fit rounded-md text-sm font-medium underline underline-offset-4 outline-none hover:text-ai-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {HOW_ITS_BUILT.adrLabel}
        </ExternalLink>
      </SectionContainer>
    </section>
  );
}

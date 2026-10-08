import { Alert, AlertDescription } from "@/components/ui/alert";
import { DEMO_RETENTION_DAYS, type Visitor } from "@/lib/auth/demo";

import { BoardPreview } from "./board-preview";
import { LandingCta } from "./landing-cta";
import { SectionContainer } from "./section-container";

type Props = { visitor: Visitor; pageError?: string };

/** The first screen: headline, calls to action and a product frame. */
export function Hero({ visitor, pageError }: Props) {
  return (
    <section aria-labelledby="hero-heading" className="pt-14 pb-12 sm:pt-20 lg:pt-24">
      <SectionContainer className="grid justify-items-center gap-8 text-center">
        <h1
          id="hero-heading"
          className="font-heading text-5xl leading-[1.05] font-bold tracking-[-0.04em] text-balance sm:text-7xl lg:text-8xl"
        >
          <span className="block">
            AI{" "}
            <span className="rounded-full bg-ai/10 px-[0.35em] pb-[0.08em]">
              <span
                aria-hidden="true"
                className="mr-[0.18em] inline-block size-[0.22em] rounded-full bg-ai align-middle"
              />
              proposes.
            </span>
          </span>{" "}
          <span className="block">You ack.</span>
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
          A kanban board where AI drafts subtasks, estimates and dependencies. Nothing is saved
          until you accept it.
        </p>
        {pageError ? (
          <Alert variant="destructive" className="max-w-xl text-left">
            <AlertDescription className="text-destructive">{pageError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col items-center gap-3">
          <LandingCta visitor={visitor} />
          {visitor === "signed-out" ? (
            <p className="text-sm text-muted-foreground">
              No sign-up needed. Demo boards are deleted after {DEMO_RETENTION_DAYS} days.
            </p>
          ) : null}
        </div>
        <div className="mt-6 w-full overflow-hidden rounded-2xl border bg-muted/40 text-left shadow-sm">
          <div aria-hidden="true" className="flex gap-1.5 border-b px-4 py-3">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <div className="p-3 sm:p-6 lg:p-10">
            <BoardPreview />
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}

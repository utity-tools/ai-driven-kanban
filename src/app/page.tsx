import {
  type LucideIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareKanbanIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";

import { GitHubIcon } from "@/components/icons/github-icon";
import { BoardPreview } from "@/components/landing/board-preview";
import { LandingCta } from "@/components/landing/landing-cta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_RETENTION_DAYS, landingPageErrorMessage, visitorKind } from "@/lib/auth/demo";
import { getCurrentUser } from "@/lib/auth/session";

const REPO_URL = "https://github.com/utity-tools/ai-driven-kanban";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: SquareKanbanIcon,
    title: "Board with drag and drop",
    description:
      "Columns and cards you can reorder with the mouse, touch or keyboard, with instant feedback.",
  },
  {
    icon: TagIcon,
    title: "Rich card details",
    description: "Markdown descriptions, labels, due dates and members on every card.",
  },
  {
    icon: SparklesIcon,
    title: "AI decomposition, human in the loop",
    description:
      "Coming soon: AI proposes subtasks, estimates and dependencies. Nothing is saved until you review it.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Private by default",
    description:
      "Every board is protected by Postgres Row Level Security, enforced in the database.",
  },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const visitor = visitorKind(user);
  const pageError = landingPageErrorMessage(params.error);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className="rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            AI-Driven Kanban
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Source code on GitHub (opens in a new tab)"
          >
            <GitHubIcon />
          </a>
        </div>
      </header>

      <main className="flex-1">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:py-24"
        >
          <div className="grid gap-6">
            <p className="w-fit rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              Human-in-the-loop AI planning
            </p>
            <h1
              id="hero-heading"
              className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
            >
              AI-Driven Kanban
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              A Kanban board where AI proposes subtasks, estimates and dependencies, and a human
              reviews every proposal before it&apos;s saved.
            </p>
            {pageError ? (
              <Alert variant="destructive" className="max-w-xl">
                <AlertDescription className="text-destructive">{pageError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3">
              <LandingCta visitor={visitor} />
              {visitor === "signed-out" ? (
                <p className="text-sm text-muted-foreground">
                  No sign-up needed. Demo boards are deleted after {DEMO_RETENTION_DAYS} days.
                </p>
              ) : null}
            </div>
          </div>
          <BoardPreview />
        </section>

        <section aria-labelledby="features-heading" className="border-t bg-muted/40">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:py-16">
            <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
              What&apos;s inside
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li
                  key={title}
                  className="grid content-start gap-2 rounded-xl border bg-card p-5 text-card-foreground"
                >
                  <Icon className="size-5" aria-hidden />
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground">
          <p>Built with Next.js, Supabase and the Vercel AI SDK.</p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <GitHubIcon className="size-4" />
            View the source on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

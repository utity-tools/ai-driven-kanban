import { FlaskConicalIcon } from "lucide-react";

import { createAccountFromDemo, exitDemo } from "@/app/(app)/actions";
import { PendingSubmitButton } from "@/components/auth/pending-submit-button";
import { DEMO_RETENTION_DAYS } from "@/lib/auth/demo";

/** Slim notice shown to anonymous (demo) users above the app header. */
export function DemoBanner() {
  return (
    <aside aria-labelledby="demo-banner-text" className="border-b bg-muted text-foreground">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <p id="demo-banner-text" className="flex min-w-0 items-center gap-2">
          <FlaskConicalIcon className="size-4 shrink-0" aria-hidden />
          <span>
            You&apos;re exploring a demo. Your changes are kept for {DEMO_RETENTION_DAYS} days, then
            deleted.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <form action={createAccountFromDemo}>
            <PendingSubmitButton size="sm" pendingLabel="Opening sign-up…">
              Create an account
            </PendingSubmitButton>
          </form>
          <form action={exitDemo}>
            <PendingSubmitButton variant="outline" size="sm" pendingLabel="Exiting…">
              Exit demo
            </PendingSubmitButton>
          </form>
        </div>
      </div>
    </aside>
  );
}

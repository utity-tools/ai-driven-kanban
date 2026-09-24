import Link from "next/link";

import { signOut } from "@/app/(app)/actions";
import { PendingSubmitButton } from "@/components/auth/pending-submit-button";
import { getCurrentUser } from "@/lib/auth/session";

export async function AppHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/boards"
          className="rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          AI-Driven Kanban
        </Link>
        {user ? (
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm text-muted-foreground">
              <span className="sr-only">Signed in as </span>
              {user.email}
            </span>
            <form action={signOut}>
              <PendingSubmitButton variant="outline" size="sm" pendingLabel="Signing out…">
                Sign out
              </PendingSubmitButton>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}

"use client";

import { ArrowRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { openDemo } from "@/app/demo-actions";
import { PendingSubmitButton } from "@/components/auth/pending-submit-button";
import { DEMO_ERROR_PATH, launchDemo } from "@/lib/auth/demo";
import { createClient } from "@/lib/db/client";

type Props = {
  /** The visitor already has an anonymous session ("Continue the demo"). */
  hasDemoSession: boolean;
  className?: string;
};

/**
 * "Try the demo" / "Continue the demo". The anonymous sign-in runs in the
 * browser (see `launchDemo`); a form action keeps the button's pending state
 * until the navigation to the demo board finishes.
 */
export function DemoLauncher({ hasDemoSession, className }: Props) {
  const router = useRouter();

  async function launch() {
    const path = await launchDemo(
      {
        signInAnonymously: async () => {
          const { error } = await createClient().auth.signInAnonymously();
          return { ok: !error };
        },
        openDemo,
      },
      { hasDemoSession },
    );
    if (path === DEMO_ERROR_PATH) router.replace(path);
    else router.push(path);
  }

  return (
    <form action={launch}>
      <PendingSubmitButton
        className={className}
        pendingLabel={hasDemoSession ? "Opening your demo…" : "Starting demo…"}
      >
        {hasDemoSession ? "Continue the demo" : "Try the demo"}
        <ArrowRightIcon aria-hidden data-icon="inline-end" />
      </PendingSubmitButton>
    </form>
  );
}

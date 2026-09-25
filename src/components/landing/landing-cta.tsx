import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { createAccountFromDemo } from "@/app/(app)/actions";
import { PendingSubmitButton } from "@/components/auth/pending-submit-button";
import { buttonVariants } from "@/components/ui/button";
import type { Visitor } from "@/lib/auth/demo";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/auth/redirect";
import { LOGIN_PATH, SIGNUP_PATH } from "@/lib/auth/routes";

import { DemoLauncher } from "./demo-launcher";

const heroSize = "h-10 px-4 text-sm";

/** Calls to action for the landing hero; they depend on who is visiting. */
export function LandingCta({ visitor }: { visitor: Visitor }) {
  if (visitor === "member") {
    return (
      <Link href={DEFAULT_AFTER_LOGIN_PATH} className={buttonVariants({ className: heroSize })}>
        Go to your boards
        <ArrowRightIcon aria-hidden data-icon="inline-end" />
      </Link>
    );
  }

  if (visitor === "demo") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <DemoLauncher hasDemoSession className={heroSize} />
        {/* Signs out first: the proxy keeps signed-in (anonymous) users off /signup. */}
        <form action={createAccountFromDemo}>
          <PendingSubmitButton
            variant="outline"
            className={heroSize}
            pendingLabel="Opening sign-up…"
          >
            Create an account
          </PendingSubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DemoLauncher hasDemoSession={false} className={heroSize} />
      <Link
        href={SIGNUP_PATH}
        className={buttonVariants({ variant: "outline", className: heroSize })}
      >
        Create account
      </Link>
      <Link href={LOGIN_PATH} className={buttonVariants({ variant: "ghost", className: heroSize })}>
        Sign in
      </Link>
    </div>
  );
}

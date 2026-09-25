import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { startDemo } from "@/app/demo-actions";
import { PendingSubmitButton } from "@/components/auth/pending-submit-button";
import { buttonVariants } from "@/components/ui/button";
import type { Visitor } from "@/lib/auth/demo";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/auth/redirect";
import { LOGIN_PATH, SIGNUP_PATH } from "@/lib/auth/routes";

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
      <form action={startDemo}>
        <PendingSubmitButton className={heroSize} pendingLabel="Opening your demo…">
          Continue the demo
          <ArrowRightIcon aria-hidden data-icon="inline-end" />
        </PendingSubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={startDemo}>
        <PendingSubmitButton className={heroSize} pendingLabel="Starting demo…">
          Try the demo
          <ArrowRightIcon aria-hidden data-icon="inline-end" />
        </PendingSubmitButton>
      </form>
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

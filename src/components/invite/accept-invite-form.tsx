"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { type AcceptInviteState, acceptInvite } from "@/lib/invites/actions";

/**
 * "Join board": a POST through a Server Action, never a GET, so link previews
 * and prefetching cannot consume the invite. On success the action redirects.
 */
export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AcceptInviteState, FormData>(
    acceptInvite,
    {},
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} focusableWhenDisabled>
        {pending ? "Joining…" : "Join board"}
      </Button>
    </form>
  );
}

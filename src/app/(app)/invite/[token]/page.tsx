import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createAccountFromDemo } from "@/app/(app)/actions";
import { PendingSubmitButton } from "@/components/auth/pending-submit-button";
import { AcceptInviteForm } from "@/components/invite/accept-invite-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { LOGIN_PATH, loginPathWithNext } from "@/lib/auth/routes";
import { createClient } from "@/lib/db/server";
import { formatInviteDate } from "@/lib/invites/format";
import { invitePath } from "@/lib/invites/link";
import { type InviteView, resolveInviteView } from "@/lib/invites/peek";
import { type InvitePeek, invitePeekSchema, inviteTokenSchema } from "@/lib/invites/schemas";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/members/management";

export const metadata: Metadata = {
  title: "Board invitation",
  // The URL carries a secret: never search-indexed, never sent as a Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function peekInvite(token: string): Promise<InvitePeek | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_board_invite", { p_token: token }).maybeSingle();
  // Never log `error` wholesale or the token: only the code.
  if (error) throw new Error(`get_board_invite failed (${error.code})`);
  if (!data) return null;
  const parsed = invitePeekSchema.safeParse(data);
  if (!parsed.success) throw new Error("get_board_invite returned an unexpected row");
  return parsed.data;
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const validToken = inviteTokenSchema.safeParse(token);

  const user = await getCurrentUser();
  if (!user) {
    // The proxy normally redirects first; this covers a session that expired meanwhile.
    redirect(validToken.success ? loginPathWithNext(invitePath(validToken.data)) : LOGIN_PATH);
  }

  const view: InviteView = validToken.success
    ? resolveInviteView(await peekInvite(validToken.data), { isDemo: user.isAnonymous })
    : { kind: "invalid" };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <Card>
        {view.kind === "pending" && validToken.success ? (
          <PendingInvite view={view} token={validToken.data} />
        ) : (
          <Message view={view} token={validToken.success ? validToken.data : null} />
        )}
      </Card>
    </div>
  );
}

function PendingInvite({
  view,
  token,
}: {
  view: Extract<InviteView, { kind: "pending" }>;
  token: string;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg break-words">
            {view.inviterName} invited you to join {view.boardTitle} as {ROLE_LABELS[view.role]}
          </h1>
        </CardTitle>
        <CardDescription>
          {ROLE_DESCRIPTIONS[view.role]}. This invite expires on {formatInviteDate(view.expiresAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm token={token} />
      </CardContent>
    </>
  );
}

function Message({ view, token }: { view: InviteView; token: string | null }) {
  switch (view.kind) {
    case "pending":
      return null; // rendered by PendingInvite, which needs the validated token
    case "member":
      return (
        <>
          <CardHeader>
            <CardTitle>
              <h1 className="text-lg break-words">
                You&apos;re already a member of {view.boardTitle ?? "this board"}
              </h1>
            </CardTitle>
            <CardDescription>This invite link isn&apos;t needed for you.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href={`/boards/${view.boardId}`} className={buttonVariants()}>
              Open board
            </Link>
          </CardFooter>
        </>
      );
    case "demo":
      return (
        <>
          <CardHeader>
            <CardTitle>
              <h1 className="text-lg">Create an account to join</h1>
            </CardTitle>
            <CardDescription>
              Demo accounts can&apos;t join boards. Create an account and you&apos;ll come back to
              this invitation.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <form action={createAccountFromDemo}>
              {token ? <input type="hidden" name="next" value={invitePath(token)} /> : null}
              <PendingSubmitButton pendingLabel="Opening sign-up…">
                Create an account
              </PendingSubmitButton>
            </form>
          </CardFooter>
        </>
      );
    case "expired":
      return (
        <DeadEnd title="This invite has expired">
          Ask the board owner for a new invite link.
        </DeadEnd>
      );
    case "accepted":
      return (
        <DeadEnd title="This invite has already been used">
          Invite links work once. Ask the board owner for a new one.
        </DeadEnd>
      );
    case "invalid":
      return (
        <DeadEnd title="This invite link is not valid">
          It may have been revoked or mistyped. Ask the board owner for a new one.
        </DeadEnd>
      );
  }
}

function DeadEnd({ title, children }: { title: string; children: string }) {
  return (
    <>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">{title}</h1>
        </CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Link href="/boards" className={buttonVariants({ variant: "outline" })}>
          Go to your boards
        </Link>
      </CardFooter>
    </>
  );
}

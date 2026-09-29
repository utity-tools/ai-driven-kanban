"use client";

import { CheckIcon, CopyIcon, LinkIcon } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GENERIC_ERROR } from "@/lib/boards/action-result";
import { formatInviteDate } from "@/lib/invites/format";
import type { PendingInvite } from "@/lib/invites/pending";
import { type InviteRole, INVITE_ROLES } from "@/lib/invites/schemas";
import { createInvite, revokeInvite } from "@/lib/members/actions";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/members/management";

import { useBoard } from "./board-context";
import { RoleSelect } from "./role-select";

type Created = { url: string; expiresAt: string };

/**
 * "Invite people" (owners only). A new link is shown once, here, and is lost
 * when the dialog closes: only its hash is stored. Pending links can be revoked.
 */
export function InviteSection() {
  const { boardId, membership } = useBoard();
  const headingId = useId();
  const roleLabelId = useId();
  const linkId = useId();

  const [role, setRole] = useState<InviteRole>("editor");
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleCreate() {
    setError(null);
    setCopyStatus(null);
    startCreating(async () => {
      try {
        const result = await createInvite({ boardId, role });
        if (!result.ok) {
          setCreated(null);
          setError(result.error);
          return;
        }
        // Without a known origin the server sends a path: resolve it in the browser.
        const url = new URL(result.url, window.location.origin).href;
        setCreated({ url, expiresAt: result.expiresAt });
      } catch {
        setCreated(null);
        setError(GENERIC_ERROR);
      }
    });
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopyStatus("Link copied to the clipboard.");
    } catch {
      inputRef.current?.select();
      setCopyStatus("Couldn't copy automatically. The link is selected: press Ctrl+C or Cmd+C.");
    }
  }

  if (membership.isDemo) {
    return (
      <section aria-labelledby={headingId} className="grid gap-2 border-t pt-4">
        <h3 id={headingId} className="font-medium">
          Invite people
        </h3>
        <p className="text-sm text-muted-foreground">Create an account to invite people.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="grid gap-3 border-t pt-4">
      <h3 id={headingId} className="font-medium">
        Invite people
      </h3>
      <p className="text-sm text-muted-foreground">
        Create a single-use link and send it to whoever should join. They need an account.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span id={roleLabelId} className="text-sm">
          Invite role
        </span>
        <RoleSelect
          value={role}
          roles={INVITE_ROLES}
          onChange={setRole}
          labelledBy={roleLabelId}
          disabled={creating}
        />
        <Button onClick={handleCreate} disabled={creating} focusableWhenDisabled>
          <LinkIcon aria-hidden />
          {creating ? "Creating…" : "Create invite link"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}.</p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
          <label htmlFor={linkId} className="text-sm font-medium">
            Invite link
          </label>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              id={linkId}
              readOnly
              value={created.url}
              onFocus={(event) => event.currentTarget.select()}
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="outline" onClick={handleCopy}>
              {copyStatus === "Link copied to the clipboard." ? (
                <CheckIcon aria-hidden />
              ) : (
                <CopyIcon aria-hidden />
              )}
              Copy link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This link works once and expires on {formatInviteDate(created.expiresAt)}. It is only
            shown now: if you lose it, revoke it and create another.
          </p>
          <p role="status" className="min-h-4 text-xs">
            {copyStatus}
          </p>
        </div>
      ) : null}

      <PendingInvites invites={membership.pendingInvites} boardId={boardId} />
    </section>
  );
}

function PendingInvites({ invites, boardId }: { invites: PendingInvite[]; boardId: string }) {
  const headingId = useId();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRevoke(invite: PendingInvite) {
    setRevokingId(invite.id);
    startTransition(async () => {
      try {
        const result = await revokeInvite({ boardId, inviteId: invite.id });
        if (result.ok) toast.success("Invite revoked");
        else toast.error(result.error);
      } catch {
        toast.error(GENERIC_ERROR);
      } finally {
        setRevokingId(null);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <h4 id={headingId} className="text-sm font-medium">
        Pending invites
      </h4>
      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending invites.</p>
      ) : (
        <ul aria-labelledby={headingId} className="grid gap-1">
          {invites.map((invite) => {
            const expires = formatInviteDate(invite.expiresAt);
            return (
              <li key={invite.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                <div className="grid min-w-0 flex-1">
                  <span className="text-sm font-medium">{ROLE_LABELS[invite.role]} link</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Expires {expires}
                    {invite.createdByName ? ` · created by ${invite.createdByName}` : ""}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Revoke ${ROLE_LABELS[invite.role]} invite expiring ${expires}`}
                  onClick={() => handleRevoke(invite)}
                  disabled={revokingId === invite.id}
                  focusableWhenDisabled
                >
                  {revokingId === invite.id ? "Revoking…" : "Revoke"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

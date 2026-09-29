"use client";

import { LogOutIcon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GENERIC_ERROR } from "@/lib/boards/action-result";
import { pluralize } from "@/lib/boards/copy";
import { roleOf } from "@/lib/boards/permissions";
import type { BoardMember, BoardRole } from "@/lib/boards/view-model";
import { leaveAvailability, memberControls } from "@/lib/members/management";
import { changeMemberRole, leaveBoard, removeMember } from "@/lib/members/actions";

import { useBoard } from "./board-context";
import { InviteSection } from "./invite-section";
import { MemberRow } from "./member-row";
import { personName } from "./user-avatar";

/**
 * Board members: everyone sees the list; owners change roles, remove people
 * and invite; non-creators can leave. The role/removal controls only hide
 * what Row Level Security would reject anyway.
 */
export function MembersDialog() {
  const { view, boardId, membership, mutate, trackLocalMutation } = useBoard();
  const router = useRouter();
  const viewerRole = roleOf(view.members, membership.userId);
  const viewer = { id: membership.userId, role: viewerRole, creatorId: membership.creatorId };
  const isOwner = viewerRole === "owner";
  const leave = leaveAvailability(membership.userId, membership.creatorId);

  const [toRemove, setToRemove] = useState<BoardMember | null>(null);
  const [removedName, setRemovedName] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, startLeaving] = useTransition();

  function handleRoleChange(member: BoardMember, role: BoardRole) {
    if (role === member.role) return;
    mutate({ type: "setMemberRole", userId: member.id, role }, () =>
      changeMemberRole({ boardId, userId: member.id, role }),
    );
  }

  function handleRemove() {
    const member = toRemove;
    if (!member) return;
    setToRemove(null);
    const name = personName(member);
    mutate(
      { type: "removeMember", userId: member.id },
      () => removeMember({ boardId, userId: member.id }),
      {
        onSuccess: () => {
          setRemovedName(name);
          toast.success(`Removed ${name} from the board`);
        },
      },
    );
  }

  function handleLeave() {
    startLeaving(async () => {
      try {
        const result = await trackLocalMutation(() => leaveBoard({ boardId }), { exits: true });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("You left the board");
        router.replace("/boards");
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  }

  const showRevokeHint = removedName !== null && membership.pendingInvites.length > 0;

  return (
    <Dialog onOpenChange={(open) => !open && setRemovedName(null)}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UsersIcon aria-hidden />
        Members
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Board members</DialogTitle>
          <DialogDescription>
            {pluralize(view.members.length, "person", "people")} with access to this board.
            {isOwner ? "" : " Only owners can change roles or invite people."}
          </DialogDescription>
        </DialogHeader>

        {showRevokeHint ? (
          <Alert role="status">
            <AlertDescription>
              {removedName} was removed. Invite links are not tied to a person, so anyone who
              already has a pending link (including {removedName}) can still join with it. Revoke
              the pending links below if that is a concern.
            </AlertDescription>
          </Alert>
        ) : null}

        <ul aria-label="People with access" className="grid gap-1">
          {view.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isSelf={member.id === membership.userId}
              controls={memberControls(viewer, member)}
              onRoleChange={(role) => handleRoleChange(member, role)}
              onRemove={() => setToRemove(member)}
            />
          ))}
        </ul>

        {isOwner ? <InviteSection /> : null}

        <div className="grid gap-2 border-t pt-4">
          {leave.canLeave ? (
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => setLeaveOpen(true)}
              disabled={leaving}
            >
              <LogOutIcon aria-hidden />
              Leave board
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{leave.note}</p>
          )}
        </div>

        <AlertDialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="break-words">
                Remove {toRemove ? personName(toRemove) : ""}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                They lose access to “{view.board.title}” and are unassigned from its cards.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={handleRemove}>
                Remove member
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={leaveOpen} onOpenChange={(open) => !leaving && setLeaveOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="break-words">
                Leave “{view.board.title}”?
              </AlertDialogTitle>
              <AlertDialogDescription>
                You will lose access to this board and be unassigned from its cards. An owner has to
                invite you again to get back in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleLeave}
                disabled={leaving}
                focusableWhenDisabled
              >
                {leaving ? "Leaving…" : "Leave board"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

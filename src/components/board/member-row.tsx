"use client";

import { UserMinusIcon } from "lucide-react";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BoardMember, BoardRole } from "@/lib/boards/view-model";
import { type MemberControls, ROLE_LABELS } from "@/lib/members/management";

import { RoleSelect } from "./role-select";
import { UserAvatar, personName } from "./user-avatar";

const ROLES = ["owner", "editor", "viewer"] as const;

type Props = {
  member: BoardMember;
  isSelf: boolean;
  controls: MemberControls;
  onRoleChange: (role: BoardRole) => void;
  onRemove: () => void;
};

/** One member: avatar, name and role. Owners get a role select and "Remove" where allowed. */
export function MemberRow({ member, isSelf, controls, onRoleChange, onRemove }: Props) {
  const name = personName(member);
  const noteId = useId();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-1.5">
      <UserAvatar person={member} labelled={false} />
      <div className="grid min-w-0 flex-1">
        <span className="truncate font-medium">
          {name}
          {isSelf ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
        </span>
        {controls.note ? (
          <span id={noteId} className="text-xs text-muted-foreground">
            {controls.note}
          </span>
        ) : null}
      </div>
      {controls.showControls ? (
        <>
          <RoleSelect
            value={member.role}
            roles={ROLES}
            onChange={onRoleChange}
            label={`Role for ${name}`}
            disabled={!controls.canManage}
            describedBy={controls.note ? noteId : undefined}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${name}`}
            aria-describedby={controls.note ? noteId : undefined}
            onClick={onRemove}
            disabled={!controls.canManage}
          >
            <UserMinusIcon aria-hidden />
          </Button>
        </>
      ) : (
        <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
      )}
    </li>
  );
}

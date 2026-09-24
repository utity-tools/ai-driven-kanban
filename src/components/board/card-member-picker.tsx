"use client";

import { UsersIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { assignMember, unassignMember } from "@/lib/boards/actions";
import type { BoardMember, CardDetail } from "@/lib/boards/view-model";

import { useBoard } from "./board-context";
import { UserAvatar, personName } from "./user-avatar";

/**
 * "Members" button of the card modal: a popover with one checkbox per board
 * member (Tab / Shift+Tab between them, Space toggles, Escape closes and
 * returns focus to the button).
 */
export function MemberPicker({ card }: { card: Pick<CardDetail, "id" | "assignees"> }) {
  const { view } = useBoard();
  const assigned = new Set(card.assignees.map((person) => person.id));

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <UsersIcon aria-hidden />
        Members
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <PopoverHeader>
          <PopoverTitle>Members</PopoverTitle>
        </PopoverHeader>
        <ul aria-label="Board members" className="grid gap-0.5">
          {view.members.map((member) => (
            <li key={member.id}>
              <MemberOption cardId={card.id} member={member} checked={assigned.has(member.id)} />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function MemberOption({
  cardId,
  member,
  checked,
}: {
  cardId: string;
  member: BoardMember;
  checked: boolean;
}) {
  const { boardId, mutate } = useBoard();
  const nameId = useId();

  function toggle(assign: boolean) {
    const input = { boardId, cardId, userId: member.id };
    if (assign) {
      mutate({ type: "assignMember", cardId, userId: member.id }, () => assignMember(input));
    } else {
      mutate({ type: "unassignMember", cardId, userId: member.id }, () => unassignMember(input));
    }
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
      <Checkbox aria-labelledby={nameId} checked={checked} onCheckedChange={toggle} />
      <UserAvatar person={member} size="sm" labelled={false} />
      <span id={nameId} className="min-w-0 flex-1 truncate">
        {personName(member)}
      </span>
    </label>
  );
}

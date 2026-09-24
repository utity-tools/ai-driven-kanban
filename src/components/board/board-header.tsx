"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { renameBoard } from "@/lib/boards/actions";
import { BOARD_TITLE_MAX } from "@/lib/boards/schemas";

import { ArchivedPanel } from "./archived-panel";
import { useBoard } from "./board-context";
import { BoardMenu } from "./board-menu";
import { InlineEdit } from "./inline-edit";
import { AvatarStack } from "./user-avatar";

const MAX_HEADER_MEMBERS = 5;

export function BoardHeader() {
  const { view, boardId, permissions, mutate } = useBoard();
  const { title } = view.board;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4">
      <div className="grid min-w-0 flex-1 gap-1">
        <Link
          href="/boards"
          className="flex w-fit items-center gap-1 rounded-md text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          All boards
        </Link>
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {permissions.canEdit ? (
            <InlineEdit
              value={title}
              label="Board title"
              hint="Rename board"
              maxLength={BOARD_TITLE_MAX}
              onSave={(next) =>
                mutate({ type: "renameBoard", title: next }, () =>
                  renameBoard({ boardId, title: next }),
                )
              }
            />
          ) : (
            title
          )}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <AvatarStack people={view.members} max={MAX_HEADER_MEMBERS} label="Board members" />
        <ArchivedPanel />
        {permissions.canDeleteBoard ? <BoardMenu /> : null}
      </div>
    </div>
  );
}

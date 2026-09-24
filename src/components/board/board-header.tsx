import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import type { BoardView } from "@/lib/boards/view-model";

import { AvatarStack } from "./user-avatar";

const MAX_HEADER_MEMBERS = 5;

export function BoardHeader({ view }: { view: BoardView }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4">
      <div className="grid min-w-0 gap-1">
        <Link
          href="/boards"
          className="flex w-fit items-center gap-1 rounded-md text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          All boards
        </Link>
        <h1 className="truncate text-2xl font-semibold tracking-tight">{view.board.title}</h1>
      </div>
      <AvatarStack people={view.members} max={MAX_HEADER_MEMBERS} label="Board members" />
    </div>
  );
}

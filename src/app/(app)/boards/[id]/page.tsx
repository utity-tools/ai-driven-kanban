import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BoardColumns } from "@/components/board/board-columns";
import { BoardHeader } from "@/components/board/board-header";
import { CardDialog } from "@/components/board/card-dialog";
import { requireUser } from "@/lib/auth/session";
import { getBoard, getBoardView } from "@/lib/boards/queries";
import { buildCardDetails } from "@/lib/boards/view-model";

export async function generateMetadata({ params }: PageProps<"/boards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const board = await getBoard(id);
  return { title: board?.title ?? "Board not found" };
}

export default async function BoardPage({ params }: PageProps<"/boards/[id]">) {
  await requireUser();
  const { id } = await params;
  // Missing and inaccessible boards look the same: never reveal that a board exists.
  const view = await getBoardView(id);
  if (!view) notFound();

  // Due-date status is computed once, on the server, at request time.
  const now = new Date();
  const boardPath = `/boards/${view.board.id}`;

  return (
    <div className="flex flex-1 flex-col gap-5 pt-6">
      <BoardHeader view={view} />
      {view.columns.length === 0 ? (
        <div className="mx-4 grid place-items-center gap-1 rounded-xl border border-dashed px-4 py-16 text-center">
          <h2 className="font-medium">This board has no columns yet</h2>
          <p className="text-sm text-muted-foreground">
            Columns and cards will appear here once they are added.
          </p>
        </div>
      ) : (
        <BoardColumns view={view} boardPath={boardPath} now={now} />
      )}
      {/* The modal reads ?card= on the client, so opening a card needs no server round trip. */}
      <Suspense fallback={null}>
        <CardDialog cards={buildCardDetails(view, now)} />
      </Suspense>
    </div>
  );
}

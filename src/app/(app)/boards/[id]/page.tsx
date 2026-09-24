import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getBoard } from "@/lib/boards/queries";

export async function generateMetadata({ params }: PageProps<"/boards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const board = await getBoard(id);
  return { title: board?.title ?? "Board" };
}

export default async function BoardPage({ params }: PageProps<"/boards/[id]">) {
  await requireUser();
  const { id } = await params;
  const board = await getBoard(id);
  if (!board) notFound();

  return (
    <section aria-labelledby="board-heading" className="grid gap-4">
      <Link
        href="/boards"
        className="w-fit rounded-md text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        ← All boards
      </Link>
      <h1 id="board-heading" className="text-2xl font-semibold tracking-tight">
        {board.title}
      </h1>
      <p className="text-muted-foreground">The board view is coming soon.</p>
    </section>
  );
}

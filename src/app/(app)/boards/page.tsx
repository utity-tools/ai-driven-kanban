import { LayoutGridIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { listBoards } from "@/lib/boards/queries";

export const metadata: Metadata = { title: "Your boards" };

export default async function BoardsPage() {
  // The proxy already redirects signed-out users; this is the authoritative check.
  await requireUser();
  const boards = await listBoards();

  return (
    <section
      aria-labelledby="boards-heading"
      className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8"
    >
      <h1 id="boards-heading" className="text-2xl font-semibold tracking-tight">
        Your boards
      </h1>
      {boards.length === 0 ? (
        <p className="text-muted-foreground">You don&apos;t have any boards yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                href={`/boards/${board.id}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 font-medium text-card-foreground shadow-xs transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <LayoutGridIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{board.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

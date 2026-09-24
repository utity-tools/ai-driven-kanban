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
    <section aria-labelledby="boards-heading" className="grid gap-6">
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
                className="block rounded-xl border bg-card p-4 font-medium text-card-foreground ring-foreground/10 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {board.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

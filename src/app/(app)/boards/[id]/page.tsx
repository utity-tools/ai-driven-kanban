import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BoardWorkspace } from "@/components/board/board-workspace";
import { requireUser } from "@/lib/auth/session";
import { permissionsFor, roleOf } from "@/lib/boards/permissions";
import { getBoard, getBoardView } from "@/lib/boards/queries";

export async function generateMetadata({ params }: PageProps<"/boards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const board = await getBoard(id);
  return { title: board?.title ?? "Board not found" };
}

export default async function BoardPage({ params }: PageProps<"/boards/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  // Missing and inaccessible boards look the same: never reveal that a board exists.
  const view = await getBoardView(id);
  if (!view) notFound();

  // Only decides which controls to show; RLS enforces the rules on every mutation.
  const permissions = permissionsFor(roleOf(view.members, user.id));

  // Due-date status is computed against the request time, on server and client alike.
  return <BoardWorkspace view={view} now={new Date().toISOString()} permissions={permissions} />;
}

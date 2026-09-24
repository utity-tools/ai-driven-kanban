import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Shown for unknown ids, malformed ids and boards the user can't access alike.
export default function BoardNotFound() {
  return (
    <section
      aria-labelledby="board-not-found-heading"
      className="mx-auto grid w-full max-w-md justify-items-center gap-3 px-4 py-16 text-center"
    >
      <h1 id="board-not-found-heading" className="text-2xl font-semibold tracking-tight">
        Board not found
      </h1>
      <p className="text-muted-foreground">
        This board doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/boards" className={buttonVariants({ variant: "outline" })}>
        <ArrowLeftIcon aria-hidden />
        All boards
      </Link>
    </section>
  );
}

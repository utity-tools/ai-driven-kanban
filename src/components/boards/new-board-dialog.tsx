"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GENERIC_ERROR } from "@/lib/boards/action-result";
import { createBoard } from "@/lib/boards/actions";
import { BOARD_TITLE_MAX } from "@/lib/boards/schemas";

type State = { error?: string; title?: string };

/** "New board": asks for a title, creates the board, then opens it. */
export function NewBoardDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const ids = { title: `${id}-title`, error: `${id}-error` };

  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    const title = formData.get("title");
    try {
      const result = await createBoard({ title });
      if (!result.ok) return { error: result.error, title: String(title ?? "") };
      router.push(`/boards/${result.boardId}`);
      return {};
    } catch {
      return { error: GENERIC_ERROR, title: String(title ?? "") };
    }
  }, {});

  // After a failed submit, put the user back in the (invalid) field.
  useEffect(() => {
    if (state.error) inputRef.current?.focus();
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger render={<Button />}>
        <PlusIcon aria-hidden />
        New board
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create a board</DialogTitle>
            <DialogDescription>
              New boards start with To do, In progress and Done columns.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={ids.title}>Title</Label>
            <Input
              // Remount with the echoed title after an error (the form resets after an action).
              key={state.title ?? ""}
              ref={inputRef}
              id={ids.title}
              name="title"
              required
              maxLength={BOARD_TITLE_MAX}
              autoComplete="off"
              defaultValue={state.title ?? ""}
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? ids.error : undefined}
            />
            {state.error ? (
              <p id={ids.error} role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending} focusableWhenDisabled>
              {pending ? "Creating…" : "Create board"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

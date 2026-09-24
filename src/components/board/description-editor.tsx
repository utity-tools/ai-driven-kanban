"use client";

import { PencilIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { updateCardDescription } from "@/lib/boards/actions";
import { DESCRIPTION_MAX } from "@/lib/boards/schemas";

import { useBoard } from "./board-context";
import { Markdown } from "./markdown";

type Props = { cardId: string; description: string | null };

/**
 * The card description for owners and editors: rendered Markdown with an
 * Edit button; editing shows Write / Preview tabs (the preview uses the same
 * safe renderer as the card) with Save and Cancel. Ctrl/⌘+Enter saves,
 * Escape cancels without closing the modal.
 */
export function DescriptionEditor({ cardId, description }: Props) {
  const { boardId, mutate } = useBoard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const hintId = useId();
  const current = description?.trim() ?? "";

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  function start() {
    setDraft(description ?? "");
    setTab("write");
    setEditing(true);
  }

  function stop() {
    refocus.current = true;
    setEditing(false);
  }

  function save() {
    const next = draft.trim();
    if (next !== current) {
      const value = next === "" ? null : next;
      mutate({ type: "setDescription", cardId, description: value }, () =>
        updateCardDescription({ boardId, cardId, description: value ?? "" }),
      );
    }
    stop();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      // Cancel the edit only; don't also close the modal.
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  }

  if (!editing) {
    return (
      <div className="grid justify-items-start gap-3">
        {current ? (
          <Markdown className="w-full">{current}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )}
        <Button ref={editButtonRef} variant="outline" size="sm" onClick={start}>
          <PencilIcon aria-hidden />
          {current ? "Edit description" : "Add a description"}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value === "preview" ? "preview" : "write")}
      >
        <TabsList aria-label="Description editor">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="grid gap-1.5">
          <Textarea
            // The user just asked to edit the description.
            autoFocus
            aria-label="Description"
            aria-describedby={hintId}
            value={draft}
            maxLength={DESCRIPTION_MAX}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add more detail. Markdown is supported."
            className="max-h-[50dvh] min-h-40"
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            Markdown supported. Ctrl/⌘+Enter saves, Escape cancels.{" "}
            {draft.length.toLocaleString("en-US")}/{DESCRIPTION_MAX.toLocaleString("en-US")}
          </p>
        </TabsContent>
        <TabsContent value="preview" className="min-h-40 rounded-lg border px-3 py-2">
          {draft.trim() ? (
            <Markdown>{draft}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview.</p>
          )}
        </TabsContent>
      </Tabs>
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={stop}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

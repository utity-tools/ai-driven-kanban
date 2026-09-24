"use client";

import {
  AlignLeftIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { renameCard } from "@/lib/boards/actions";
import { describeDue } from "@/lib/boards/due-date";
import { CARD_TITLE_MAX } from "@/lib/boards/schemas";
import type { CardDetail } from "@/lib/boards/view-model";

import { useBoard } from "./board-context";
import { DoneCheckbox, DueDatePicker } from "./card-due-date";
import { LabelPicker } from "./card-label-picker";
import { MemberPicker } from "./card-member-picker";
import { DescriptionEditor } from "./description-editor";
import { DueBadge } from "./due-badge";
import { InlineEdit } from "./inline-edit";
import { LabelList } from "./label-chip";
import { Markdown } from "./markdown";
import { UserAvatar, personName } from "./user-avatar";

type Props = {
  card: CardDetail;
  onArchive: (card: CardDetail) => void;
  onRestore: (card: CardDetail) => void;
};

/**
 * Content of the card modal. Must render inside a Dialog. Owners and editors
 * can rename the card, edit its description, labels, members and due date
 * (the action row), and archive it; archived cards and viewers get a
 * read-only view.
 */
export function CardDetails({ card, onArchive, onRestore }: Props) {
  const { boardId, permissions, today, serverToday, mutate } = useBoard();
  const archived = card.archivedAt !== null;
  const editable = permissions.canEdit && !archived;
  const description = card.description?.trim();
  const due = describeDue(card, today, serverToday);

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle className="text-lg leading-snug font-semibold break-words">
          {editable ? (
            <InlineEdit
              value={card.title}
              label="Card title"
              hint="Rename card"
              maxLength={CARD_TITLE_MAX}
              multiline
              onSave={(title) =>
                mutate({ type: "renameCard", cardId: card.id, title }, () =>
                  renameCard({ boardId, cardId: card.id, title }),
                )
              }
            />
          ) : (
            card.title
          )}
        </DialogTitle>
        <DialogDescription>
          {archived ? "Archived, from column " : "In column "}
          <span className="font-medium text-foreground">{card.columnTitle}</span>
        </DialogDescription>
      </DialogHeader>

      {archived ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
          <p>
            This card is archived and not shown on the board.
            {permissions.canEdit ? null : " It is read-only."}
          </p>
          {permissions.canEdit ? (
            <Button variant="outline" size="sm" onClick={() => onRestore(card)}>
              <ArchiveRestoreIcon aria-hidden />
              Restore
            </Button>
          ) : null}
        </div>
      ) : null}

      {editable ? (
        <div role="group" aria-label="Card details" className="flex flex-wrap gap-2">
          <LabelPicker card={card} />
          <MemberPicker card={card} />
          <DueDatePicker card={card} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {card.labels.length > 0 ? (
          <Field icon={<TagIcon />} title="Labels">
            <LabelList labels={card.labels} />
          </Field>
        ) : null}
        {due ? (
          <Field icon={<CalendarIcon />} title="Due date">
            <div className="flex flex-wrap items-center gap-3">
              <DueBadge due={due} showStatus className="w-fit" />
              {editable ? <DoneCheckbox card={card} /> : null}
            </div>
          </Field>
        ) : null}
        {card.assignees.length > 0 ? (
          <Field icon={<UsersIcon />} title="Assignees" className="sm:col-span-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {card.assignees.map((person) => (
                <li key={person.id} className="flex items-center gap-2 text-sm">
                  <UserAvatar person={person} size="sm" labelled={false} />
                  {personName(person)}
                </li>
              ))}
            </ul>
          </Field>
        ) : null}
      </div>

      <Field icon={<AlignLeftIcon />} title="Description">
        {editable ? (
          <DescriptionEditor cardId={card.id} description={card.description} />
        ) : description ? (
          <Markdown>{description}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )}
      </Field>

      {editable ? (
        <div className="flex justify-end border-t pt-4">
          <Button variant="outline" size="sm" onClick={() => onArchive(card)}>
            <ArchiveIcon aria-hidden />
            Archive
          </Button>
        </div>
      ) : null}
    </>
  );
}

function Field({
  icon,
  title,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase [&_svg]:size-3.5">
        <span aria-hidden>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

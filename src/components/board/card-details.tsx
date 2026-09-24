import { AlignLeftIcon, CalendarIcon, TagIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CardDetail } from "@/lib/boards/view-model";

import { DueBadge } from "./due-badge";
import { LabelList } from "./label-chip";
import { Markdown } from "./markdown";
import { UserAvatar, personName } from "./user-avatar";

/** Read-only content of the card modal. Must render inside a Dialog. */
export function CardDetails({ card }: { card: CardDetail }) {
  const description = card.description?.trim();

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle className="text-lg leading-snug font-semibold break-words">
          {card.title}
        </DialogTitle>
        <DialogDescription>
          In column <span className="font-medium text-foreground">{card.columnTitle}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        {card.labels.length > 0 ? (
          <Field icon={<TagIcon />} title="Labels">
            <LabelList labels={card.labels} />
          </Field>
        ) : null}
        {card.due ? (
          <Field icon={<CalendarIcon />} title="Due date">
            <DueBadge due={card.due} showStatus className="w-fit" />
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
        {description ? (
          <Markdown>{description}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )}
      </Field>
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

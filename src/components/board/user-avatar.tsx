import { UserIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/users/initials";
import type { Person } from "@/lib/boards/view-model";
import { cn } from "@/lib/utils";

/** Name to announce for a person; never the email (not selected for display). */
export function personName(person: Pick<Person, "displayName">): string {
  return person.displayName?.trim() || "Unnamed member";
}

type Props = {
  person: Person;
  size?: "sm" | "default" | "lg";
  className?: string;
  /** Set to false when the name is already visible next to the avatar. */
  labelled?: boolean;
};

/**
 * Avatar image when the profile has one, otherwise initials, otherwise a
 * generic icon. Exposed as a single image named after the person.
 */
export function UserAvatar({ person, size = "default", className, labelled = true }: Props) {
  const initials = getInitials(person.displayName);
  const a11y = labelled
    ? ({ role: "img", "aria-label": personName(person) } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <Avatar size={size} className={className} {...a11y}>
      {person.avatarUrl ? (
        // Plain <img> (Base UI Avatar.Image): profile avatars can come from any https host.
        <AvatarImage src={person.avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback className="font-medium text-foreground" aria-hidden>
        {initials ?? <UserIcon className="size-[60%]" aria-hidden />}
      </AvatarFallback>
    </Avatar>
  );
}

type StackProps = {
  people: Person[];
  /** How many avatars to show before collapsing the rest into "+N". */
  max: number;
  size?: "sm" | "default";
  /** Accessible name of the list, e.g. "Board members". */
  label: string;
  className?: string;
};

/** Overlapping avatars as a list, with a "+N" item naming the hidden people. */
export function AvatarStack({ people, max, size = "default", label, className }: StackProps) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const hidden = people.slice(max);

  return (
    <ul
      aria-label={label}
      className={cn("flex", size === "sm" ? "-space-x-1" : "-space-x-1.5", className)}
    >
      {visible.map((person) => (
        <li key={person.id} className="rounded-full ring-2 ring-background">
          <UserAvatar person={person} size={size} />
        </li>
      ))}
      {hidden.length > 0 ? (
        <li
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground ring-2 ring-background",
            size === "sm" ? "size-6 text-[0.625rem]" : "size-8 text-xs",
          )}
        >
          <span aria-hidden>+{hidden.length}</span>
          <span className="sr-only">
            and {hidden.length} more: {hidden.map(personName).join(", ")}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

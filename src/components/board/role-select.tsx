"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/members/management";

type Props<R extends string> = {
  value: R;
  roles: readonly R[];
  onChange: (role: R) => void;
  /** Accessible name (or use `labelledBy`). */
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  describedBy?: string;
};

/** A role picker (shadcn Select). The visible value is the friendly role name. */
export function RoleSelect<R extends "owner" | "editor" | "viewer">({
  value,
  roles,
  onChange,
  label,
  labelledBy,
  disabled,
  describedBy,
}: Props<R>) {
  const items = roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
  return (
    <Select
      value={value}
      items={items}
      disabled={disabled}
      onValueChange={(next) => {
        const role = roles.find((r) => r === next);
        if (role) onChange(role);
      }}
    >
      <SelectTrigger
        size="sm"
        className="w-28"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

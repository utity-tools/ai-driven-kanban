"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type Props = Omit<ComponentProps<typeof Button>, "type" | "disabled" | "children"> & {
  children: ReactNode;
  pendingLabel: ReactNode;
};

/** Submit button that disables itself and swaps its label while its form is pending. */
export function PendingSubmitButton({ children, pendingLabel, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

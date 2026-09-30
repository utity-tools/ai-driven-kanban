/*
 * What the panel shows, under "Suggest with AI", once it closes. Everything is
 * announced to screen readers anyway; this decides what also stays on screen.
 */

/** Why a panel closed. */
export type CloseReason = "added" | "stopped" | "discarded";

export type VisibleOutcome = {
  /** `success` gets a check and the success color; `muted` is plain secondary text. */
  tone: "success" | "muted";
  text: string;
};

/**
 * The outcome to keep visible for a closed panel, or null when it should stay
 * screen-reader only: a discard is the user's own action, so it makes no noise.
 */
export function visibleOutcome(reason: CloseReason, message: string): VisibleOutcome | null {
  switch (reason) {
    case "added":
      return { tone: "success", text: message };
    case "stopped":
      return { tone: "muted", text: message };
    case "discarded":
      return null;
  }
}

import { GENERIC_ERROR, SIGNED_OUT_ERROR } from "@/lib/boards/action-result";

export const INVITE_INVALID_ERROR =
  "This invite link is not valid. It may have been revoked. Ask the board owner for a new one.";

/**
 * Message for a create/get/accept invite RPC error code (see the SQLSTATEs in
 * supabase/migrations/20260929103810_board_invites.sql). Only the code is read.
 */
export function inviteErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "INV01":
      return INVITE_INVALID_ERROR;
    case "INV02":
      return "This invite link has expired. Ask the board owner for a new one.";
    case "INV03":
      return "This invite link has already been used. Ask the board owner for a new one.";
    case "INV04":
      return "Demo accounts can't use invites. Create an account first.";
    case "INV05":
      return "This board already has 20 pending invites. Revoke some before creating more.";
    case "42501":
      return SIGNED_OUT_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

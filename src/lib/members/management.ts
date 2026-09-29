import type { BoardRole } from "@/lib/boards/view-model";

export const CREATOR_NOTE = "The board's creator always stays an owner.";
export const CREATOR_CANNOT_LEAVE_NOTE =
  "You created this board, so you can't leave it. Delete the board instead.";

export type MemberControls = {
  /** The role select and "Remove" are shown (owners looking at someone else). */
  showControls: boolean;
  /** ...and enabled. Off for the creator, whose row explains why. */
  canManage: boolean;
  /** Why they are not, when that is worth explaining. */
  note: string | null;
};

/**
 * What the viewer may do to another member. Only hides/disables controls: RLS
 * and the board_members triggers are the authority (owners only; the creator is
 * protected). Your own row has no controls: leave through "Leave board".
 */
export function memberControls(
  viewer: { id: string; role: BoardRole | null; creatorId: string },
  member: { id: string },
): MemberControls {
  const isOwner = viewer.role === "owner";
  if (member.id === viewer.creatorId) {
    return {
      showControls: isOwner && member.id !== viewer.id,
      canManage: false,
      note: CREATOR_NOTE,
    };
  }
  if (member.id === viewer.id) return { showControls: false, canManage: false, note: null };
  return { showControls: isOwner, canManage: isOwner, note: null };
}

/** Whether the viewer can leave; the creator cannot (protect_board_owners trigger). */
export function leaveAvailability(viewerId: string, creatorId: string) {
  return viewerId === creatorId
    ? { canLeave: false, note: CREATOR_CANNOT_LEAVE_NOTE }
    : { canLeave: true, note: null };
}

/** Friendly role names, as shown in selects and lists. */
export const ROLE_LABELS: Record<BoardRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<BoardRole, string> = {
  owner: "Can manage members and delete the board",
  editor: "Can edit cards and columns",
  viewer: "Can only view the board",
};

import type { BoardRole } from "./view-model";

/**
 * What the UI offers the current user. This only hides controls: Row Level
 * Security is the authority, so a forged request is still rejected.
 */
export type BoardPermissions = {
  /** Create, rename, archive, restore and delete columns and cards; rename the board. */
  canEdit: boolean;
  /** Delete the whole board. */
  canDeleteBoard: boolean;
};

const NONE: BoardPermissions = { canEdit: false, canDeleteBoard: false };

const BY_ROLE: Record<BoardRole, BoardPermissions> = {
  owner: { canEdit: true, canDeleteBoard: true },
  editor: { canEdit: true, canDeleteBoard: false },
  viewer: NONE,
};

/** Permissions for a role; no role (not a member) means read-only. */
export function permissionsFor(role: BoardRole | null): BoardPermissions {
  return role === null ? NONE : BY_ROLE[role];
}

/** The role of `userId` among the board's members, or `null` if they aren't one. */
export function roleOf(
  members: readonly { id: string; role: BoardRole }[],
  userId: string,
): BoardRole | null {
  return members.find((member) => member.id === userId)?.role ?? null;
}

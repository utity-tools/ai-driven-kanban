import { z } from "zod";

const boardId = z.uuid({ error: "Invalid board." });
const userId = z.uuid({ error: "Invalid member." });

export const memberRoleSchema = z.enum(["owner", "editor", "viewer"], {
  error: "Choose a role.",
});

export const changeMemberRoleSchema = z.object({ boardId, userId, role: memberRoleSchema });
export const removeMemberSchema = z.object({ boardId, userId });
export const leaveBoardSchema = z.object({ boardId });

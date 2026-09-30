import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../../src/lib/db/types";

// Test setup and teardown straight against Supabase, as a real signed-in user.
//
// Doing this through the UI made every test depend on a Server Action plus a
// redirect finishing inside the assertion timeout, which it does not under load.
// The calls here use the same RPCs and RLS policies as the app, with the user's
// own access token: no service role, so a test can never do more than the user can.
//
// The session is read from the storage state written by `auth.setup.ts`, so no
// extra sign-in happens (Supabase Auth rate limits those per IP) and nothing is
// ever signed out (that would revoke the user's other sessions). The access token
// lives an hour, longer than a run; it is never refreshed here, so the refresh
// token the browsers use is not rotated under them.

type Api = SupabaseClient<Database>;

export type InviteRole = "editor" | "viewer";

type SupabaseConfig = { url: string; key: string };

let config: SupabaseConfig | undefined;

/**
 * The URL and publishable key the app uses: from the environment when set (what
 * `pnpm dev` and the build read), otherwise from the local Supabase, which is where
 * CI gets them too.
 */
function supabaseConfig(): SupabaseConfig {
  if (config) return config;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) return (config = { url, key });

  let status: { API_URL?: string; PUBLISHABLE_KEY?: string };
  try {
    status = JSON.parse(
      execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error(
      "E2E setup needs Supabase: set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or start it with `pnpm db:start`.",
    );
  }
  if (!status.API_URL || !status.PUBLISHABLE_KEY) {
    throw new Error("`supabase status` did not report API_URL and PUBLISHABLE_KEY.");
  }
  return (config = { url: status.API_URL, key: status.PUBLISHABLE_KEY });
}

/** The access token in a Playwright storage state (the @supabase/ssr cookie, possibly chunked). */
function accessTokenFrom(storageStatePath: string): string {
  const state: { cookies: { name: string; value: string }[] } = JSON.parse(
    readFileSync(storageStatePath, "utf8"),
  );
  const chunks = state.cookies
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (chunks.length === 0) {
    throw new Error(`No Supabase session cookie in ${storageStatePath}. Did auth.setup.ts run?`);
  }
  const raw = chunks.map((cookie) => cookie.value).join("");
  const json = raw.startsWith("base64-")
    ? Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8")
    : raw;
  const session: { access_token?: string } = JSON.parse(json);
  if (!session.access_token) throw new Error(`No access token in ${storageStatePath}.`);
  return session.access_token;
}

const clients = new Map<string, Api>();

/** A Supabase client acting as the user saved in `storageStatePath`; RLS applies. */
export function apiAs(storageStatePath: string): Api {
  const cached = clients.get(storageStatePath);
  if (cached) return cached;
  const { url, key } = supabaseConfig();
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessTokenFrom(storageStatePath)}` } },
  });
  clients.set(storageStatePath, client);
  return client;
}

/** Creates a board owned by the user (default columns included) and returns its id. */
export async function createBoardAs(storageStatePath: string, title: string): Promise<string> {
  const { data, error } = await apiAs(storageStatePath).rpc("create_board", { p_title: title });
  if (error) throw new Error(`create_board failed: ${error.message}`);
  return data;
}

/**
 * Deletes a board the way the app does (owners only, cascades to columns and cards).
 * Idempotent: a board the test already deleted is not an error.
 */
export async function deleteBoardAs(storageStatePath: string, boardId: string): Promise<void> {
  const { error } = await apiAs(storageStatePath).from("boards").delete().eq("id", boardId);
  if (error) throw new Error(`Deleting board ${boardId} failed: ${error.message}`);
}

/** The board id in a `/boards/<id>` path. */
export function boardIdFromPath(path: string): string {
  const id = path.split("/").at(-1);
  if (!id) throw new Error(`Not a board path: ${path}`);
  return id;
}

/** Makes `memberStorageState`'s user a member of the owner's board, through a real invite. */
export async function addMemberAs(
  ownerStorageState: string,
  boardId: string,
  memberStorageState: string,
  role: InviteRole,
): Promise<void> {
  const invite = await apiAs(ownerStorageState)
    .rpc("create_board_invite", { p_board_id: boardId, p_role: role })
    .single();
  if (invite.error) throw new Error(`create_board_invite failed: ${invite.error.message}`);

  const accepted = await apiAs(memberStorageState).rpc("accept_board_invite", {
    p_token: invite.data.token,
  });
  if (accepted.error) throw new Error(`accept_board_invite failed: ${accepted.error.message}`);
}

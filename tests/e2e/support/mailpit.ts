import { expect } from "@playwright/test";

/** Local Supabase's Mailpit (supabase/config.toml [local_smtp]); every auth email lands here. */
const MAILPIT_URL = "http://127.0.0.1:54324";

type MessageSummary = { ID: string };

async function latestMessageId(email: string): Promise<string | null> {
  const query = new URLSearchParams({ query: `to:"${email}"`, limit: "1" });
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?${query.toString()}`);
  if (!response.ok) throw new Error(`Mailpit search failed (${response.status})`);
  const { messages } = (await response.json()) as { messages: MessageSummary[] };
  // Newest first, so a resend wins over the original email.
  return messages[0]?.ID ?? null;
}

/**
 * Waits for the newest email sent to `email` and returns its link to the given
 * app page (e.g. /auth/confirm or /auth/reset). Pass `after` to wait for a new
 * email, e.g. a resend, instead of returning the one already there.
 */
async function emailLink(
  email: string,
  path: string,
  { after }: { after?: string | undefined } = {},
): Promise<string> {
  let id: string | null = null;
  await expect
    .poll(
      async () => {
        id = await latestMessageId(email);
        return id !== null && id !== after;
      },
      { message: `email with a ${path} link for ${email}`, timeout: 10_000 },
    )
    .toBe(true);

  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  if (!response.ok) throw new Error(`Mailpit message failed (${response.status})`);
  const { HTML } = (await response.json()) as { HTML: string };
  const href = new RegExp(`href="([^"]*${path}\\?[^"]*)"`).exec(HTML)?.[1];
  if (!href) throw new Error(`no ${path} link in the newest email to ${email}`);
  return href.replaceAll("&amp;", "&");
}

/** The sign-up confirmation link (ADR 0022). */
export function confirmationLink(email: string, options?: { after?: string }): Promise<string> {
  return emailLink(email, "/auth/confirm", options);
}

/** The password reset link (ADR 0023). Pass `after` so the sign-up email isn't picked up. */
export function resetLink(email: string, options?: { after?: string }): Promise<string> {
  return emailLink(email, "/auth/reset", options);
}

/** ID of the newest email to `email`, to wait for a newer one (`after`). */
export async function latestEmailId(email: string): Promise<string | undefined> {
  return (await latestMessageId(email)) ?? undefined;
}

/**
 * True once an email newer than `after` reached `email`, waiting up to
 * `timeout` ms. For retrying an action Supabase may silently rate-limit.
 */
export async function newEmailArrived(
  email: string,
  after: string | undefined,
  timeout = 2_000,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const id = await latestMessageId(email);
    if (id !== null && id !== after) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

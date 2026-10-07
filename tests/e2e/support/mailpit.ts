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
 * Waits for the newest confirmation email sent to `email` and returns its link
 * (the app's /auth/confirm page). Pass `after` to wait for a new email, e.g. a
 * resend, instead of returning the one already there.
 */
export async function confirmationLink(
  email: string,
  { after }: { after?: string } = {},
): Promise<string> {
  let id: string | null = null;
  await expect
    .poll(
      async () => {
        id = await latestMessageId(email);
        return id !== null && id !== after;
      },
      { message: `confirmation email for ${email}`, timeout: 10_000 },
    )
    .toBe(true);

  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  if (!response.ok) throw new Error(`Mailpit message failed (${response.status})`);
  const { HTML } = (await response.json()) as { HTML: string };
  const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(HTML)?.[1];
  if (!href) throw new Error(`no confirmation link in the email to ${email}`);
  return href.replaceAll("&amp;", "&");
}

/** ID of the newest email to `email`, to wait for a newer one with `confirmationLink`. */
export async function latestEmailId(email: string): Promise<string | undefined> {
  return (await latestMessageId(email)) ?? undefined;
}

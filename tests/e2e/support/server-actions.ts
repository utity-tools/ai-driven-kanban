import { expect, type Page, type Request } from "@playwright/test";

function isServerAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

/**
 * Tracks the page's Server Action requests (POSTs carrying `Next-Action`).
 * Board edits are optimistic: the UI changes before the server has saved
 * anything, so a test must wait for the actions to finish before reloading
 * to check that a change persisted. Start tracking before the first edit.
 */
export function trackServerActions(page: Page) {
  let started = 0;
  const pending = new Set<Request>();
  page.on("request", (request) => {
    if (!isServerAction(request)) return;
    started += 1;
    pending.add(request);
  });
  const done = (request: Request) => pending.delete(request);
  page.on("requestfinished", done);
  page.on("requestfailed", done);

  return {
    /** How many actions have started since tracking began. */
    started: (): number => started,
    /**
     * Resolves once at least `count` actions have started since tracking began
     * and none is still in flight (Next runs actions one at a time, so later
     * ones may not have started when the first finishes).
     */
    async settled(count: number): Promise<void> {
      await expect
        .poll(() => started, { message: `waiting for ${count} Server Action(s) to start` })
        .toBeGreaterThanOrEqual(count);
      await expect
        .poll(() => pending.size, { message: "waiting for Server Actions to finish" })
        .toBe(0);
    },
  };
}

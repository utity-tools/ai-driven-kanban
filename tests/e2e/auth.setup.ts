import { expect, test as setup } from "@playwright/test";

import { ALICE, ALICE_STORAGE_STATE, signIn } from "./support/auth";

// Signs Alice in once per run so tests that only need a signed-in user don't
// each hit Supabase Auth (its sign-in endpoint is rate limited per IP).
setup("sign in as Alice", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, ALICE);
  await expect(page).toHaveURL("/boards");
  await page.context().storageState({ path: ALICE_STORAGE_STATE });
});

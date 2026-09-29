import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Picks a card up with the dnd-kit keyboard sensor (focus + Space) and waits
 * until it is ready to move with the arrow keys.
 */
export async function pickUpWithKeyboard(page: Page, handle: Locator): Promise<void> {
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("[id^=DndLiveRegion]")).toContainText("Picked up card");
  // The dnd-kit keyboard sensor registers its keydown listener in a setTimeout
  // after activation and exposes no event for it, so there is nothing to await.
  await page.waitForTimeout(100);
}

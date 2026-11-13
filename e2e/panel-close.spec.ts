import { expect, test } from "@playwright/test";
import { signUp } from "./support";

test("the panel close button never covers the header actions", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: /^Minha conta/ }).click();
  await page.getByRole("menuitem", { name: "Levas" }).click();
  const close = page.getByRole("button", { name: "Fechar" });
  const action = page.getByRole("dialog").getByRole("link", { name: "Arquivadas" });
  await expect(action).toBeVisible();

  const [closeBox, actionBox] = [await close.boundingBox(), await action.boundingBox()];
  expect(closeBox && actionBox, "boxes").toBeTruthy();
  expect(actionBox!.y).toBeGreaterThanOrEqual(closeBox!.y + closeBox!.height);
});

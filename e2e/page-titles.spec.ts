import { expect, test } from "@playwright/test";
import { signUp } from "./support";

// Every tab used to read "Criativos Virais"; each page now names itself so tabs and history differ.
test("pages name themselves in the tab title", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Prisciane Pereira · Criativos Virais");
  await page.goto("/signup");
  await expect(page).toHaveTitle("Criar conta · Criativos Virais");

  await signUp(page);
  await expect(page).toHaveTitle("Conversa · Criativos Virais");
  await page.goto("/perfil");
  await expect(page).toHaveTitle("Perfil · Criativos Virais");
  await page.goto("/criativos");
  await expect(page).toHaveTitle("Resultados · Criativos Virais");
});

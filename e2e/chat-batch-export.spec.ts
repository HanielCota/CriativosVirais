import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createBatchThroughChat, signUp } from "./support";

test("signup, chat, batch and .docx export", async ({ page }) => {
  await signUp(page);
  const { batchLink } = await createBatchThroughChat(page);

  await batchLink.click();
  // Every script starts closed with its title; clicking one opens it.
  await expect(page.getByText(/Roteiro de teste 1/).first()).toBeVisible();
  await expect(page.getByText(/Roteiro de teste 2/).first()).toBeVisible();
  await expect(page.getByText("L01-C01")).toBeHidden();
  await page.getByText(/Roteiro de teste 1/).first().click();
  await expect(page.getByText("L01-C01").first()).toBeVisible();

  // Measure the real dialog after Tailwind and SheetContent have applied their styles.
  // Include both sides of each breakpoint so tablet and desktop widths stay intact.
  const panel = page.getByRole("dialog");
  for (const [viewport, expectedWidth] of [
    [375, 375], [768, 768], [1023, 768], [1024, 960],
    [1100, 1024], [1279, 1024], [1280, 1152], [1440, 1312], [1872, 1408],
  ]) {
    await page.setViewportSize({ width: viewport, height: 900 });
    // The app reserves a stable scrollbar gutter on the root element. A full
    // width dialog fills the layout viewport, which can be narrower than 100vw.
    const layoutWidth = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
    await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0), {
      message: `Panel width at a ${viewport}px viewport`,
    }).toBe(Math.min(layoutWidth, expectedWidth));
    // The panel slides in from the right, so its edge settles once the transition ends.
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      return box == null ? null : Math.round(box.x + box.width);
    }, { message: `Panel right edge at a ${viewport}px viewport` }).toBe(layoutWidth);
    expect((await panel.boundingBox())?.x).toBeGreaterThanOrEqual(0);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar em Word" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("leva-1.docx");
  const file = await readFile((await download.path())!);
  // A .docx is a zip archive: it must start with "PK" and carry the batch text.
  expect(file.subarray(0, 2).toString()).toBe("PK");
  expect(file.byteLength).toBeGreaterThan(1000);
});

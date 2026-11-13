import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sendMessage, signUp, testDatabase } from "./support";

test("an account waits for its batch in progress before the next one is queued", async ({ page }) => {
  const email = `e2e-${randomUUID()}@exemplo.test`;
  await signUp(page, email);
  await sendMessage(page, "Eu vendo um curso de rotina para mães que trabalham fora.");
  await page.getByRole("button", { name: "Sim, está certo" }).click();
  await expect(page.getByText(/Confirmado em/)).toBeVisible();

  const conversationId = page.url().match(/\/chat\/([0-9a-f-]{36})/)?.[1];
  const [{ tenant_id: tenantId }] = await testDatabase<{ tenant_id: string }>(
    `select m.tenant_id from tenant_members m join "user" u on u.id = m.user_id where u.email = $1`,
    [email],
  );
  // A generation still running for this account, as the shared worker queue would hold it.
  const [running] = await testDatabase<{ id: string }>(
    `insert into batch_generations (tenant_id, conversation_id, quantity, instructions, title, status)
     values ($1, $2, 2, 'leva anterior', 'Leva anterior', 'running') returning id`,
    [tenantId, conversationId],
  );
  const generations = async () =>
    (await testDatabase(`select 1 from batch_generations where tenant_id = $1`, [tenantId])).length;

  await sendMessage(page, "Gere uma leva com dois roteiros.");
  await expect(page.getByText("Não consegui gerar a leva", { exact: false })).toBeVisible();
  expect(await generations()).toBe(1);

  // A generation the worker abandoned (past the queue expiry) no longer holds the account.
  await testDatabase(`update batch_generations set created_at = now() - interval '2 hours' where id = $1`, [running.id]);
  await sendMessage(page, "Gere uma leva com dois roteiros.");
  await expect(page.getByRole("link", { name: /Abrir leva de roteiros/ })).toBeVisible();
  expect(await generations()).toBe(2);
});

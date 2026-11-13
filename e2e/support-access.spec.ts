import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { signUp, testDatabase, testPassword, waitForAuthSlot, waitForSignUpSlot } from "./support";
import { panelRequiresTwoFactor } from "../src/lib/staff";

// playwright.config.ts points the app's email outbox here, so no message is really sent.
async function emailsTo(email: string) {
  const outbox = "test-results/outbox";
  const files = await readdir(outbox).catch(() => []);
  const messages = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(outbox, file), "utf8"))));
  return messages.filter((message) => message.to === email);
}

test("support enters a client's account without the password, changes its email and password from the panel, and the owner manages the team", async ({ page, browser, baseURL }) => {
  // Seven steps across three browser contexts: about 3 minutes even when it passes, so the default budget runs out on a loaded machine.
  test.slow();
  // A client with a findable name, and a support member who already turned on two-factor.
  const clientEmail = `cliente-${randomUUID()}@exemplo.test`;
  const clientName = `Cliente ${randomUUID().slice(0, 8)}`;
  const clientContext = await browser.newContext({ baseURL, locale: "pt-BR" });
  await signUp(await clientContext.newPage(), clientEmail);
  // The client's own device stays signed in until the team sets a new password (step 5).
  const clientDevice = await clientContext.storageState();
  await clientContext.close();
  await testDatabase(`update "user" set name = $2 where email = $1`, [clientEmail, clientName]);

  const staffEmail = `suporte-${randomUUID()}@exemplo.test`;
  await signUp(page, staffEmail);
  await testDatabase(`update "user" set role = 'support', two_factor_enabled = true where email = $1`, [staffEmail]);

  // 1. Support sees Acessos and Contas, and the API refuses what the role does not allow.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Painel do suporte" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Acessos" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Contas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Equipe" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Configurações" })).toHaveCount(0);
  // The active tab's underline overflows by a pixel; the tab list must not show a scrollbar for it.
  expect(await page.getByRole("tablist").evaluate((list) => getComputedStyle(list).scrollbarWidth)).toBe("none");

  // Support frees a client's email and removes it while unused, sees no team account, and blocks nobody.
  const freedEmail = `liberado-${randomUUID()}@exemplo.test`;
  await page.getByRole("button", { name: "Liberar e-mail" }).click();
  await page.getByRole("alertdialog").getByLabel("E-mail da compra").fill(freedEmail);
  await page.getByRole("alertdialog").getByRole("button", { name: "Liberar", exact: true }).click();
  const freedRow = page.getByRole("row").filter({ hasText: freedEmail });
  await freedRow.getByRole("button", { name: "Remover" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(freedRow).toHaveCount(0);
  await page.getByLabel("Buscar por e-mail").fill(staffEmail);
  await expect(page.getByText("Nenhum e-mail encontrado com esse filtro.")).toBeVisible();
  // The grant of a pending team invite belongs to the owner: support neither sees nor removes it.
  const invitedEmail = `convidado-${randomUUID()}@exemplo.test`;
  const [inviteGrant] = await testDatabase<{ id: string }>(
    `insert into access_grants (email, note) values ($1, 'Convite para a equipe') returning id`,
    [invitedEmail],
  );
  await page.getByLabel("Buscar por e-mail").fill(invitedEmail);
  await expect(page.getByText("Nenhum e-mail encontrado com esse filtro.")).toBeVisible();
  const removeInvite = await page.request.delete(`/api/admin/access/${inviteGrant.id}`, { headers: { Origin: baseURL ?? "" } });
  expect(removeInvite.status()).toBe(403);
  await page.getByLabel("Buscar por e-mail").fill(clientEmail);
  const clientAccess = page.getByRole("row").filter({ hasText: clientEmail });
  await expect(clientAccess).toContainText("Conta criada");
  await expect(clientAccess.getByRole("button", { name: "Bloquear" })).toHaveCount(0);
  const [clientAccount] = await testDatabase<{ id: string }>(`select id from "user" where email = $1`, [clientEmail]);
  const blockAttempt = await page.request.post(`/api/admin/accounts/${clientAccount.id}/block`, {
    data: { reason: "teste do suporte" },
    headers: { Origin: baseURL ?? "" },
  });
  expect(blockAttempt.status()).toBe(403);
  await page.goto("/admin?aba=contas");
  expect((await page.request.get("/api/admin/team")).status()).toBe(403);

  // 2. Entering the account asks for a reason, then opens the client's chat under a banner.
  // A literal % or _ matches nothing here instead of acting as a wildcard for every account.
  await page.getByLabel("Buscar por nome ou e-mail").fill("_");
  await expect(page.getByText("Nenhum cliente encontrado com essa busca.")).toBeVisible();
  await page.getByLabel("Buscar por nome ou e-mail").fill(clientName);
  const row = page.getByRole("row").filter({ hasText: clientEmail });
  await row.getByRole("button", { name: "Entrar como cliente" }).click();
  await page.getByRole("button", { name: "Entrar na conta" }).click();
  await expect(page.getByText("Escreva o motivo do acesso.")).toBeVisible();
  await page.getByLabel("Motivo do acesso").fill("Ajuda para importar a planilha");
  await page.getByRole("button", { name: "Entrar na conta" }).click();
  await expect(page).toHaveURL(/\/chat/);
  const banner = page.getByRole("status").filter({ hasText: "acesso de suporte até" });
  await expect(banner).toContainText(clientName);
  const [entered] = await testDatabase<{ details: { reason: string } }>(
    `select details from admin_audit_log where action = 'account.entered' and target_email = $1`,
    [clientEmail],
  );
  expect(entered.details.reason).toBe("Ajuda para importar a planilha");

  // 3. The client's credentials stay with the client, on screen and on the server.
  await page.goto("/perfil");
  await expect(page.getByRole("button", { name: "Trocar senha" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Excluir conta" })).toBeDisabled();
  const changePassword = await page.request.post("/api/auth/change-password", {
    data: { currentPassword: "x", newPassword: "outra-senha-qualquer" },
    headers: { Origin: baseURL! },
  });
  expect(changePassword.status()).toBe(403);
  expect((await page.request.get("/admin")).status()).toBe(404);
  // Even if the client joins the team during the visit, the visit never opens the panel as them.
  await testDatabase(`update "user" set role = 'admin', two_factor_enabled = true where email = $1`, [clientEmail]);
  expect((await page.request.get("/admin")).status()).toBe(404);
  expect((await page.request.get("/api/admin/access")).status()).toBe(404);
  await testDatabase(`update "user" set role = null, two_factor_enabled = false where email = $1`, [clientEmail]);

  // 4. Leaving puts the support member's own session back in the panel.
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  // Retried only until the banner is hydrated, which is when the click sends the request. Clicking
  // again after that would hit a disabled button or a page already navigating away.
  await expect(async () => {
    await Promise.all([
      page.waitForRequest(
        (request) => request.method() === "DELETE" && new URL(request.url()).pathname === "/api/support-visit",
        { timeout: 3_000 },
      ),
      banner.getByRole("button", { name: "Sair da conta" }).click(),
    ]);
  }).toPass({ timeout: 20_000 });
  // The first visit to the panel route can take a while on a loaded dev server.
  await expect(page).toHaveURL(/\/admin\?aba=contas$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Painel do suporte" })).toBeVisible();
  const left = await testDatabase(`select 1 from admin_audit_log where action = 'account.left' and target_email = $1`, [clientEmail]);
  expect(left).toHaveLength(1);

  // 5. From the panel, support changes the client's email and sets a new password the client signs in with.
  const newEmail = `novo-${randomUUID()}@exemplo.test`;
  // A reset link sent to the old address before the change must not open the account afterwards.
  await testDatabase(
    `insert into verification (id, identifier, value, expires_at) values ($1, $2, $3, now() + interval '1 hour')`,
    [randomUUID(), `reset-password:${randomUUID()}`, clientAccount.id],
  );
  const newPassword = "senha-nova-do-suporte";
  const clientRow = () => page.getByRole("row").filter({ hasText: clientName });
  await clientRow().getByRole("button", { name: `Mais ações para ${clientName}` }).click();
  await page.getByRole("menuitem", { name: "Trocar e-mail" }).click();
  await page.getByLabel("E-mail novo").fill(newEmail);
  await page.getByRole("button", { name: "Salvar e-mail" }).click();
  await expect(clientRow()).toContainText(newEmail);
  await clientRow().getByRole("button", { name: `Mais ações para ${clientName}` }).click();
  await page.getByRole("menuitem", { name: "Definir senha nova" }).click();
  await page.getByRole("textbox", { name: "Senha nova", exact: true }).fill(newPassword);
  await page.getByRole("textbox", { name: "Confirme a senha nova" }).fill(newPassword);
  await page.getByRole("button", { name: "Definir senha" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  const audited = await testDatabase<{ action: string; details: Record<string, string> }>(
    `select action, details from admin_audit_log where target_email = $1 and action in ('account.email_changed', 'account.password_set')`,
    [newEmail],
  );
  expect(audited.map((entry) => entry.action).sort()).toEqual(["account.email_changed", "account.password_set"]);
  const pendingResets = await testDatabase(
    `select 1 from verification where identifier like 'reset-password:%' and value = $1`,
    [clientAccount.id],
  );
  expect(pendingResets).toEqual([]);
  expect(JSON.stringify(audited)).not.toContain(newPassword);
  // Whoever was inside the account with the old password is signed out, as on the client's own reset.
  const oldDevice = await browser.newContext({ baseURL, storageState: clientDevice });
  expect(await (await oldDevice.request.get("/api/auth/get-session")).json()).toBeNull();
  await oldDevice.close();
  const clientAgain = await browser.newContext({ baseURL, locale: "pt-BR" });
  const login = await clientAgain.newPage();
  await login.goto("/login");
  await login.getByLabel("E-mail").fill(newEmail);
  await login.getByRole("textbox", { name: "Senha" }).fill(newPassword);
  await login.getByRole("button", { name: "Entrar" }).click();
  await expect(login).toHaveURL(/\/chat/);
  await clientAgain.close();

  // 6. An owner adds that account to the team. Account emails are never verified (support just
  // changed this one), so the role waits for the emailed link plus the account's own sign-in.
  await testDatabase(`update "user" set role = 'owner' where email = $1`, [staffEmail]);
  await page.goto("/admin?aba=equipe");
  await page.getByRole("button", { name: "Adicionar à equipe" }).click();
  await page.getByLabel("E-mail").fill(newEmail);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText(`Convite enviado para ${newEmail}. A pessoa entra como Suporte depois de abrir o e-mail e entrar com a própria senha.`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Convites aguardando resposta" })).toContainText(newEmail);
  const roleOf = async (email: string) => (await testDatabase<{ role: string | null }>(`select role from "user" where email = $1`, [email]))[0]?.role;
  expect(await roleOf(newEmail)).toBeNull();

  // Knowing the account's password without the mailbox (as support does here) gains nothing.
  const member = await browser.newContext({ baseURL, locale: "pt-BR" });
  const memberPage = await member.newPage();
  await waitForAuthSlot("/sign-in/email");
  await memberPage.goto("/login");
  await memberPage.getByLabel("E-mail").fill(newEmail);
  await memberPage.getByRole("textbox", { name: "Senha" }).fill(newPassword);
  await memberPage.getByRole("button", { name: "Entrar" }).click();
  await expect(memberPage).toHaveURL(/\/chat/);
  const guessed = await memberPage.request.post("/api/team-invite", { data: { token: "A".repeat(43) }, headers: { Origin: baseURL! } });
  expect(await guessed.json()).toEqual({ joined: false });
  expect(await roleOf(newEmail)).toBeNull();

  // The mailbox owner opens the emailed link and signs in: the account joins the team.
  await expect.poll(async () => (await emailsTo(newEmail)).length).toBe(1);
  const [teamInvite] = await emailsTo(newEmail);
  expect(teamInvite.subject).toBe("Você foi convidado para a equipe do Criativos Virais");
  const acceptLink = new URL(teamInvite.text.match(/https?:\/\/\S+\/login\?email=\S+/)?.[0] ?? "http://invalid");
  await member.clearCookies();
  await memberPage.goto(acceptLink.pathname + acceptLink.search);
  await expect(memberPage.getByText("Você recebeu um convite para a equipe do Criativos Virais como Suporte.", { exact: false })).toBeVisible();
  await expect(memberPage.getByLabel("E-mail")).toHaveValue(newEmail);
  await waitForAuthSlot("/sign-in/email");
  await memberPage.getByRole("textbox", { name: "Senha" }).fill(newPassword);
  await memberPage.getByRole("button", { name: "Entrar" }).click();
  await expect(memberPage).toHaveURL(/\/admin/);
  await member.close();
  expect(await roleOf(newEmail)).toBe("support");
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: newEmail })).toContainText(panelRequiresTwoFactor ? "Falta ativar" : "Suporte");
  if (!panelRequiresTwoFactor) {
    await expect(page.getByRole("columnheader", { name: "Verificação em duas etapas" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo código" })).toHaveCount(0);
  }

  // 7. An email with no account is invited: it gets the team invite and joins with the role on sign-up.
  const invited = `convidado-${randomUUID()}@exemplo.test`;
  await page.getByRole("button", { name: "Adicionar à equipe" }).click();
  await page.getByLabel("E-mail").fill(invited);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText(`Convite enviado para ${invited}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Convites aguardando resposta" })).toContainText(invited);
  await expect.poll(async () => (await emailsTo(invited)).length).toBe(1);
  const [invite] = await emailsTo(invited);
  expect(invite.subject).toBe("Você foi convidado para a equipe do Criativos Virais");
  const link = new URL(invite.text.match(/https?:\/\/\S+\/signup\?email=\S+/)?.[0] ?? "http://invalid");

  // Knowing an invited email is insufficient to create its staff account, even without panel MFA.
  expect(link.searchParams.get("invite")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await waitForSignUpSlot();
  const unverified = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "Unverified invite", email: invited, password: testPassword },
    headers: { Origin: baseURL! },
  });
  expect(unverified.status()).toBe(403);
  const invalidToken = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "Invalid invite", email: invited, password: testPassword },
    headers: { "x-team-invite-token": "A".repeat(43), Origin: baseURL! },
  });
  expect(invalidToken.status()).toBe(403);
  expect(await testDatabase(`select 1 from "user" where email = $1`, [invited])).toHaveLength(0);
  const [storedInvite] = await testDatabase<{ value: string }>(`select value from verification where identifier = $1`, [`team-invite:${invited}`]);
  expect(storedInvite.value).not.toContain(link.searchParams.get("invite")!);
  const pendingInvites = await page.request.get("/api/admin/team");
  expect(await pendingInvites.text()).not.toContain(link.searchParams.get("invite")!);

  const guest = await browser.newContext({ baseURL, locale: "pt-BR" });
  const guestPage = await guest.newPage();
  await waitForSignUpSlot();
  await guestPage.goto(link.pathname + link.search);
  await guestPage.getByLabel("Nome").fill("Pessoa Convidada");
  await guestPage.getByRole("textbox", { name: "Senha" }).fill(testPassword);
  await guestPage.getByRole("button", { name: "Criar conta" }).click();
  await expect(guestPage).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  // With the temporary panel switch off, a mailbox-verified invite can enter without MFA setup.
  await guestPage.goto("/admin");
  await expect(guestPage.getByRole("heading", { name: "Painel do suporte" })).toBeVisible();
  await guest.close();
  const [joined] = await testDatabase<{ role: string }>(`select role from "user" where email = $1`, [invited]);
  expect(joined.role).toBe("support");
  expect(await testDatabase(`select 1 from verification where identifier = $1`, [`team-invite:${invited}`])).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: invited })).toContainText(panelRequiresTwoFactor ? "Falta ativar" : "Suporte");
  // Only this test's invite: an earlier run may have left another pending one in the shared database.
  await expect(page.getByRole("region", { name: "Convites aguardando resposta" }).getByText(invited)).toHaveCount(0);

  // 8. An invite that expires unused takes back the access it freed.
  const unused = `sem-uso-${randomUUID()}@exemplo.test`;
  await page.getByRole("button", { name: "Adicionar à equipe" }).click();
  await page.getByLabel("E-mail").fill(unused);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText(`Convite enviado para ${unused}`)).toBeVisible();
  await testDatabase(`update verification set expires_at = now() - interval '1 minute' where identifier = $1`, [`team-invite:${unused}`]);
  await page.reload();
  await expect(page.getByText(unused)).toHaveCount(0);
  expect(await testDatabase(`select 1 from access_grants where email = $1`, [unused])).toHaveLength(0);
});

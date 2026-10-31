import { eq, sql } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { batches, batchGenerations, batchItems, clientContexts, creatives } from "@/db/schema";
import { getJobs, jobTransaction } from "@/jobs";
import { batchRequest } from "./ai/batch-request";
import { batchSchema, batchItemSchema } from "./ai/schemas";
import { textModel, providerOptions } from "./ai/model";
import { buildSystemPrompt, untrusted } from "./ai/system-prompt";
import { reviseUntilApproved } from "./batch-revision";
import { spDayBr } from "./dates";
import { DomainError } from "./errors";
import { bigintReplacer } from "./json";
import { tenantValues, tenantWhere } from "./tenant-scope";
const maxRound = 2147483647;
const missingContext =
  "Confirme produto, público, transformação, ticket, funil e próximo passo antes de gerar.";
type ClientContext = typeof clientContexts.$inferSelect;
function contextReady(context: ClientContext | undefined): context is ClientContext {
  return Boolean(
    context?.produto &&
      context.publico &&
      context.transformacao &&
      context.tipoFunil &&
      context.proximoPassoFunil &&
      context.ticketCents !== null,
  );
}
async function loadContext(tenantId: string) {
  const [context] = await db
    .select()
    .from(clientContexts)
    .where(tenantWhere(clientContexts, tenantId))
    .limit(1);
  return context;
}
function titlePart(text: string, max = 80) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
function deadline(ms: number, signal?: AbortSignal) {
  return signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms);
}
const qualitySchema = z.object({
  checks: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        passed: z.boolean(),
        issues: z.array(z.string().max(1000)).max(20),
      }),
    )
    .max(12),
});
async function quality(
  tenantId: string,
  items: z.infer<typeof batchItemSchema>[],
  system: string,
  signal?: AbortSignal,
) {
  const { output: object } = await generateText({
    model: textModel({ tenantId, purpose: "batch" }),
    providerOptions,
    output: Output.object({ schema: qualitySchema }),
    maxOutputTokens: 4000,
    instructions: system,
    prompt: `Verifique CADA item pelos 15 critérios da seção 26. Falta de prova não autoriza inventar; prova ausente deve estar declarada. Retorne index (base zero), passed e issues para TODOS os itens.\n${untrusted("items", items)}`,
    maxRetries: 1,
    abortSignal: deadline(90_000, signal),
  });
  if (
    object.checks.length !== items.length ||
    new Set(object.checks.map((c) => c.index)).size !== items.length ||
    object.checks.some((c) => c.index >= items.length)
  )
    throw new Error("Incomplete quality check");
  return object.checks;
}
async function rewriteItem(
  tenantId: string,
  system: string,
  item: z.infer<typeof batchItemSchema>,
  issues: string[],
  signal?: AbortSignal,
) {
  const { output } = await generateText({
    model: textModel({ tenantId, purpose: "batch" }),
    providerOptions,
    output: Output.object({ schema: batchItemSchema }),
    maxOutputTokens: 5000,
    instructions: system,
    prompt: `Corrija somente este item pelos critérios de qualidade.\n${untrusted("failed_item", { item, issues })}`,
    maxRetries: 1,
    abortSignal: deadline(90_000, signal),
  });
  return output;
}
export async function generateBatch(
  tenantId: string,
  conversationId: string,
  quantity: number,
  instructions: string,
  signal?: AbortSignal,
) {
  const context = await loadContext(tenantId);
  if (!contextReady(context)) throw new DomainError("invalid_input", missingContext);
  const system = await buildSystemPrompt(tenantId, conversationId);
  const { output: object } = await generateText({
    model: textModel({ tenantId, purpose: "batch" }),
    providerOptions,
    output: Output.object({ schema: batchSchema }),
    maxOutputTokens: 24000,
    instructions: system,
    prompt: `${batchRequest(quantity)}\n${untrusted("generation_request", instructions)}`,
    maxRetries: 1,
    abortSignal: deadline(180_000, signal),
  });
  if (object.items.length !== quantity)
    throw new Error("Unexpected batch size");
  const checks = await quality(tenantId, object.items, system, signal);
  for (const check of checks.filter((c) => !c.passed))
    object.items[check.index] = await reviseUntilApproved(
      object.items[check.index],
      check.issues,
      (item, issues) => rewriteItem(tenantId, system, item, issues, signal),
      async (item) => (await quality(tenantId, [item], system, signal))[0],
    );
  signal?.throwIfAborted();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${tenantId},1))`,
    );
    signal?.throwIfAborted();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId},2))`);
    const [currentContext] = await tx.select().from(clientContexts)
      .where(tenantWhere(clientContexts, tenantId)).for("update");
    const serialize = (value: unknown) => JSON.stringify(value, bigintReplacer);
    if (serialize(currentContext) !== serialize(context))
      throw new Error("O contexto mudou durante a geração. Confira as provas e gere novamente.");
    const [{ maxRound: lastRound }] = await tx
      .select({
        maxRound: sql<number>`coalesce(max(${batches.roundNumber}),0)::int`,
      })
      .from(batches)
      .where(tenantWhere(batches, tenantId));
    let round = lastRound + 1;
    const occupied = new Set((await tx.select({ key: creatives.creativeKey })
      .from(creatives).where(tenantWhere(creatives, tenantId,
        sql`${creatives.creativeKey} ~ '^L[0-9]+-C[0-9]+$'`))).map((row) => row.key));
    const keyAt = (position: number) => `L${String(round).padStart(2, "0")}-C${String(position).padStart(2, "0")}`;
    for (;;) {
      if (round > maxRound) throw new Error("Limite de rodadas atingido.");
      if (!object.items.some((_, index) => occupied.has(keyAt(index + 1)))) break;
      round++;
    }
    const produtoNome = context.produtoNome || context.produto!;
    const [batch] = await tx
      .insert(batches)
      .values(
        tenantValues(tenantId, {
          conversationId,
          title: `Leva ${String(round).padStart(2, "0")} · ${titlePart(produtoNome)} · ${spDayBr()}`,
          produtoNome,
          especialistaHandle: context.especialistaHandle,
          roundNumber: round,
        }),
      )
      .returning();
    await tx.insert(batchItems).values(
      object.items.map((i, idx) => tenantValues(tenantId, {
        batchId: batch.id,
        position: idx + 1,
        creativeKey: keyAt(idx + 1),
        ideia: i.ideia,
        formato: i.formato,
        referencia: i.referencia,
        instrucoesGravacao: i.instrucoes_gravacao,
        instrucoesEdicao: i.instrucoes_edicao,
        g1: i.g1,
        g2: i.g2,
        g3: i.g3,
        g4: i.g4,
        corpo: i.corpo,
        narrativa: i.narrativa,
        awarenessEntry: i.awareness_entry,
        awarenessExit: i.awareness_exit,
        skeleton: i.skeleton,
        hipotese: i.hipotese,
        blocoTestado: i.bloco_testado,
        provaUsada: i.prova_usada,
        duracaoEstimada: i.duracao_estimada,
      })),
    );
    await tx.insert(creatives).values(object.items.map((item, index) =>
      tenantValues(tenantId, { creativeKey: keyAt(index + 1), name: item.ideia, source: "generated" })));
    signal?.throwIfAborted();
    return { id: batch.id, title: batch.title };
  });
}
export async function getBatch(tenantId: string, id: string) {
  const [batch] = await db
    .select()
    .from(batches)
    .where(tenantWhere(batches, tenantId, eq(batches.id, id)))
    .limit(1);
  if (!batch) return null;
  const items = await db
    .select()
    .from(batchItems)
    .where(tenantWhere(batchItems, tenantId, eq(batchItems.batchId, id)))
    .orderBy(batchItems.position);
  return { ...batch, items };
}

/**
 * Records a batch request and queues it for the worker, so the chat answers at once instead of
 * holding the request through generation and review (which can outlast its 600 s limit).
 */
export async function startBatchGeneration(
  tenantId: string,
  conversationId: string,
  quantity: number,
  instructions: string,
) {
  const context = await loadContext(tenantId);
  if (!contextReady(context)) throw new DomainError("invalid_input", missingContext);
  const [{ lastRound }] = await db
    .select({ lastRound: sql<number>`coalesce(max(${batches.roundNumber}),0)::int` })
    .from(batches)
    .where(tenantWhere(batches, tenantId));
  const title = `Leva ${String(lastRound + 1).padStart(2, "0")} · ${titlePart(context.produtoNome || context.produto!)}`;
  const boss = await getJobs();
  return jobTransaction(async (tx, connection) => {
    const [generation] = await tx
      .insert(batchGenerations)
      .values(tenantValues(tenantId, { conversationId, quantity, instructions, title }))
      .returning({ id: batchGenerations.id, title: batchGenerations.title });
    await boss.send(
      "generate-batch",
      { tenantId, generationId: generation.id },
      { db: connection, singletonKey: generation.id },
    );
    return generation;
  });
}

import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientContexts,
  batches,
  batchItems,
  learnings,
  sharedPatterns,
  creativeMetrics,
  integrations,
  conversations,
  messages,
  creativeSelections,
  videoAnalyses,
  creatives,
} from "@/db/schema";
import { tenantWhere } from "../tenant-scope";
import { analysisColumns } from "./analysis-columns";
import { masterDocument } from "./master-document";
import { assembleSystemPrompt, untrusted } from "./prompt-sections";
export { masterDocument, untrusted };
/** Message metadata sent by the chat client: `{ assetIds }` of attached videos. */
export const attachmentsSchema = z.object({
  assetIds: z.array(z.uuid().transform((id) => id.toLowerCase())).max(5),
});
const storedMessageSchema = z.object({
  parts: z.array(z.unknown()).catch([]),
  metadata: attachmentsSchema.optional().catch(undefined),
});
function stored(content: unknown) {
  const result = storedMessageSchema.safeParse(content);
  return result.success ? result.data : { parts: [], metadata: undefined };
}
/** Plain text of a stored UIMessage; non-text parts are ignored. */
export function messageText(content: unknown) {
  const { parts } = stored(content);
  return parts
    .flatMap((part) => {
      const value = part as { type?: unknown; text?: unknown } | null;
      return value?.type === "text" && typeof value.text === "string" ? [value.text] : [];
    })
    .join("\n");
}
/** Asset ids attached through message metadata. */
export function messageAttachments(content: unknown) {
  return stored(content).metadata?.assetIds ?? [];
}
/** Asset ids attached to a stored message, including the legacy `asset_id:` text form. */
export function messageAssetIds(content: unknown) {
  const legacy = [
    ...messageText(content).matchAll(
      /asset_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    ),
  ].map((match) => match[1].toLowerCase());
  return [...messageAttachments(content), ...legacy];
}
export async function buildSystemPrompt(
  tenantId: string,
  conversationId?: string,
  // Chat sends the history as messages; batch generation needs it embedded.
  { embedConversation = true } = {},
) {
  let history: { role: string; content: unknown }[] = [];
  if (conversationId) {
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(tenantWhere(conversations, tenantId, eq(conversations.id, conversationId)))
      .limit(1);
    if (!conversation) throw new Error("Conversation not found");
    history = (
      await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(tenantWhere(messages, tenantId, eq(messages.conversationId, conversationId)))
        .orderBy(desc(messages.createdAt))
        .limit(10)
    ).reverse();
  }
  const conversationText = embedConversation
    ? history.map(({ role, content }) => ({
        role,
        text: messageText(content).slice(0, 6000),
      }))
    : [];
  const selected = await db
    .select({ creativeId: creativeSelections.creativeId })
    .from(creativeSelections)
    .where(tenantWhere(creativeSelections, tenantId))
    .orderBy(desc(creativeSelections.createdAt))
    .limit(12);
  const assetIds = [
    ...new Set(
      history
        .filter((m) => m.role === "user")
        .flatMap((m) => messageAssetIds(m.content)),
    ),
  ];
  const evidence =
    selected.length || assetIds.length
      ? await db
          .select({ creativeKey: creatives.creativeKey, ...analysisColumns })
          .from(videoAnalyses)
          .leftJoin(
            creatives,
            tenantWhere(creatives, tenantId, eq(creatives.id, videoAnalyses.creativeId)),
          )
          .where(
            tenantWhere(
              videoAnalyses,
              tenantId,
              or(
                selected.length
                  ? inArray(videoAnalyses.creativeId, selected.map((s) => s.creativeId))
                  : undefined,
                assetIds.length ? inArray(videoAnalyses.assetId, assetIds) : undefined,
              ),
            ),
          )
          .orderBy(desc(videoAnalyses.createdAt))
          .limit(12)
      : [];
  const [context] = await db
    .select()
    .from(clientContexts)
    .where(tenantWhere(clientContexts, tenantId))
    .limit(1);
  const recent = await db
    .select({
      id: batches.id,
      title: batches.title,
      round: batches.roundNumber,
    })
    .from(batches)
    .where(tenantWhere(batches, tenantId))
    .orderBy(desc(batches.createdAt))
    .limit(3);
  const items = recent.length
    ? await db
        .select({
          ideia: batchItems.ideia,
          creativeKey: batchItems.creativeKey,
          narrativa: batchItems.narrativa,
          hipotese: batchItems.hipotese,
          skeleton: batchItems.skeleton,
        })
        .from(batchItems)
        .where(
          tenantWhere(
            batchItems,
            tenantId,
            inArray(
              batchItems.batchId,
              recent.map((b) => b.id),
            ),
          ),
        )
        .limit(36)
    : [];
  const learned = await db
    .select({
      texto: learnings.texto,
      evidenceLevel: learnings.evidenceLevel,
      creativeId: learnings.creativeId,
    })
    .from(learnings)
    .where(tenantWhere(learnings, tenantId))
    .orderBy(desc(learnings.createdAt))
    .limit(30);
  // Shared patterns are anonymous abstractions and intentionally not tenant-scoped.
  const patterns = await db
    .select({
      descricao: sharedPatterns.descricao,
      esqueleto: sharedPatterns.esqueleto,
      nivelConsciencia: sharedPatterns.nivelConsciencia,
      evidenceLevel: sharedPatterns.evidenceLevel,
    })
    .from(sharedPatterns)
    .where(eq(sharedPatterns.evidenceLevel, "hipotese"))
    .limit(12);
  const sources = await db
    .select({
      source: creativeMetrics.source,
      from: sql<string>`min(${creativeMetrics.periodFrom})::text`,
      to: sql<string>`max(${creativeMetrics.periodTo})::text`,
    })
    .from(creativeMetrics)
    .where(tenantWhere(creativeMetrics, tenantId))
    .groupBy(creativeMetrics.source);
  const definitions = await db
    .select({
      provider: integrations.provider,
      metadata: integrations.metadata,
    })
    .from(integrations)
    .where(tenantWhere(integrations, tenantId, eq(integrations.provider, "csv")));
  return assembleSystemPrompt(await masterDocument(), {
    ...(embedConversation ? { conversation: conversationText } : {}),
    evidence,
    definitions,
    sources,
    context,
    recent: { recent, items },
    learned,
    patterns,
  });
}

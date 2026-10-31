import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  doublePrecision,
  jsonb,
  date,
  index,
  unique,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const id = () => uuid("id").defaultRandom().primaryKey();
const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });
// Money (cents) and counts are exact bigints; missing values stay NULL.
const int64 = (name: string) => bigint(name, { mode: "bigint" });
const jsonArray = (name: string) =>
  jsonb(name).$type<unknown[]>().default([]).notNull();
export const clientState = pgEnum("client_state", [
  "A_validado",
  "B_sinais",
  "C_zero",
]);
export const assetKind = pgEnum("asset_kind", ["video", "audio"]);
export const assetStatus = pgEnum("asset_status", [
  "uploaded",
  "processing",
  "done",
  "error",
]);
export const provider = pgEnum("integration_provider", [
  "utmify",
  "vkmetrics",
  "csv",
  "webhook",
  "hotmart",
]);
export const evidenceLevel = pgEnum("evidence_level", [
  "hipotese",
  "sinal_atencao",
  "sinal_clique",
  "sinal_lead",
  "sinal_venda",
  "validacao_economica",
  "repetido",
]);
export const saleStatus = pgEnum("sale_status", [
  "pending",
  "approved",
  "refunded",
  "chargeback",
  "cancelled",
  "failed",
]);
export const memberRole = pgEnum("member_role", ["owner", "member"]);
export const accessSource = pgEnum("access_source", ["manual", "hotmart"]);

// Better Auth owns these six tables; they are identity records, not tenant content.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  // Better Auth admin plugin: "admin" opens /admin; a banned user cannot start a session.
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  // Better Auth two-factor plugin; required for admins.
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    uniqueIndex("account_provider_unique").on(t.providerId, t.accountId),
  ],
);
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factor_secret_idx").on(t.secret), index("two_factor_user_idx").on(t.userId)],
);
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const tenants = pgTable("tenants", {
  id: id(),
  nome: text("nome").notNull(),
  createdAt: createdAt(),
});
export const tenantMembers = pgTable(
  "tenant_members",
  {
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").default("owner").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId] }),
    index("tenant_members_tenant_idx").on(t.tenantId),
    uniqueIndex("tenant_members_user_unique").on(t.userId),
  ],
);

export const clientContexts = pgTable(
  "client_contexts",
  {
    id: id(),
    tenantId: tenantId(),
    produto: text("produto"),
    publico: text("publico"),
    transformacao: text("transformacao"),
    mecanismo: text("mecanismo"),
    ticketCents: int64("ticket_cents"),
    tipoFunil: text("tipo_funil"),
    proximoPassoFunil: text("proximo_passo_funil"),
    provasAutorizadas: jsonArray("provas_autorizadas"),
    objecoes: jsonArray("objecoes"),
    restricoes: jsonArray("restricoes"),
    estadoCliente: clientState("estado_cliente"),
    especialistaHandle: text("especialista_handle"),
    produtoNome: text("produto_nome"),
    notas: jsonArray("notas"),
    updatedAt: updatedAt(),
  },
  // One context per tenant; the unique index also serves tenant lookups.
  (t) => [uniqueIndex("client_contexts_tenant_unique").on(t.tenantId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    tenantId: tenantId(),
    title: text("title").notNull(),
    processingToken: text("processing_token"),
    processingUntil: timestamp("processing_until", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("conversations_tenant_idx").on(t.tenantId),
    unique("conversations_tenant_id_unique").on(t.tenantId, t.id),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    tenantId: tenantId(),
    conversationId: uuid("conversation_id").notNull(),
    role: text("role", {
      enum: ["user", "assistant", "system", "tool"],
    }).notNull(),
    content: jsonb("content").notNull(),
    clientMessageId: text("client_message_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_tenant_idx").on(t.tenantId),
    uniqueIndex("messages_client_unique").on(
      t.tenantId,
      t.conversationId,
      t.clientMessageId,
    ),
    unique("messages_tenant_id_unique").on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
    }).onDelete("cascade"),
  ],
);

export const creatives = pgTable(
  "creatives",
  {
    id: id(),
    tenantId: tenantId(),
    creativeKey: text("creative_key").notNull(),
    name: text("name"),
    campaignKey: text("campaign_key"),
    adsetKey: text("adset_key"),
    source: text("source").notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("creatives_tenant_idx").on(t.tenantId),
    unique("creatives_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("creatives_key_unique").on(t.tenantId, t.creativeKey),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    tenantId: tenantId(),
    creativeId: uuid("creative_id"),
    kind: assetKind("kind").notNull(),
    s3Key: text("s3_key").notNull(),
    mime: text("mime").notNull(),
    size: int64("size").notNull(),
    durationS: doublePrecision("duration_s"),
    status: assetStatus("status").default("uploaded").notNull(),
    errorMessage: text("error_message"),
    uploadCompletedAt: timestamp("upload_completed_at", { withTimezone: true }),
    transcription: jsonb("transcription"),
    createdAt: createdAt(),
  },
  (t) => [
    index("assets_tenant_idx").on(t.tenantId),
    unique("assets_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("assets_key_unique").on(t.tenantId, t.s3Key),
    foreignKey({
      columns: [t.tenantId, t.creativeId],
      foreignColumns: [creatives.tenantId, creatives.id],
    }).onDelete("cascade"),
  ],
);

export const creativeMetrics = pgTable(
  "creative_metrics",
  {
    id: id(),
    tenantId: tenantId(),
    creativeId: uuid("creative_id").notNull(),
    // Empty means unknown; never infer a historical campaign from mutable creative metadata.
    campaignKey: text("campaign_key").default("").notNull(),
    periodFrom: date("period_from").notNull(),
    periodTo: date("period_to").notNull(),
    spendCents: int64("spend_cents"),
    impressions: int64("impressions"),
    clicks: int64("clicks"),
    ctr: doublePrecision("ctr"),
    hookRate: doublePrecision("hook_rate"),
    bodyRate: doublePrecision("body_rate"),
    leads: int64("leads"),
    checkouts: int64("checkouts"),
    approvedSales: int64("approved_sales"),
    revenueCents: int64("revenue_cents"),
    profitCents: int64("profit_cents"),
    roas: doublePrecision("roas"),
    refunds: int64("refunds"),
    chargebacks: int64("chargebacks"),
    source: text("source").notNull(),
    confidence: text("confidence"),
  },
  (t) => [
    index("creative_metrics_tenant_idx").on(t.tenantId),
    unique("creative_metrics_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("creative_metrics_period_unique").on(
      t.tenantId,
      t.creativeId,
      t.periodFrom,
      t.periodTo,
      t.source,
      t.campaignKey,
    ),
    check(
      "creative_metrics_period_check",
      sql`${t.periodFrom} <= ${t.periodTo}`,
    ),
    foreignKey({
      columns: [t.tenantId, t.creativeId],
      foreignColumns: [creatives.tenantId, creatives.id],
    }).onDelete("cascade"),
  ],
);

export const salesEvents = pgTable(
  "sales_events",
  {
    id: id(),
    tenantId: tenantId(),
    eventId: text("event_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: saleStatus("status").notNull(),
    currency: text("currency").notNull(),
    revenueCents: int64("revenue_cents"),
    profitCents: int64("profit_cents"),
    creativeKey: text("creative_key"),
    utmSource: text("utm_source"),
    utmCampaign: text("utm_campaign"),
    utmMedium: text("utm_medium"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    source: text("source").notNull(),
    raw: jsonb("raw").notNull(),
  },
  (t) => [
    index("sales_events_tenant_idx").on(t.tenantId),
    unique("sales_events_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("sales_events_idempotency_unique").on(t.tenantId, t.eventId),
    index("sales_events_creative_period_idx").on(
      t.tenantId,
      t.creativeKey,
      t.occurredAt,
    ),
    check("sales_events_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const videoAnalyses = pgTable(
  "video_analyses",
  {
    id: id(),
    tenantId: tenantId(),
    assetId: uuid("asset_id").notNull(),
    creativeId: uuid("creative_id"),
    transcript: text("transcript").notNull(),
    segments: jsonArray("segments"),
    narrative: text("narrative").notNull(),
    awarenessEntry: text("awareness_entry").notNull(),
    awarenessExit: text("awareness_exit").notNull(),
    skeleton: text("skeleton").notNull(),
    format: text("format").notNull(),
    proofTypes: jsonArray("proof_types"),
    cta: text("cta").notNull(),
    visualNotes: jsonArray("visual_notes"),
    uncertainties: jsonArray("uncertainties"),
    createdAt: createdAt(),
  },
  (t) => [
    index("video_analyses_tenant_idx").on(t.tenantId),
    unique("video_analyses_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("video_analyses_asset_unique").on(t.tenantId, t.assetId),
    foreignKey({
      columns: [t.tenantId, t.assetId],
      foreignColumns: [assets.tenantId, assets.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.creativeId],
      foreignColumns: [creatives.tenantId, creatives.id],
    }).onDelete("cascade"),
  ],
);

export const creativeSelections = pgTable(
  "creative_selections",
  {
    id: id(),
    tenantId: tenantId(),
    creativeId: uuid("creative_id").notNull(),
    reason: text("reason").notNull(),
    metricGroups: jsonArray("metric_groups"),
    createdAt: createdAt(),
  },
  (t) => [
    index("creative_selections_tenant_idx").on(t.tenantId),
    unique("creative_selections_tenant_id_unique").on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.creativeId],
      foreignColumns: [creatives.tenantId, creatives.id],
    }).onDelete("cascade"),
  ],
);

export const batches = pgTable(
  "batches",
  {
    id: id(),
    tenantId: tenantId(),
    conversationId: uuid("conversation_id").notNull(),
    title: text("title").notNull(),
    produtoNome: text("produto_nome").notNull(),
    especialistaHandle: text("especialista_handle"),
    roundNumber: integer("round_number").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("batches_tenant_idx").on(t.tenantId),
    unique("batches_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("batches_round_unique").on(t.tenantId, t.roundNumber),
    check("batches_round_positive", sql`${t.roundNumber} > 0`),
    foreignKey({
      columns: [t.tenantId, t.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
    }).onDelete("cascade"),
  ],
);

export const aiPurpose = pgEnum("ai_purpose", ["chat", "batch", "video"]);
// One row per model call, for the monthly AI budget of each operation.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    tenantId: tenantId(),
    purpose: aiPurpose("purpose").notNull(),
    // NULL when the provider did not report the count.
    inputTokens: integer("input_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    outputTokens: integer("output_tokens"),
    // Thousandths of a BRL cent: a single call usually costs a fraction of a cent.
    costMillicents: int64("cost_millicents").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_tenant_created_idx").on(t.tenantId, t.createdAt)],
);
export const batchGenerationStatus = pgEnum("batch_generation_status", [
  "queued",
  "running",
  "done",
  "failed",
]);

/** A batch requested in the chat and generated by the worker, outside the chat request. */
export const batchGenerations = pgTable(
  "batch_generations",
  {
    id: id(),
    tenantId: tenantId(),
    conversationId: uuid("conversation_id").notNull(),
    quantity: integer("quantity").notNull(),
    instructions: text("instructions").notNull(),
    // Title shown while generating ("Leva 02 · Produto"); the saved batch may get a later round.
    title: text("title").notNull(),
    status: batchGenerationStatus("status").default("queued").notNull(),
    batchId: uuid("batch_id"),
    // Plain pt-BR message safe to show; technical details stay in the worker log.
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("batch_generations_tenant_idx").on(t.tenantId),
    unique("batch_generations_tenant_id_unique").on(t.tenantId, t.id),
    check("batch_generations_quantity_range", sql`${t.quantity} BETWEEN 1 AND 12`),
    foreignKey({
      columns: [t.tenantId, t.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.batchId],
      foreignColumns: [batches.tenantId, batches.id],
    }),
  ],
);

export const batchItems = pgTable(
  "batch_items",
  {
    id: id(),
    tenantId: tenantId(),
    batchId: uuid("batch_id").notNull(),
    position: integer("position").notNull(),
    creativeKey: text("creative_key").notNull(),
    ideia: text("ideia").notNull(),
    formato: text("formato").default("").notNull(),
    referencia: text("referencia").default("").notNull(),
    instrucoesGravacao: text("instrucoes_gravacao").default("").notNull(),
    instrucoesEdicao: text("instrucoes_edicao").default("").notNull(),
    g1: text("g1").notNull(),
    g2: text("g2").notNull(),
    g3: text("g3").notNull(),
    // Batches generated before four hooks per script have only three.
    g4: text("g4"),
    corpo: text("corpo").notNull(),
    narrativa: text("narrativa").notNull(),
    awarenessEntry: text("awareness_entry").notNull(),
    awarenessExit: text("awareness_exit").notNull(),
    skeleton: text("skeleton").notNull(),
    hipotese: text("hipotese").notNull(),
    blocoTestado: text("bloco_testado").notNull(),
    provaUsada: text("prova_usada").notNull(),
    duracaoEstimada: integer("duracao_estimada").notNull(),
  },
  (t) => [
    index("batch_items_tenant_idx").on(t.tenantId),
    unique("batch_items_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("batch_items_position_unique").on(
      t.tenantId,
      t.batchId,
      t.position,
    ),
    uniqueIndex("batch_items_key_unique").on(t.tenantId, t.creativeKey),
    check("batch_items_position_positive", sql`${t.position} > 0`),
    foreignKey({
      columns: [t.tenantId, t.batchId],
      foreignColumns: [batches.tenantId, batches.id],
    }).onDelete("cascade"),
  ],
);

export const learnings = pgTable(
  "learnings",
  {
    id: id(),
    tenantId: tenantId(),
    batchId: uuid("batch_id"),
    creativeId: uuid("creative_id"),
    texto: text("texto").notNull(),
    evidenceLevel: evidenceLevel("evidence_level").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("learnings_tenant_idx").on(t.tenantId),
    unique("learnings_tenant_id_unique").on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.batchId],
      foreignColumns: [batches.tenantId, batches.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.creativeId],
      foreignColumns: [creatives.tenantId, creatives.id],
    }).onDelete("cascade"),
  ],
);

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    tenantId: tenantId(),
    provider: provider("provider").notNull(),
    credentialsEncrypted: text("credentials_encrypted"),
    tokenHash: text("token_hash").unique(),
    metadata: jsonb("metadata"),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    status: text("status").default("disconnected").notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  },
  (t) => [
    index("integrations_tenant_idx").on(t.tenantId),
    unique("integrations_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("integrations_provider_unique").on(t.tenantId, t.provider),
  ],
);

// Curated anonymous abstractions only; never insert client copy, names or identifying numbers here.
export const sharedPatterns = pgTable("shared_patterns", {
  id: id(),
  tipo: text("tipo").notNull(),
  descricao: text("descricao").notNull(),
  esqueleto: text("esqueleto"),
  nivelConsciencia: text("nivel_consciencia"),
  condicoes: jsonArray("condicoes"),
  evidenceLevel: evidenceLevel("evidence_level").notNull(),
  createdAt: createdAt(),
});

// Platform operation, outside any tenant: who may create an account, and what admins did.
export const accessGrants = pgTable("access_grants", {
  id: id(),
  // Stored lowercased and trimmed; sign-up compares the same way.
  email: text("email").notNull().unique(),
  source: accessSource("source").default("manual").notNull(),
  note: text("note"),
  grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: id(),
    // The actor's email is copied so the record survives the actor's account.
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetEmail: text("target_email"),
    // Plain details for people (reason, note); never secrets.
    details: jsonb("details").$type<Record<string, string>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("admin_audit_log_created_idx").on(t.createdAt)],
);

// What a cancelled Hotmart subscription does: block at once, or keep access until the paid period ends.
export const accessEndPolicy = pgEnum("access_end_policy", ["immediate", "end_of_period"]);
// Platform settings the owner changes in the panel; a single row. NULL falls back to the server environment.
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    // Encrypted with ENCRYPTION_KEY; never sent back to the browser.
    hotmartHottok: text("hotmart_hottok"),
    hotmartProductIds: text("hotmart_product_ids").array(),
    aiMonthlyLimitCents: int64("ai_monthly_limit_cents"),
    accessEndPolicy: accessEndPolicy("access_end_policy").default("immediate").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [check("app_settings_single_row", sql`${t.id} = 1`)],
);

// LGPD: who accepted which version of the terms and privacy policy, and when.
export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("legal_acceptances_user_version_unique").on(t.userId, t.version)],
);

// Marco Civil, art. 15: application access records (date, time and IP) kept for six months.
// No foreign key: the record must outlive a deleted account until the purge removes it.
export const accessLog = pgTable(
  "access_log",
  {
    id: id(),
    userId: text("user_id").notNull(),
    // Set when a team member opened the session inside a client's account.
    impersonatedBy: text("impersonated_by"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("access_log_created_idx").on(t.createdAt)],
);

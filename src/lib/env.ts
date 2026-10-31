import { z } from "zod";
import { ConfigError } from "./errors";

const filled = z.string().trim().min(1);
const base64Key = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .refine((v) => Buffer.from(v, "base64").length === 32);
// Compose files pass unset variables as "", and a stray space must not read as zero: both fall
// back to the default.
const centsOr = (fallback: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().nonnegative().default(fallback),
  );
const schemas = {
  db: z.object({ DATABASE_URL: z.url() }),
  auth: z.object({
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
  }),
  storage: z.object({
    S3_ENDPOINT: z.url(),
    S3_PUBLIC_ENDPOINT: z.url().optional().or(z.literal("").transform(() => undefined)),
    S3_REGION: filled,
    S3_ACCESS_KEY: filled,
    S3_SECRET_KEY: filled,
    S3_BUCKET: z.string().min(3),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]),
  }),
  ai: z.object({
    DEEPSEEK_API_KEY: filled,
    DEEPSEEK_MODEL_TEXT: filled,
    // Compose files pass unset variables as "", which means the vision model is not configured.
    DEEPSEEK_MODEL_VISION: filled.optional().or(z.literal("").transform(() => undefined)),
  }),
  aiProvider: z
    .object({
      AI_PROVIDER: z.enum(["deepseek", "fake"]).optional().or(z.literal("").transform(() => undefined)),
      NODE_ENV: z.string().optional(),
    })
    // The fake model exists only for development and automated tests.
    .refine((v) => v.AI_PROVIDER !== "fake" || v.NODE_ENV !== "production"),
  aiBudget: z.object({
    // Monthly AI spend allowed per operation, in BRL cents; the month follows São Paulo time.
    AI_MONTHLY_LIMIT_CENTS: centsOr(2000),
    // Provider prices in BRL cents per million tokens, copied from the provider's price table.
    AI_PRICE_INPUT_CENTS_PER_MTOK: centsOr(170),
    AI_PRICE_CACHED_INPUT_CENTS_PER_MTOK: centsOr(20),
    AI_PRICE_OUTPUT_CENTS_PER_MTOK: centsOr(680),
  }),
  transcribe: z.object({
    GROQ_API_KEY: filled,
    GROQ_WHISPER_MODEL: filled,
  }),
  email: z.object({
    RESEND_API_KEY: filled,
    EMAIL_FROM: filled,
  }),
  emailOutbox: z
    .object({
      EMAIL_OUTBOX_DIR: filled,
      NODE_ENV: z.string().optional(),
    })
    // The file outbox exists only for development and automated tests.
    .refine((v) => v.NODE_ENV !== "production"),
  hotmart: z.object({
    // The Hotmart account's hottok, sent in X-HOTMART-HOTTOK on every webhook call.
    HOTMART_HOTTOK: filled,
    // Comma-separated Hotmart product ids that grant access; other products on the account are ignored.
    HOTMART_PRODUCT_IDS: filled
      .transform((v) => v.split(",").map((id) => id.trim()).filter((id) => id.length > 0))
      // "," alone would turn every purchase into "ignored" without any warning.
      .refine((ids) => ids.length > 0),
  }),
  privateMethod: z.object({
    // The mentor's paid method, kept only on the server. Base64 so the Markdown survives the host's
    // variable editor; compose files pass it as "" when unset. Line breaks are dropped because
    // `base64` wraps its output at 76 columns by default.
    PRIVATE_METHOD_BASE64: z
      .string()
      .transform((v) => v.replace(/\s/g, ""))
      .pipe(z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/))
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
  }),
  crypto: z.object({
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/)
      .refine((v) => Buffer.from(v, "base64").length === 32),
  }),
  backup: z.object({
    BACKUP_S3_ENDPOINT: z.url(),
    BACKUP_S3_REGION: filled,
    BACKUP_S3_ACCESS_KEY: filled,
    BACKUP_S3_SECRET_KEY: filled,
    BACKUP_S3_BUCKET: z.string().min(3),
    BACKUP_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
    // Separate from ENCRYPTION_KEY, which must never travel with the backups it protects.
    BACKUP_ENCRYPTION_KEY: base64Key,
  }),
};
type Group = keyof typeof schemas;
const cache = new Map<Group, unknown>();

/** Validates one configuration group on first use; builds never need runtime secrets. */
function group<G extends Group>(name: G): z.infer<(typeof schemas)[G]> {
  if (!cache.has(name)) {
    const result = schemas[name].safeParse(process.env);
    if (!result.success) throw new ConfigError(name);
    cache.set(name, result.data);
  }
  return cache.get(name) as z.infer<(typeof schemas)[G]>;
}
/** Optional providers report absence instead of throwing. */
function optionalGroup<G extends Group>(name: G) {
  const result = schemas[name].safeParse(process.env);
  return result.success ? (result.data as z.infer<(typeof schemas)[G]>) : null;
}

export const dbEnv = () => group("db");
export const authEnv = () => group("auth");
export const storageEnv = () => group("storage");
export const cryptoEnv = () => group("crypto");
export const aiEnv = () => optionalGroup("ai");
export const aiProviderEnv = () => group("aiProvider");
export const aiBudgetEnv = () => group("aiBudget");
export const transcribeEnv = () => optionalGroup("transcribe");
export const emailEnv = () => optionalGroup("email");
export const emailOutboxEnv = () => optionalGroup("emailOutbox");
export const hotmartEnv = () => optionalGroup("hotmart");
export const privateMethodEnv = () => group("privateMethod");

const optionalProviders = {
  ai: { feature: "chat and batch generation", variables: ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL_TEXT"] },
  transcribe: { feature: "audio and video transcription", variables: ["GROQ_API_KEY", "GROQ_WHISPER_MODEL"] },
  email: { feature: "password reset by email", variables: ["RESEND_API_KEY", "EMAIL_FROM"] },
  hotmart: { feature: "automatic access from Hotmart purchases", variables: ["HOTMART_HOTTOK", "HOTMART_PRODUCT_IDS"] },
} as const;

/** Optional providers that are not configured, by variable name only; values are never read out. */
export function missingOptionalConfiguration() {
  // The scripted fake model replaces DeepSeek in development and tests.
  const fakeModel = optionalGroup("aiProvider")?.AI_PROVIDER === "fake";
  // The file outbox replaces Resend in development and tests.
  const outbox = optionalGroup("emailOutbox") !== null;
  return (Object.keys(optionalProviders) as (keyof typeof optionalProviders)[])
    .filter((name) => !(name === "ai" && fakeModel))
    .filter((name) => !(name === "email" && outbox))
    .filter((name) => !optionalGroup(name))
    .map((name) => optionalProviders[name]);
}
/** Off until a bucket is set; once it is, a missing or invalid field is an error, not a skip. */
export const backupEnv = () => (process.env.BACKUP_S3_BUCKET ? group("backup") : null);

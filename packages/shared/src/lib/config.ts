import { z } from 'zod';

const MICRO_USD_PER_USD = 1_000_000;

const optionalString = z.string().optional();

const envSchema = z.object({
  // Credentials have no defaults: they come from the environment (.env locally).
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9100'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().default('billy-documents'),

  BUSINESS_OWNER_ID: z.string().min(1).default('default'),
  BUSINESS_WEEK_START: z.enum(['monday', 'sunday']).default('monday'),
  BUSINESS_CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),

  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(20),
  MAX_FILES_PER_BATCH: z.coerce.number().int().positive().default(20),

  ANTHROPIC_API_KEY: optionalString,
  EXTRACTION_MODEL: z.string().default('claude-haiku-5-5'),
  VISION_MODEL: z.string().default('claude-sonnet-5-5'),
  OCR_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.7),
  RECORD_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.8),
  PROCESSING_COST_LIMIT_USD: z.coerce.number().nonnegative().optional(),

  EMBEDDING_PROVIDER: z.enum(['voyage']).default('voyage'),
  EMBEDDING_MODEL: z.string().default('voyage-3.5-lite'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  VOYAGE_API_KEY: optionalString,
});

export interface AppConfig {
  databaseUrl: string;
  redisUrl: string;
  s3: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
  ownerId: string;
  weekStart: 'monday' | 'sunday';
  currency: string;
  maxFileSizeBytes: number;
  maxFilesPerBatch: number;
  anthropicApiKey: string | undefined;
  extractionModel: string;
  visionModel: string;
  ocrMinConfidence: number;
  recordMinConfidence: number;
  /** Monthly limit in micro-USD; null when no limit is configured. */
  costLimitMicroUsd: number | null;
  embedding: {
    provider: 'voyage';
    model: string;
    dimensions: number;
    apiKey: string | undefined;
  };
}

/** Reads configuration from env vars; empty values count as unset. */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const parsed = envSchema.parse(cleaned);
  return {
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    s3: {
      endpoint: parsed.S3_ENDPOINT,
      accessKey: parsed.S3_ACCESS_KEY,
      secretKey: parsed.S3_SECRET_KEY,
      bucket: parsed.S3_BUCKET,
    },
    ownerId: parsed.BUSINESS_OWNER_ID,
    weekStart: parsed.BUSINESS_WEEK_START,
    currency: parsed.BUSINESS_CURRENCY,
    maxFileSizeBytes: Math.round(parsed.MAX_FILE_SIZE_MB * 1024 * 1024),
    maxFilesPerBatch: parsed.MAX_FILES_PER_BATCH,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    extractionModel: parsed.EXTRACTION_MODEL,
    visionModel: parsed.VISION_MODEL,
    ocrMinConfidence: parsed.OCR_MIN_CONFIDENCE,
    recordMinConfidence: parsed.RECORD_MIN_CONFIDENCE,
    costLimitMicroUsd:
      parsed.PROCESSING_COST_LIMIT_USD === undefined
        ? null
        : Math.round(parsed.PROCESSING_COST_LIMIT_USD * MICRO_USD_PER_USD),
    embedding: {
      provider: parsed.EMBEDDING_PROVIDER,
      model: parsed.EMBEDDING_MODEL,
      dimensions: parsed.EMBEDDING_DIMENSIONS,
      apiKey: parsed.VOYAGE_API_KEY,
    },
  };
}

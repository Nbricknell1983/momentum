import { z } from 'zod';

// ─── Task type constants ───────────────────────────────────────────────────────

export const TASK_TYPES = {
  STRATEGY:            'strategy',
  WEBSITE_XRAY:        'website_xray',
  SERP:                'serp',
  GBP:                 'gbp',
  ADS:                 'ads',
  GROWTH_PRESCRIPTION: 'growth_prescription',
  ENRICHMENT:          'enrichment',
  PREP:                'prep',
} as const;

export type TaskType = typeof TASK_TYPES[keyof typeof TASK_TYPES];

// ─── TTL config (milliseconds) ─────────────────────────────────────────────────

export const TASK_TTL_MS: Record<string, number> = {
  [TASK_TYPES.PREP]:                24 * 60 * 60 * 1000,  // 24 h
  [TASK_TYPES.WEBSITE_XRAY]:        24 * 60 * 60 * 1000,  // 24 h
  [TASK_TYPES.SERP]:                24 * 60 * 60 * 1000,  // 24 h
  [TASK_TYPES.STRATEGY]:            24 * 60 * 60 * 1000,  // 24 h
  [TASK_TYPES.GROWTH_PRESCRIPTION]: 24 * 60 * 60 * 1000,  // 24 h
  [TASK_TYPES.GBP]:                 24 * 60 * 60 * 1000,  // 24 h
  [TASK_TYPES.ADS]:                 24 * 60 * 60 * 1000,  // 24 h
  [TASK_TYPES.ENRICHMENT]:          7  * 24 * 60 * 60 * 1000, // 7 d
};

export function getTtlMs(taskType: string): number {
  return TASK_TTL_MS[taskType] ?? 24 * 60 * 60 * 1000;
}

// ─── Retry config ──────────────────────────────────────────────────────────────

export const DEFAULT_MAX_RETRIES = 3;

/** Returns delay in milliseconds before the next retry attempt. */
export function retryDelayMs(retryCount: number): number {
  const BASE_MS = 15_000; // 15s
  const MAX_MS  = 10 * 60 * 1000; // 10 min
  return Math.min(Math.pow(2, retryCount) * BASE_MS, MAX_MS);
}

// ─── Per-task dependency chains ────────────────────────────────────────────────

export const TASK_DEPENDENCIES: Record<string, string[]> = {
  [TASK_TYPES.STRATEGY]: [TASK_TYPES.WEBSITE_XRAY, TASK_TYPES.SERP],
};

// ─── Input schemas ─────────────────────────────────────────────────────────────

export const StrategyInputSchema = z.object({
  businessName:      z.string(),
  website:           z.string().optional(),
  location:          z.string().optional(),
  industry:          z.string().optional(),
  entityId:          z.string(),
  entityType:        z.enum(['lead', 'client']),
  orgId:             z.string(),
  keywordNotes:      z.string().optional(),
  sitemapPages:      z.array(z.object({ url: z.string() })).optional(),
  gbpLink:           z.string().optional(),
  reviewCount:       z.number().optional(),
  rating:            z.number().optional(),
});

export const WebsiteXrayInputSchema = z.object({
  websiteUrl:   z.string().url(),
  businessName: z.string(),
  entityId:     z.string(),
  entityType:   z.enum(['lead', 'client']),
  orgId:        z.string(),
  industry:     z.string().optional(),
  location:     z.string().optional(),
});

export const SerpInputSchema = z.object({
  businessName: z.string(),
  website:      z.string().optional(),
  location:     z.string(),
  industry:     z.string().optional(),
  entityId:     z.string(),
  entityType:   z.enum(['lead', 'client']),
  orgId:        z.string(),
  keywords:     z.array(z.string()).optional(),
});

export const GbpInputSchema = z.object({
  businessName: z.string(),
  placeId:      z.string().optional(),
  gbpLink:      z.string().optional(),
  entityId:     z.string(),
  entityType:   z.enum(['lead', 'client']),
  orgId:        z.string(),
});

export const AdsInputSchema = z.object({
  businessName: z.string(),
  website:      z.string().optional(),
  location:     z.string().optional(),
  industry:     z.string().optional(),
  entityId:     z.string(),
  entityType:   z.enum(['lead', 'client']),
  orgId:        z.string(),
});

export const GrowthPrescriptionInputSchema = z.object({
  businessName: z.string(),
  website:      z.string().optional(),
  location:     z.string().optional(),
  industry:     z.string().optional(),
  entityId:     z.string(),
  entityType:   z.enum(['lead', 'client']),
  orgId:        z.string(),
});

export const EnrichmentInputSchema = z.object({
  businessName: z.string(),
  website:      z.string().optional(),
  location:     z.string().optional(),
  entityId:     z.string(),
  entityType:   z.enum(['lead', 'client']),
  orgId:        z.string(),
});

export const PrepInputSchema = z.object({
  businessName: z.string(),
  website:      z.string().optional(),
  location:     z.string().optional(),
  entityId:     z.string(),
  entityType:   z.enum(['lead', 'client']),
  orgId:        z.string(),
});

// ─── Output schemas ────────────────────────────────────────────────────────────

export const StrategyOutputSchema = z.object({
  diagnosis:     z.string().optional(),
  channelPriorities: z.array(z.string()).optional(),
  summary:       z.string().optional(),
}).passthrough();

export const WebsiteXrayOutputSchema = z.object({
  healthScore:      z.number().optional(),
  healthLabel:      z.string().optional(),
  conversionGrade:  z.string().optional(),
  summary:          z.string().optional(),
  callouts:         z.array(z.object({
    issue: z.string(),
    detail: z.string(),
    fix: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
  })).optional(),
}).passthrough();

export const SerpOutputSchema = z.object({
  keyword:             z.string().optional(),
  prospectPosition:    z.object({}).passthrough().optional(),
  competitors:         z.array(z.object({}).passthrough()).optional(),
  opportunities:       z.array(z.object({}).passthrough()).optional(),
}).passthrough();

export const GbpOutputSchema = z.object({
  optimizationScore: z.number().optional(),
  summary:           z.string().optional(),
  tasks:             z.array(z.object({}).passthrough()).optional(),
}).passthrough();

export const AdsOutputSchema = z.object({
  readinessScore:           z.number().optional(),
  summary:                  z.string().optional(),
  recommendedMonthlyBudget: z.number().optional(),
}).passthrough();

export const GrowthPrescriptionOutputSchema = z.object({
  summary: z.string().optional(),
  channels: z.object({}).passthrough().optional(),
}).passthrough();

export const EnrichmentOutputSchema = z.object({
  industry:  z.string().optional(),
  category:  z.string().optional(),
  location:  z.string().optional(),
}).passthrough();

export const PrepOutputSchema = z.object({
  summary:    z.string().optional(),
  nextSteps:  z.array(z.string()).optional(),
}).passthrough();

// ─── Schema registry ───────────────────────────────────────────────────────────

type SchemaPair = {
  input:  z.ZodTypeAny;
  output: z.ZodTypeAny;
};

export const TASK_SCHEMAS: Record<string, SchemaPair> = {
  [TASK_TYPES.STRATEGY]:            { input: StrategyInputSchema,            output: StrategyOutputSchema },
  [TASK_TYPES.WEBSITE_XRAY]:        { input: WebsiteXrayInputSchema,         output: WebsiteXrayOutputSchema },
  [TASK_TYPES.SERP]:                { input: SerpInputSchema,                output: SerpOutputSchema },
  [TASK_TYPES.GBP]:                 { input: GbpInputSchema,                 output: GbpOutputSchema },
  [TASK_TYPES.ADS]:                 { input: AdsInputSchema,                 output: AdsOutputSchema },
  [TASK_TYPES.GROWTH_PRESCRIPTION]: { input: GrowthPrescriptionInputSchema,  output: GrowthPrescriptionOutputSchema },
  [TASK_TYPES.ENRICHMENT]:          { input: EnrichmentInputSchema,          output: EnrichmentOutputSchema },
  [TASK_TYPES.PREP]:                { input: PrepInputSchema,                output: PrepOutputSchema },
};

/** Validate an input payload against the task's Zod schema. Returns null if valid, error string if not. */
export function validateInput(taskType: string, input: unknown): string | null {
  const schemas = TASK_SCHEMAS[taskType];
  if (!schemas) return null; // unknown task type — allow passthrough
  const result = schemas.input.safeParse(input);
  return result.success ? null : result.error.message;
}

/** Validate an output payload. Returns null if valid, error string if not. */
export function validateOutput(taskType: string, output: unknown): string | null {
  const schemas = TASK_SCHEMAS[taskType];
  if (!schemas) return null;
  const result = schemas.output.safeParse(output);
  return result.success ? null : result.error.message;
}

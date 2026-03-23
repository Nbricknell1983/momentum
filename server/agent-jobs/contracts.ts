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
  WEBSITE_WORKSTREAM:  'website_workstream',
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
  [TASK_TYPES.WEBSITE_WORKSTREAM]:  48 * 60 * 60 * 1000,  // 48 h — blueprint is expensive
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
  [TASK_TYPES.STRATEGY]:           [TASK_TYPES.WEBSITE_XRAY, TASK_TYPES.SERP],
  [TASK_TYPES.WEBSITE_WORKSTREAM]: [TASK_TYPES.STRATEGY, TASK_TYPES.WEBSITE_XRAY, TASK_TYPES.SERP, TASK_TYPES.GROWTH_PRESCRIPTION],
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

export const WebsiteWorkstreamInputSchema = z.object({
  orgId:            z.string(),
  clientId:         z.string(),
  entityId:         z.string(),
  entityType:       z.enum(['lead', 'client']),
  businessName:     z.string(),
  brand:            z.string().optional(),
  website:          z.string().optional(),
  location:         z.string().optional(),
  industry:         z.string().optional(),
  serviceAreas:     z.array(z.string()).optional(),
  primaryServices:  z.array(z.string()).optional(),
  intelligenceRefs: z.object({
    websiteXrayRunId:          z.string().optional(),
    serpRunId:                 z.string().optional(),
    strategyRunId:             z.string().optional(),
    growthPrescriptionRunId:   z.string().optional(),
  }).optional(),
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

const CopyVariantsSchema = z.object({
  concise:   z.string(),
  standard:  z.string(),
  extended:  z.string(),
}).optional();

const SectionSchema = z.object({
  kind: z.enum(['Hero', 'ServicesGrid', 'ServiceDetail', 'Trust', 'Areas', 'FAQ', 'ContactForm', 'CTABar', 'Testimonial', 'Gallery', 'Map']),
  props:        z.record(z.any()),
  copyVariants: CopyVariantsSchema,
});

const PageSchema = z.object({
  key:         z.string(),
  route:       z.string(),
  title:       z.string(),
  description: z.string(),
  jsonLd:      z.record(z.any()).optional(),
  seoMeta: z.object({
    title:       z.string(),
    description: z.string(),
    canonical:   z.string().optional(),
    og:          z.record(z.any()).optional(),
  }),
  sections:      z.array(SectionSchema),
  internalLinks: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
});

export const WebsiteWorkstreamOutputSchema = z.object({
  siteMeta: z.object({
    brand:       z.string(),
    uvp:         z.string(),
    tone:        z.string(),
    primaryCta:  z.string(),
    nap:         z.object({ address: z.string(), phone: z.string(), email: z.string().optional() }),
    license:     z.string().optional(),
    social: z.object({
      gbp: z.string().optional(),
      fb:  z.string().optional(),
      ig:  z.string().optional(),
    }).optional(),
    tracking: z.object({
      ga4: z.boolean().optional(),
      gtm: z.boolean().optional(),
      gsc: z.boolean().optional(),
    }).optional(),
  }),
  nav: z.object({
    items: z.array(z.object({ label: z.string(), href: z.string() })),
  }),
  footer: z.object({
    nap:   z.object({ address: z.string(), phone: z.string(), email: z.string().optional() }),
    links: z.array(z.object({ label: z.string(), href: z.string() })),
  }),
  pages: z.array(PageSchema),
  assets: z.array(z.object({
    key:             z.string(),
    alt:             z.string(),
    suggestedSource: z.string().optional(),
    placement: z.object({
      pageKey:     z.string(),
      sectionKind: z.string(),
    }).optional(),
  })),
  performance: z.object({
    images: z.object({
      format: z.enum(['webp', 'avif']),
      sizes:  z.array(z.string()),
    }),
    fonts: z.object({
      preloads: z.array(z.string()),
    }).optional(),
  }),
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
  [TASK_TYPES.WEBSITE_WORKSTREAM]:  { input: WebsiteWorkstreamInputSchema,   output: WebsiteWorkstreamOutputSchema },
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

// Paid Search — Transparency Service
// Wraps the Google Ads Transparency Center scraper with:
//   - timeout enforcement (8s, matching scraper internal limit)
//   - one automatic retry on network failure
//   - normalisation from raw scraper output → internal PaidSearchEvidence model
//
// The UI reads evidenceBundle.paidSearch — this service is the only writer.

import { lookupTransparency, invalidateTransparencyCache, type TransparencyScraperResult } from '../../lib/google-ads-transparency-scraper';

// ── Internal PaidSearchEvidence model ───────────────────────────────────────
// This is the shape stored in Firestore at evidenceBundle.paidSearch.
// The UI's buildPaidSearchInsights() reads this shape.

export interface KeywordAuctionEntry {
  keyword: string;
  isBranded?: boolean;
  impressionShare?: number;
  topOfPageRate?: number;
  competitorImpressionShare?: Array<{ domain: string; value: number }>;
  competitorTopOfPageRate?: Array<{ domain: string; value: number }>;
}

export interface PaidSearchEvidence {
  activityState: 'confirmed' | 'detected' | 'unknown' | 'not-detected';
  confirmedActive: boolean;
  confirmationSource: 'manual' | 'custom-scraper' | 'auction-report' | 'tag-detection' | 'inferred';
  sourceTypes: Array<'auction-report' | 'ads-transparency' | 'manual' | 'csv-import'>;
  lastEvaluatedAt: string;

  // Keyword auction data (populated from auction report / CSV import — not from scraper)
  auction?: {
    overallImpressionShare?: number;
    overallTopOfPageRate?: number;
    brandedStrength?: 'strong' | 'moderate' | 'weak';
    nonBrandStrength?: 'strong' | 'moderate' | 'weak';
    entries?: KeywordAuctionEntry[];
  };

  // Transparency Center data (populated by this service)
  transparency?: {
    advertiserName?: string;
    advertiserId?: string;
    source: 'custom-scraper';
    activeAdsDetected: boolean;
    recentAdsDetected: boolean;
    adCount?: number;
    regions?: string[];
    platforms?: string[];
    exampleAds?: Array<{
      headline?: string;
      body?: string;
      format?: string;
      region?: string;
      date?: string;
      url?: string;
    }>;
    fetchedAt: string;
    extractionStrategy?: string;
    parseWarnings?: string[];
  };

  // Pre-computed plain-English copy for the card
  summary?: string;
  keyWins: string[];
  keyGaps: string[];
}

// ── Normaliser ───────────────────────────────────────────────────────────────

function _normalise(raw: TransparencyScraperResult): PaidSearchEvidence {
  const wins: string[] = [];
  const gaps: string[] = [];

  const adsDetected = raw.activeAdsDetected;
  const hasCreatives = raw.exampleAds.length > 0;
  const hasCount = raw.adCount != null && raw.adCount > 0;

  // Build wins
  if (adsDetected) wins.push('Paid search activity is confirmed');
  if (raw.recentAdsDetected) wins.push('Recent ads were detected');
  if (hasCreatives) wins.push(`${raw.exampleAds.length} ad creative${raw.exampleAds.length !== 1 ? 's' : ''} retrieved`);
  if ((raw.regions ?? []).length > 0) wins.push(`Active in ${raw.regions!.join(', ')}`);

  // Build gaps (Phase 1 — auction data not yet available from scraper)
  if (!adsDetected) gaps.push('No current paid search activity detected');
  gaps.push('Auction share detail not yet available');

  // Activity state
  const activityState: PaidSearchEvidence['activityState'] = adsDetected
    ? (hasCreatives ? 'confirmed' : 'detected')
    : 'not-detected';

  // Summary
  const summary = adsDetected
    ? `Paid search activity has been ${hasCreatives ? 'confirmed' : 'detected'} for this business via the Google Ads Transparency Center.${raw.adCount ? ` Approximately ${raw.adCount} ads found.` : ''}`
    : 'No active paid search ads were detected for this business in the Google Ads Transparency Center.';

  const transparency: PaidSearchEvidence['transparency'] = {
    advertiserName   : raw.advertiserName,
    advertiserId     : raw.advertiserId,
    source           : 'custom-scraper',
    activeAdsDetected: raw.activeAdsDetected,
    recentAdsDetected: raw.recentAdsDetected,
    adCount          : raw.adCount,
    regions          : raw.regions,
    platforms        : raw.platforms,
    exampleAds       : raw.exampleAds,
    fetchedAt        : raw.fetchedAt,
    extractionStrategy: raw.extractionStrategy,
    parseWarnings    : raw.parseWarnings.length > 0 ? raw.parseWarnings : undefined,
  };

  return {
    activityState,
    confirmedActive      : adsDetected,
    confirmationSource   : 'custom-scraper',
    sourceTypes          : ['ads-transparency'],
    lastEvaluatedAt      : new Date().toISOString(),
    transparency,
    summary,
    keyWins              : wins,
    keyGaps              : gaps,
  };
}

// ── Retry helper ─────────────────────────────────────────────────────────────

async function _withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 2_000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(r => setTimeout(r, delayMs));
    return _withRetry(fn, retries - 1, delayMs);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface GatherPaidSearchOptions {
  businessName: string;
  domain?: string;
  region?: string;
  bypassCache?: boolean;
}

/**
 * Gather paid search evidence for a lead.
 * Returns a PaidSearchEvidence object, or null if no usable data could be retrieved.
 * Never throws — designed for non-blocking integration into evidence pipeline.
 */
export async function gatherPaidSearchEvidence(opts: GatherPaidSearchOptions): Promise<PaidSearchEvidence | null> {
  const { businessName, domain, region = 'AU', bypassCache = false } = opts;

  if (!businessName && !domain) {
    console.warn('[paid-search-service] called with no businessName or domain — skipping');
    return null;
  }

  try {
    const raw = await _withRetry(
      () => lookupTransparency({ businessName, domain, region, bypassCache }),
      1,    // one retry
      2_000 // 2s backoff
    );

    if (!raw) {
      // All strategies exhausted — return unknown state rather than null
      // so the UI knows a lookup was attempted
      return {
        activityState     : 'unknown',
        confirmedActive   : false,
        confirmationSource: 'custom-scraper',
        sourceTypes       : ['ads-transparency'],
        lastEvaluatedAt   : new Date().toISOString(),
        summary           : 'No paid search data could be retrieved at this time.',
        keyWins           : [],
        keyGaps           : ['No paid search evidence available'],
      };
    }

    return _normalise(raw);

  } catch (err: any) {
    console.error('[paid-search-service] unexpected error:', err?.message ?? err);
    return null; // silent failure — don't break evidence pipeline
  }
}

/**
 * Merge auction report data into an existing PaidSearchEvidence object.
 * Call this when auction data arrives from CSV import or future integrations.
 */
export function mergeAuctionData(
  existing: PaidSearchEvidence | null,
  auction: PaidSearchEvidence['auction'],
): PaidSearchEvidence {
  const base: PaidSearchEvidence = existing ?? {
    activityState     : 'unknown',
    confirmedActive   : false,
    confirmationSource: 'auction-report',
    sourceTypes       : [],
    lastEvaluatedAt   : new Date().toISOString(),
    keyWins           : [],
    keyGaps           : [],
  };

  const hasImpressionShare = (auction?.overallImpressionShare ?? null) !== null;
  const activityState: PaidSearchEvidence['activityState'] = hasImpressionShare
    ? (auction!.overallImpressionShare! > 0 ? 'confirmed' : 'not-detected')
    : base.activityState;

  const sourceTypes = [...new Set([...base.sourceTypes, 'auction-report' as const])];

  return {
    ...base,
    activityState,
    confirmedActive   : hasImpressionShare ? (auction!.overallImpressionShare! > 0) : base.confirmedActive,
    confirmationSource: 'auction-report',
    sourceTypes,
    lastEvaluatedAt   : new Date().toISOString(),
    auction,
  };
}

/** Expose cache invalidation for explicit evidence refresh. */
export function invalidatePaidSearchCache(domain: string, businessName: string, region = 'AU'): void {
  invalidateTransparencyCache(domain, businessName, region);
}

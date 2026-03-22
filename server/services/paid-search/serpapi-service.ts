// SerpApi Paid Search Service
// Uses the SerpApi Google Ads Transparency Center engine to gather real ad evidence.
//
// Data flow: gatherEvidenceBundle → gatherPaidSearchViaSerpApi → evidenceBundle.paidSearch
// Fails gracefully if SERP_API_KEY is missing or the API is unavailable.

import type { PaidSearchEvidence } from './transparency-service';

const SERP_API_KEY = process.env.SERP_API_KEY;
const SERP_API_BASE = 'https://serpapi.com/search.json';
const REQUEST_TIMEOUT_MS = 10_000;

// ── isSerpApiConfigured ───────────────────────────────────────────────────────

export function isSerpApiConfigured(): boolean {
  return !!(SERP_API_KEY && SERP_API_KEY.length > 8);
}

// ── Raw response shapes ───────────────────────────────────────────────────────

interface SerpApiAdCreative {
  headline?: string;
  description?: string;
  display_link?: string;
}

interface SerpApiAd {
  advertiser_name?: string;
  advertiser_id?:   string;
  ad_id?:           string;
  format?:          string;
  first_shown?:     string;
  last_shown?:      string;
  region_code?:     string[];
  platform?:        string[];
  creative?:        SerpApiAdCreative;
  // Text ads sometimes nest headline/body here
  title?:           string;
  body?:            string;
}

interface SerpApiResponse {
  ads?:               SerpApiAd[];
  advertiser?: {
    name?: string;
    id?:   string;
  };
  search_metadata?: {
    status?: string;
    total_time_taken?: number;
  };
  error?: string;
}

// ── HTTP fetch with timeout ───────────────────────────────────────────────────

async function _fetchSerpApi(params: Record<string, string>): Promise<SerpApiResponse | null> {
  if (!SERP_API_KEY) return null;

  const url = new URL(SERP_API_BASE);
  url.searchParams.set('api_key', SERP_API_KEY);
  url.searchParams.set('engine', 'google_ads_transparency_center');
  url.searchParams.set('ad_type', 'ALL');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[serpapi] HTTP ${res.status} — params: ${JSON.stringify(params)}`);
      return null;
    }
    const json = await res.json() as SerpApiResponse;
    if (json.error) {
      console.warn('[serpapi] API error:', json.error);
      return null;
    }
    return json;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      console.warn('[serpapi] request timed out');
    } else {
      console.warn('[serpapi] fetch error:', err?.message ?? err);
    }
    return null;
  }
}

// ── Domain sanitiser ─────────────────────────────────────────────────────────

function _cleanDomain(rawUrl: string): string {
  return rawUrl
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase()
    .trim();
}

// ── Normaliser ───────────────────────────────────────────────────────────────

function _normalise(
  raw: SerpApiResponse,
  domain: string | undefined,
  businessName: string,
): PaidSearchEvidence {
  const ads = raw.ads ?? [];
  const hasAds = ads.length > 0;

  const regionsSet  = new Set<string>();
  const platformSet = new Set<string>();
  const exampleAds: NonNullable<NonNullable<PaidSearchEvidence['transparency']>['exampleAds']> = [];

  for (const ad of ads) {
    (ad.region_code ?? []).forEach(r => regionsSet.add(r));
    (ad.platform ?? []).forEach(p => platformSet.add(p));

    if (exampleAds.length < 5) {
      const headline = ad.creative?.headline ?? ad.title ?? undefined;
      const body     = ad.creative?.description ?? ad.body ?? undefined;
      const url      = ad.creative?.display_link ?? undefined;
      if (headline || body) {
        exampleAds.push({
          headline,
          body,
          format: ad.format ?? undefined,
          region: (ad.region_code ?? [])[0] ?? undefined,
          date:   ad.last_shown ?? ad.first_shown ?? undefined,
          url,
        });
      }
    }
  }

  const advertiserName = raw.advertiser?.name ?? ads[0]?.advertiser_name ?? businessName;
  const advertiserId   = raw.advertiser?.id   ?? ads[0]?.advertiser_id   ?? undefined;

  const activityState: PaidSearchEvidence['activityState'] = hasAds ? 'confirmed' : 'not-detected';

  const wins: string[] = [];
  const gaps: string[] = [];

  if (hasAds) {
    wins.push('Paid search activity confirmed via Google Ads Transparency Center');
    if (ads.length > 1) wins.push(`${ads.length} active ad creatives found`);
    if (regionsSet.size > 0) wins.push(`Targeting regions: ${[...regionsSet].slice(0, 4).join(', ')}`);
    if (platformSet.size > 0) wins.push(`Running on: ${[...platformSet].slice(0, 3).join(', ')}`);
  } else {
    gaps.push('No active paid search ads detected in Google Ads Transparency Center');
    gaps.push('May indicate no spend, restricted by region, or account operating under different name');
  }
  gaps.push('Impression share data requires auction report upload');

  const summary = hasAds
    ? `Google Ads activity confirmed for ${advertiserName}. ${ads.length} ad creative${ads.length !== 1 ? 's' : ''} found via Google Ads Transparency Center.`
    : `No active Google Ads detected for ${businessName} via Google Ads Transparency Center search.`;

  return {
    activityState,
    confirmedActive:     hasAds,
    confirmationSource:  'serpapi' as any,
    sourceTypes:         ['serpapi' as any],
    lastEvaluatedAt:     new Date().toISOString(),
    transparency: {
      advertiserName,
      advertiserId,
      source:             'serpapi' as any,
      activeAdsDetected:  hasAds,
      recentAdsDetected:  hasAds,
      adCount:            ads.length > 0 ? ads.length : undefined,
      regions:            regionsSet.size > 0  ? [...regionsSet]  : undefined,
      platforms:          platformSet.size > 0 ? [...platformSet] : undefined,
      exampleAds:         exampleAds.length > 0 ? exampleAds : undefined,
      fetchedAt:          new Date().toISOString(),
    },
    summary,
    keyWins: wins,
    keyGaps: gaps,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface SerpApiPaidSearchOptions {
  businessName: string;
  domain?:      string; // full URL or bare domain — sanitised internally
  region?:      string; // ISO-3166-1 alpha-2, e.g. 'AU'
}

/**
 * Gather paid search evidence using SerpApi Google Ads Transparency Center.
 *
 * Strategy:
 *   1. Search by advertiser domain (most precise)
 *   2. If empty, retry by advertiser name
 *
 * Returns a PaidSearchEvidence object, or null if SerpApi is not configured /
 * all strategies return no usable response. Never throws.
 */
export async function gatherPaidSearchViaSerpApi(
  opts: SerpApiPaidSearchOptions,
): Promise<PaidSearchEvidence | null> {
  if (!isSerpApiConfigured()) {
    return null;
  }

  const { businessName, domain, region = 'AU' } = opts;

  if (!businessName && !domain) {
    console.warn('[serpapi] called with no businessName or domain — skipping');
    return null;
  }

  try {
    let result: SerpApiResponse | null = null;

    // Strategy 1: domain search
    if (domain) {
      const cleanDomain = _cleanDomain(domain);
      console.log(`[serpapi] searching by domain: ${cleanDomain}`);
      result = await _fetchSerpApi({ advertiser_domain: cleanDomain, country_code: region });
    }

    // Strategy 2: name search (fallback or when domain yields nothing)
    if ((!result || !result.ads?.length) && businessName) {
      console.log(`[serpapi] searching by name: ${businessName}`);
      result = await _fetchSerpApi({ advertiser_name: businessName, country_code: region });
    }

    if (!result) {
      console.log(`[serpapi] all strategies returned null for ${businessName}`);
      return null;
    }

    const evidence = _normalise(result, domain, businessName);
    console.log(`[serpapi] ${businessName} → activityState=${evidence.activityState}, ads=${result.ads?.length ?? 0}`);
    return evidence;
  } catch (err: any) {
    console.error('[serpapi] unexpected error:', err?.message ?? err);
    return null;
  }
}

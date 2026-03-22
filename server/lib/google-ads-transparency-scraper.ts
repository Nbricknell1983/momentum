// Google Ads Transparency Center — server-side scraper
// Phase 1 MVP: advertiser lookup, ad detection, example creative extraction.
//
// IMPORTANT: Google Ads Transparency Center has no public API. This module
// uses a three-strategy chain against undocumented internal endpoints used
// by the SPA's own JavaScript, plus HTML parsing as a final fallback.
// All strategies are designed for graceful partial failure.
//
// Do NOT import this module on the frontend — server-only.

const TRANSPARENCY_BASE = 'https://adstransparency.google.com';
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours

// ── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  result: TransparencyScraperResult | null;
  fetchedAt: number;
}

const _cache = new Map<string, CacheEntry>();

function _cacheKey(domain: string, name: string, region: string): string {
  return `${region.toUpperCase()}::${domain.toLowerCase().replace(/^www\./, '')}::${name.toLowerCase().trim()}`;
}

function _getCached(key: string): TransparencyScraperResult | null | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;                        // not found
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {  // expired
    _cache.delete(key);
    return undefined;
  }
  return entry.result;                                 // may be null (confirmed empty)
}

function _setCache(key: string, result: TransparencyScraperResult | null): void {
  _cache.set(key, { result, fetchedAt: Date.now() });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TransparencyAdCreative {
  headline?: string;
  body?: string;
  format?: string;
  region?: string;
  date?: string;
  url?: string;
}

export interface TransparencyScraperResult {
  advertiserName?: string;
  advertiserId?: string;
  activeAdsDetected: boolean;
  recentAdsDetected: boolean;
  adCount?: number;
  regions?: string[];
  platforms?: string[];
  exampleAds: TransparencyAdCreative[];
  fetchedAt: string;
  extractionStrategy: 'api-domain' | 'api-name' | 'html-parse' | 'not-found';
  parseWarnings: string[];
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

const JSON_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  'Accept': 'application/json, text/plain, */*',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

async function _fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── AF_initDataCallback extraction ───────────────────────────────────────────
// Google apps embed page data in AF_initDataCallback calls in the initial HTML.
// The data value is a JS expression (not necessarily JSON), so we use a
// best-effort extraction combining JSON.parse and regex patterns.

function _extractAfCallbacks(html: string): any[] {
  const results: any[] = [];
  // Match: AF_initDataCallback({..., data:function(){return <DATA>}, ...});
  const re = /AF_initDataCallback\s*\(\s*\{[^}]*?data\s*:\s*function\s*\(\s*\)\s*\{return\s*([\s\S]*?)\}\s*[,}]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      results.push(parsed);
    } catch {
      // Not valid JSON — skip silently
    }
  }
  return results;
}

// ── Advertiser ID extraction ─────────────────────────────────────────────────
// Google Advertiser IDs follow the pattern AR + 16–18 digits.

function _extractAdvertiserIds(text: string): string[] {
  const matches = text.match(/\bAR\d{16,18}\b/g) ?? [];
  return [...new Set(matches)];
}

// ── JSON response parser ─────────────────────────────────────────────────────
// Attempts to interpret a raw JSON response from the Transparency API.
// The exact schema is undocumented so this is best-effort.

function _parseJsonResponse(json: any, warnings: string[]): Partial<TransparencyScraperResult> {
  const result: Partial<TransparencyScraperResult> = {
    exampleAds: [],
    parseWarnings: warnings,
  };

  if (!json || typeof json !== 'object') {
    warnings.push('Response was not a JSON object');
    return result;
  }

  // Advertiser info
  if (json.advertiserName) result.advertiserName = String(json.advertiserName);
  if (json.advertiserId)   result.advertiserId   = String(json.advertiserId);

  // Ads array
  const adsArr: any[] = Array.isArray(json.ads) ? json.ads
    : Array.isArray(json.results) ? json.results
    : Array.isArray(json.items)   ? json.items
    : [];

  if (adsArr.length > 0) {
    result.activeAdsDetected  = true;
    result.recentAdsDetected  = true;
    result.adCount            = json.totalCount ?? json.count ?? adsArr.length;

    result.exampleAds = adsArr.slice(0, 5).map((ad: any) => ({
      headline : ad.headline ?? ad.title ?? ad.adText?.headline ?? undefined,
      body     : ad.description ?? ad.body ?? ad.adText?.description ?? undefined,
      format   : ad.format ?? ad.adFormat ?? undefined,
      region   : ad.region ?? ad.regions?.[0] ?? undefined,
      date     : ad.date ?? ad.lastShown ?? ad.firstSeen ?? undefined,
      url      : ad.url ?? ad.finalUrl ?? ad.displayUrl ?? undefined,
    }));

    // Regions + platforms
    const regions = new Set<string>();
    const platforms = new Set<string>();
    for (const ad of adsArr) {
      (ad.regions ?? (ad.region ? [ad.region] : [])).forEach((r: string) => regions.add(r));
      (ad.platforms ?? (ad.platform ? [ad.platform] : [])).forEach((p: string) => platforms.add(p));
    }
    if (regions.size > 0)   result.regions   = [...regions];
    if (platforms.size > 0) result.platforms  = [...platforms];
  } else if (json.advertiserName || json.advertiserId) {
    // Advertiser exists but no ads in this result window
    result.activeAdsDetected = false;
    result.recentAdsDetected = false;
    warnings.push('Advertiser found but no ads in result window');
  }

  return result;
}

// ── Strategy 1: API with advertiser_domain ───────────────────────────────────

async function _strategyApiDomain(domain: string, region: string, warnings: string[]): Promise<TransparencyScraperResult | null> {
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!cleanDomain) return null;

  const url = `${TRANSPARENCY_BASE}/api/ads?advertiser_domain=${encodeURIComponent(cleanDomain)}&region=${encodeURIComponent(region)}&format=TEXT&start=1&end=5`;

  try {
    const res = await _fetchWithTimeout(url, JSON_HEADERS);
    if (!res.ok) {
      warnings.push(`api-domain: HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      warnings.push(`api-domain: non-JSON content-type: ${contentType}`);
      return null;
    }
    const json = await res.json();
    const parsed = _parseJsonResponse(json, warnings);
    if (parsed.activeAdsDetected === undefined) return null; // nothing useful

    return {
      activeAdsDetected  : parsed.activeAdsDetected ?? false,
      recentAdsDetected  : parsed.recentAdsDetected ?? false,
      adCount            : parsed.adCount,
      advertiserName     : parsed.advertiserName,
      advertiserId       : parsed.advertiserId,
      regions            : parsed.regions,
      platforms          : parsed.platforms,
      exampleAds         : parsed.exampleAds ?? [],
      fetchedAt          : new Date().toISOString(),
      extractionStrategy : 'api-domain',
      parseWarnings      : warnings,
    };
  } catch (err: any) {
    warnings.push(`api-domain: ${err.message ?? 'fetch error'}`);
    return null;
  }
}

// ── Strategy 2: API with advertiser_name / query ─────────────────────────────

async function _strategyApiName(businessName: string, region: string, warnings: string[]): Promise<TransparencyScraperResult | null> {
  if (!businessName.trim()) return null;

  const url = `${TRANSPARENCY_BASE}/api/ads/search?query=${encodeURIComponent(businessName)}&region=${encodeURIComponent(region)}&start=1&end=5`;

  try {
    const res = await _fetchWithTimeout(url, JSON_HEADERS);
    if (!res.ok) {
      warnings.push(`api-name: HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      warnings.push(`api-name: non-JSON content-type: ${contentType}`);
      return null;
    }
    const json = await res.json();
    const parsed = _parseJsonResponse(json, warnings);
    if (parsed.activeAdsDetected === undefined) return null;

    return {
      activeAdsDetected  : parsed.activeAdsDetected ?? false,
      recentAdsDetected  : parsed.recentAdsDetected ?? false,
      adCount            : parsed.adCount,
      advertiserName     : parsed.advertiserName,
      advertiserId       : parsed.advertiserId,
      regions            : parsed.regions,
      platforms          : parsed.platforms,
      exampleAds         : parsed.exampleAds ?? [],
      fetchedAt          : new Date().toISOString(),
      extractionStrategy : 'api-name',
      parseWarnings      : warnings,
    };
  } catch (err: any) {
    warnings.push(`api-name: ${err.message ?? 'fetch error'}`);
    return null;
  }
}

// ── Strategy 3: HTML page with AF_initDataCallback extraction ─────────────────

async function _strategyHtmlParse(businessName: string, domain: string, region: string, warnings: string[]): Promise<TransparencyScraperResult | null> {
  const query = domain
    ? domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    : businessName;

  const url = `${TRANSPARENCY_BASE}/?region=${encodeURIComponent(region)}&query=${encodeURIComponent(query)}`;

  try {
    const res = await _fetchWithTimeout(url, BROWSER_HEADERS);
    if (!res.ok) {
      warnings.push(`html-parse: HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();

    // Try structured AF_initDataCallback extraction
    const callbacks = _extractAfCallbacks(html);
    if (callbacks.length > 0) {
      for (const cb of callbacks) {
        const parsed = _parseJsonResponse(cb, warnings);
        if (parsed.activeAdsDetected !== undefined || (parsed.exampleAds ?? []).length > 0) {
          return {
            activeAdsDetected  : parsed.activeAdsDetected ?? (parsed.exampleAds ?? []).length > 0,
            recentAdsDetected  : parsed.recentAdsDetected ?? (parsed.exampleAds ?? []).length > 0,
            adCount            : parsed.adCount,
            advertiserName     : parsed.advertiserName,
            advertiserId       : parsed.advertiserId,
            regions            : parsed.regions,
            platforms          : parsed.platforms,
            exampleAds         : parsed.exampleAds ?? [],
            fetchedAt          : new Date().toISOString(),
            extractionStrategy : 'html-parse',
            parseWarnings      : warnings,
          };
        }
      }
    }

    // Fallback: look for Advertiser ID patterns
    const advertiserIds = _extractAdvertiserIds(html);
    if (advertiserIds.length > 0) {
      const lowerHtml = html.toLowerCase();
      const businessLower = businessName.toLowerCase();
      const nameInPage = businessLower.split(' ')
        .filter(w => w.length > 3)
        .some(w => lowerHtml.includes(w));

      warnings.push(`html-parse: found ${advertiserIds.length} advertiser ID(s) via regex; name-in-page=${nameInPage}`);

      return {
        activeAdsDetected  : true,
        recentAdsDetected  : true,
        advertiserId       : advertiserIds[0],
        exampleAds         : [],
        fetchedAt          : new Date().toISOString(),
        extractionStrategy : 'html-parse',
        parseWarnings      : warnings,
      };
    }

    // Page loaded but no ad data found
    warnings.push('html-parse: page loaded but no ad data detected');
    return null;

  } catch (err: any) {
    warnings.push(`html-parse: ${err.message ?? 'fetch error'}`);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface TransparencyLookupOptions {
  businessName: string;
  domain?: string;       // raw website URL or clean domain
  region?: string;       // e.g. 'AU', 'ANY'
  bypassCache?: boolean;
}

/**
 * Look up a business in the Google Ads Transparency Center.
 * Returns null when no evidence can be found (not the same as "no ads").
 * Returns a result with activeAdsDetected=false when the advertiser was found but has no running ads.
 */
export async function lookupTransparency(opts: TransparencyLookupOptions): Promise<TransparencyScraperResult | null> {
  const { businessName, domain = '', region = 'AU' } = opts;
  const key = _cacheKey(domain, businessName, region);

  if (!opts.bypassCache) {
    const cached = _getCached(key);
    if (cached !== undefined) {
      console.log(`[transparency-scraper] cache hit for "${businessName}" (key=${key})`);
      return cached;
    }
  }

  const warnings: string[] = [];
  let result: TransparencyScraperResult | null = null;

  // Strategy 1: domain-based API (fastest if domain is known)
  if (domain) {
    result = await _strategyApiDomain(domain, region, warnings);
    if (result) {
      console.log(`[transparency-scraper] strategy=api-domain found "${businessName}" — ads=${result.activeAdsDetected}`);
    }
  }

  // Strategy 2: name-based API search
  if (!result && businessName) {
    result = await _strategyApiName(businessName, region, warnings);
    if (result) {
      console.log(`[transparency-scraper] strategy=api-name found "${businessName}" — ads=${result.activeAdsDetected}`);
    }
  }

  // Strategy 3: HTML page with embedded data extraction
  if (!result) {
    result = await _strategyHtmlParse(businessName, domain, region, warnings);
    if (result) {
      console.log(`[transparency-scraper] strategy=html-parse found "${businessName}" — ads=${result.activeAdsDetected}`);
    }
  }

  if (!result) {
    console.log(`[transparency-scraper] all strategies exhausted for "${businessName}"; warnings: ${warnings.join(' | ')}`);
  }

  _setCache(key, result);
  return result;
}

/** Expose cache size for diagnostics. */
export function getTransparencyCacheSize(): number {
  return _cache.size;
}

/** Clear one cache entry (e.g. when user triggers manual evidence refresh). */
export function invalidateTransparencyCache(domain: string, businessName: string, region = 'AU'): void {
  _cache.delete(_cacheKey(domain, businessName, region));
}

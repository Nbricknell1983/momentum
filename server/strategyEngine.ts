import * as cheerio from 'cheerio';

export interface CrawlResult {
  url: string;
  success: boolean;
  error?: string;
  title?: string;
  metaDescription?: string;
  h1s: string[];
  h2s: string[];
  headingHierarchy: { tag: string; text: string }[];
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  navLabels: string[];
  hasHttps: boolean;
  hasSitemap: boolean;
  sitemapUrl?: string;       // the URL where a valid sitemap was actually found
  serviceKeywords: string[];
  locationKeywords: string[];
  images: { total: number; withAlt: number; withoutAlt: number };
  hasSchema: boolean;
  schemaTypes?: string[];
  canonicalUrl?: string;
  ogTags: Record<string, string>;
  loadEstimate: string;
  // Evidence-layer additions
  ctaSignals: string[];          // detected CTAs: button texts, form presence, click-to-call
  trustSignals: string[];        // testimonials, awards, review widgets, certifications
  conversionGaps: string[];      // missing elements that hurt conversion
  servicePageUrls: string[];     // internal URLs containing service keywords
  locationPageUrls: string[];    // internal URLs containing location keywords
  phoneNumbers: string[];        // phone numbers found in page text/links
}

export interface WebsiteXRayResult {
  crawlData: CrawlResult;
  callouts: { id: number; issue: string; detail: string; fix: string; severity: 'high' | 'medium' | 'low' }[];
  summary: string;
}

export interface SerpAnalysisResult {
  keyword: string;
  prospectPosition: {
    mapsPresence: string;
    organicPresence: string;
    bestMatchingPage: string;
    relevanceScore: number;
  };
  competitors: { name: string; domain: string; position: number; strength: string }[];
  opportunities: { keyword: string; difficulty: string; volume: string; recommendation: string }[];
  serpSnapshot: { position: number; title: string; domain: string; snippet: string; type: 'organic' | 'maps' | 'ad' }[];
}

export interface CompetitorGapResult {
  prospect: {
    servicePages: number;
    locationPages: number;
    contentDepth: string;
    internalLinking: string;
    reviewSignals: string;
  };
  competitorAverage: {
    servicePages: number;
    locationPages: number;
    contentDepth: string;
    internalLinking: string;
    reviewSignals: string;
  };
  competitors: {
    name: string;
    servicePages: number;
    locationPages: number;
    contentDepth: string;
    strengths: string[];
  }[];
  insights: string[];
}

export interface TrafficForecastResult {
  currentEstimate: { monthlyTraffic: number; monthlyLeads: number; monthlyRevenue: number };
  projectedEstimate: { monthlyTraffic: number; monthlyLeads: number; monthlyRevenue: number };
  growthTimeline: { month: string; traffic: number; leads: number; revenue: number }[];
  assumptions: string[];
  keyDrivers: string[];
}

// ── Evidence bundle saved to Firestore on each lead ──────────────────────────
export interface EvidenceBundle {
  gatheredAt: string;
  website: {
    url: string;
    crawledAt: string;
    success: boolean;
    title: string | null;
    metaDescription: string | null;
    h1s: string[];
    h2s: string[];
    navLabels: string[];
    servicePageUrls: string[];
    locationPageUrls: string[];
    ctaSignals: string[];
    trustSignals: string[];
    conversionGaps: string[];
    hasSchema: boolean;
    hasSitemap: boolean;
    sitemapUrl?: string | null;
    wordCount: number;
    serviceKeywords: string[];
    locationKeywords: string[];
    phoneNumbers: string[];
    internalLinks: number;
    hasHttps: boolean;
  } | null;
  gbp: {
    placeId: string | null;
    name: string | null;
    rating: number | null;
    reviewCount: number | null;
    category: string | null;
    address: string | null;
    phone: string | null;
    mapsUrl: string | null;
    editorialSummary: string | null;
    isOpen: boolean | null;
    healthNotes: string[];
  } | null;
  social: {
    facebook: { url: string | null; detected: boolean };
    instagram: { url: string | null; detected: boolean };
    linkedin: { url: string | null; detected: boolean };
    twitter: { url: string | null; detected: boolean };
  };
  discoverySource: string[];
}

const crawlCache = new Map<string, { result: CrawlResult; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000;

function extractLocationKeywords(text: string): string[] {
  const australianLocations = /\b(sydney|melbourne|brisbane|perth|adelaide|gold coast|canberra|hobart|darwin|newcastle|wollongong|geelong|townsville|cairns|toowoomba|ballarat|bendigo|mandurah|mackay|launceston|rockhampton|bundaberg|hervey bay|wagga wagga|nsw|vic|qld|wa|sa|tas|nt|act|new south wales|victoria|queensland|western australia|south australia|tasmania|northern territory)\b/gi;
  const matches = text.match(australianLocations) || [];
  return Array.from(new Set(matches.map(m => m.toLowerCase())));
}

function extractServiceKeywords(text: string, industry?: string): string[] {
  const commonServices = /\b(plumbing|electrical|concrete|landscaping|roofing|painting|flooring|carpentry|demolition|excavation|fencing|tiling|rendering|plastering|welding|air conditioning|hvac|cleaning|pest control|locksmith|glazing|waterproofing|bathroom renovation|kitchen renovation|home renovation|building|construction|pool|solar|guttering|drainage)\b/gi;
  const matches = text.match(commonServices) || [];
  return Array.from(new Set(matches.map(m => m.toLowerCase())));
}

function extractPhoneNumbers(text: string): string[] {
  const phoneRe = /(?:\+61\s?)?(?:\(0\d\)\s?|\b0\d\s?)[\d\s]{7,10}\b|\b1[38]00[\s\d]{6,8}\b/g;
  return Array.from(new Set((text.match(phoneRe) || []).map(p => p.trim()))).slice(0, 5);
}

function detectCtaSignals($: cheerio.CheerioAPI): string[] {
  const signals: string[] = [];
  const ctaPatterns = /\b(get a quote|free quote|request a quote|book now|book online|get started|contact us|call us|call now|enquire now|enquire|get in touch|schedule|request a call|free consultation|free estimate|get estimate|apply now|sign up|try free|start free)\b/i;

  $('a, button').each((_, el) => {
    const text = $(el).text().trim();
    if (text && ctaPatterns.test(text) && text.length < 60) {
      signals.push(text);
    }
  });

  if ($('form').length > 0) signals.push('Contact/enquiry form present');
  if ($('a[href^="tel:"]').length > 0) signals.push('Click-to-call phone link');
  if ($('a[href^="mailto:"]').length > 0) signals.push('Email link');

  return Array.from(new Set(signals)).slice(0, 8);
}

function detectTrustSignals($: cheerio.CheerioAPI, html: string): string[] {
  const signals: string[] = [];
  const bodyText = $('body').text().toLowerCase();

  if (/testimon/i.test(bodyText)) signals.push('Testimonials section');
  if (/review/i.test(bodyText) && /<iframe[^>]*google|widget[^>]*review|elfsight|birdeye|grade\.us/i.test(html)) signals.push('Google reviews widget');
  if (/award|winner|best\s+\w+\s+20\d\d/i.test(bodyText)) signals.push('Awards or recognition mentioned');
  if (/certif|licensed|accredited|insured|member of|association/i.test(bodyText)) signals.push('Licences or certifications mentioned');
  if (/guarantee|warranty|satisfaction|100%/i.test(bodyText)) signals.push('Guarantee or warranty');
  if (html.includes('application/ld+json')) {
    if (html.includes('"Review"') || html.includes('"AggregateRating"')) signals.push('Structured review schema');
    if (html.includes('"LocalBusiness"') || html.includes('"Organization"')) signals.push('Local business schema markup');
  }
  if (/years of experience|years experience|year[s]? in business|established\s+\d{4}/i.test(bodyText)) signals.push('Years in business stated');
  if (/as seen on|featured in|media|press/i.test(bodyText)) signals.push('Media or press mentions');

  return signals.slice(0, 8);
}

function detectConversionGaps($: cheerio.CheerioAPI, crawl: CrawlResult): string[] {
  const gaps: string[] = [];

  if (crawl.ctaSignals.length === 0) gaps.push('No clear CTA detected on homepage');
  if (!crawl.phoneNumbers.length && $('a[href^="tel:"]').length === 0) gaps.push('No phone number visible on homepage');
  if (!crawl.metaDescription) gaps.push('Missing meta description');
  if (!crawl.h1s.length) gaps.push('No H1 heading on homepage');
  if (crawl.locationKeywords.length === 0) gaps.push('No location keywords detected in page content');
  if (!crawl.hasSchema) gaps.push('No structured data / schema markup');
  if (!crawl.hasSitemap) gaps.push('No sitemap detected');
  if (crawl.images.withoutAlt > crawl.images.withAlt && crawl.images.total > 3) gaps.push(`${crawl.images.withoutAlt} images missing alt text`);
  if (!crawl.hasHttps) gaps.push('Site not on HTTPS');
  if (crawl.wordCount < 300) gaps.push('Homepage content is very thin (under 300 words)');
  if ($('form').length === 0 && crawl.ctaSignals.filter(s => s.toLowerCase().includes('quote') || s.toLowerCase().includes('book') || s.toLowerCase().includes('enquir')).length === 0) {
    gaps.push('No enquiry form or booking mechanism detected');
  }

  return gaps.slice(0, 8);
}

function extractInternalPageUrls($: cheerio.CheerioAPI, baseUrl: string): { servicePageUrls: string[]; locationPageUrls: string[] } {
  const serviceTerms = /\/(service|services|plumb|electr|paint|landscape|roof|floor|clean|pest|heat|air|hvac|reno|build|construct|pool|solar|concrete|fence|tile|render|plaster|drain|window|gutter|waterproof|bathroom|kitchen|garden|fence|install|repair|maintain)/i;
  const locationTerms = /\/(sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|nsw|vic|qld|wa|sa|tas|suburb|location|area|region|local|parramatta|chatswood|bondi|manly|penrith|blacktown|hornsby|cronulla|newcastle|wollongong|gold-coast|sunshine-coast)/i;

  const servicePageUrls: string[] = [];
  const locationPageUrls: string[] = [];

  let domain = '';
  try { domain = new URL(baseUrl).hostname; } catch { /* ignore */ }

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    let full = '';
    try { full = new URL(href, baseUrl).href.split('?')[0].split('#')[0]; } catch { return; }
    if (!full.includes(domain)) return;
    if (serviceTerms.test(full) && !servicePageUrls.includes(full)) servicePageUrls.push(full);
    if (locationTerms.test(full) && !locationPageUrls.includes(full)) locationPageUrls.push(full);
  });

  return {
    servicePageUrls: servicePageUrls.slice(0, 10),
    locationPageUrls: locationPageUrls.slice(0, 10),
  };
}

function isUrlSafe(urlString: string): { safe: boolean; error?: string } {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, error: 'Only http and https URLs are allowed' };
    }
    const hostname = parsed.hostname.toLowerCase();
    const blocked = [
      'localhost', '127.0.0.1', '0.0.0.0', '::1',
      'metadata.google.internal', '169.254.169.254',
      'metadata', 'internal',
    ];
    if (blocked.some(b => hostname === b || hostname.endsWith(`.${b}`))) {
      return { safe: false, error: 'URL points to a restricted address' };
    }
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(hostname)) {
      return { safe: false, error: 'Private IP addresses are not allowed' };
    }
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { safe: false, error: 'Internal hostnames are not allowed' };
    }
    return { safe: true };
  } catch {
    return { safe: false, error: 'Invalid URL format' };
  }
}

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const cached = crawlCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

  const urlCheck = isUrlSafe(normalizedUrl);
  if (!urlCheck.safe) {
    return {
      url: normalizedUrl, success: false, error: urlCheck.error,
      h1s: [], h2s: [], headingHierarchy: [], internalLinks: 0, externalLinks: 0,
      wordCount: 0, navLabels: [], hasHttps: false, hasSitemap: false,
      serviceKeywords: [], locationKeywords: [],
      images: { total: 0, withAlt: 0, withoutAlt: 0 },
      hasSchema: false, ogTags: {}, loadEstimate: 'unknown',
      ctaSignals: [], trustSignals: [], conversionGaps: [], servicePageUrls: [],
      locationPageUrls: [], phoneNumbers: [],
    };
  }

  const result: CrawlResult = {
    url: normalizedUrl,
    success: false,
    h1s: [],
    h2s: [],
    headingHierarchy: [],
    internalLinks: 0,
    externalLinks: 0,
    wordCount: 0,
    navLabels: [],
    hasHttps: normalizedUrl.startsWith('https'),
    hasSitemap: false,
    serviceKeywords: [],
    locationKeywords: [],
    images: { total: 0, withAlt: 0, withoutAlt: 0 },
    hasSchema: false,
    ogTags: {},
    loadEstimate: 'unknown',
    ctaSignals: [],
    trustSignals: [],
    conversionGaps: [],
    servicePageUrls: [],
    locationPageUrls: [],
    phoneNumbers: [],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MomentumBot/1.0; +https://momentum.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    result.success = true;
    result.title = $('title').text().trim() || undefined;
    result.metaDescription = $('meta[name="description"]').attr('content')?.trim() || undefined;
    result.canonicalUrl = $('link[rel="canonical"]').attr('href') || undefined;

    $('h1').each((_, el) => {
      const text = $(el).text().trim();
      if (text) result.h1s.push(text);
    });

    $('h2').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 150) result.h2s.push(text);
    });
    result.h2s = result.h2s.slice(0, 15);

    const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    headingTags.forEach(tag => {
      $(tag).each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length < 200) {
          result.headingHierarchy.push({ tag: tag.toUpperCase(), text });
        }
      });
    });
    result.headingHierarchy = result.headingHierarchy.slice(0, 30);

    const domain = new URL(normalizedUrl).hostname;
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('/') || href.includes(domain)) {
        result.internalLinks++;
      } else if (href.startsWith('http')) {
        result.externalLinks++;
      }
    });

    $('nav a, header a, .nav a, .menu a, [role="navigation"] a').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 50 && !text.startsWith('http')) {
        result.navLabels.push(text);
      }
    });
    result.navLabels = Array.from(new Set(result.navLabels)).slice(0, 20);

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    result.wordCount = bodyText.split(/\s+/).length;

    result.serviceKeywords = extractServiceKeywords(bodyText);
    result.locationKeywords = extractLocationKeywords(bodyText);
    result.phoneNumbers = extractPhoneNumbers(bodyText);

    $('img').each((_, el) => {
      result.images.total++;
      if ($(el).attr('alt')?.trim()) {
        result.images.withAlt++;
      } else {
        result.images.withoutAlt++;
      }
    });

    result.hasSchema = html.includes('application/ld+json');
    if (result.hasSchema) {
      const schemaTypes: string[] = [];
      const schemaMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of schemaMatches) {
        try {
          const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
          const parsed = JSON.parse(inner);
          const entries = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
          for (const entry of entries) {
            const t = entry['@type'];
            if (typeof t === 'string') schemaTypes.push(t);
            else if (Array.isArray(t)) schemaTypes.push(...t.filter((x: any) => typeof x === 'string'));
          }
        } catch { /* malformed JSON-LD */ }
      }
      result.schemaTypes = [...new Set(schemaTypes)].filter(Boolean).slice(0, 10);
    }

    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr('property')?.replace('og:', '') || '';
      const content = $(el).attr('content') || '';
      if (prop && content) result.ogTags[prop] = content;
    });

    // ── Evidence-layer: CTAs, trust signals, conversion gaps, page URLs ───────
    result.ctaSignals = detectCtaSignals($);
    result.trustSignals = detectTrustSignals($, html);
    const { servicePageUrls, locationPageUrls } = extractInternalPageUrls($, normalizedUrl);
    result.servicePageUrls = servicePageUrls;
    result.locationPageUrls = locationPageUrls;
    result.conversionGaps = detectConversionGaps($, result);

    // ── Sitemap detection — robots.txt + multi-path + body-sniffing ─────────
    // Never rely solely on content-type — servers frequently serve sitemaps as
    // text/plain or with no content-type at all. Read the body to confirm.
    try {
      const origin = new URL(normalizedUrl).origin;

      // Step 1: parse robots.txt for declared Sitemap: entries
      const robotsDeclaredUrls: string[] = [];
      try {
        const robotsRes = await fetch(`${origin}/robots.txt`, {
          signal: AbortSignal.timeout(4000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MomentumBot/1.0)' },
          redirect: 'follow',
        });
        if (robotsRes.ok) {
          const robotsText = await robotsRes.text();
          for (const line of robotsText.split('\n')) {
            const m = line.match(/^Sitemap:\s*(.+)/i);
            if (m) robotsDeclaredUrls.push(m[1].trim());
          }
        }
      } catch { /* robots.txt unreachable — continue without it */ }

      // Step 2: build ordered candidate list (robots.txt declarations first)
      const raw = [
        ...robotsDeclaredUrls,
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/sitemap-index.xml`,
        `${origin}/wp-sitemap.xml`,
      ];
      const seen = new Set<string>();
      const candidates = raw.filter(u => { if (seen.has(u)) return false; seen.add(u); return true; });

      // Step 3: probe each candidate until one validates as a real sitemap
      for (const candidate of candidates) {
        try {
          const sitemapRes = await fetch(candidate, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MomentumBot/1.0)' },
            redirect: 'follow',
          });
          if (!sitemapRes.ok) continue;

          const ct = sitemapRes.headers.get('content-type') ?? '';
          const bodySnippet = (await sitemapRes.text()).trimStart().slice(0, 512);

          // Accept if content-type declares XML, OR if the body starts with XML/sitemap markup.
          // Body sniffing is the authoritative check — it catches servers that serve valid
          // sitemaps with incorrect or missing content-type headers.
          const isXmlContentType = ct.includes('xml');
          const looksLikeSitemap = /^<\?xml|^<urlset|^<sitemapindex/i.test(bodySnippet);

          if (isXmlContentType || looksLikeSitemap) {
            result.hasSitemap = true;
            result.sitemapUrl = candidate;
            break;
          }
        } catch { /* this candidate timed out or failed — try next */ }
      }
    } catch { /* outer guard — hasSitemap stays false */ }

    crawlCache.set(url, { result, timestamp: Date.now() });
    return result;

  } catch (err: any) {
    result.error = err.message || 'Failed to crawl website';
    return result;
  }
}

export function clearCrawlCache(url?: string) {
  if (url) {
    crawlCache.delete(url);
  } else {
    crawlCache.clear();
  }
}

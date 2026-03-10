import * as cheerio from 'cheerio';

export interface CrawlResult {
  url: string;
  success: boolean;
  error?: string;
  title?: string;
  metaDescription?: string;
  h1s: string[];
  headingHierarchy: { tag: string; text: string }[];
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  navLabels: string[];
  hasHttps: boolean;
  hasSitemap: boolean;
  serviceKeywords: string[];
  locationKeywords: string[];
  images: { total: number; withAlt: number; withoutAlt: number };
  hasSchema: boolean;
  canonicalUrl?: string;
  ogTags: Record<string, string>;
  loadEstimate: string;
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
      h1s: [], headingHierarchy: [], internalLinks: 0, externalLinks: 0,
      wordCount: 0, navLabels: [], hasHttps: false, hasSitemap: false,
      serviceKeywords: [], locationKeywords: [],
      images: { total: 0, withAlt: 0, withoutAlt: 0 },
      hasSchema: false, ogTags: {}, loadEstimate: 'unknown',
    };
  }

  const result: CrawlResult = {
    url: normalizedUrl,
    success: false,
    h1s: [],
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

    $('img').each((_, el) => {
      result.images.total++;
      if ($(el).attr('alt')?.trim()) {
        result.images.withAlt++;
      } else {
        result.images.withoutAlt++;
      }
    });

    result.hasSchema = html.includes('application/ld+json');

    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr('property')?.replace('og:', '') || '';
      const content = $(el).attr('content') || '';
      if (prop && content) result.ogTags[prop] = content;
    });

    try {
      const sitemapUrl = new URL('/sitemap.xml', normalizedUrl).href;
      const sitemapRes = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MomentumBot/1.0)' },
      });
      result.hasSitemap = sitemapRes.ok && (sitemapRes.headers.get('content-type')?.includes('xml') ?? false);
    } catch {
      result.hasSitemap = false;
    }

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

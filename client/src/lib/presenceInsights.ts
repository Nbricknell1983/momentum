// Presence Snapshot — structured insight model and evidence bundle mappers.
// Pure functions with no side effects: safe to unit-test and call from any render context.

export type InsightStatus = 'positive' | 'warning' | 'neutral' | 'negative';

export interface EvidenceItem {
  label?: string;
  value: string;
  type?: 'text' | 'link' | 'count' | 'code';
}

export interface PresenceInsightDetail {
  id: string;
  label: string;
  status: InsightStatus;
  summary: string;
  whyItMatters?: string;
  recommendedImprovement?: string;
  evidence?: EvidenceItem[];
  technicalDetails?: string[];
}

// ── Website insights ───────────────────────────────────────────────────────

export function buildWebsiteInsights(
  w: any,
  hasSitemapData: boolean,
  sitemapPageCount: number,
  filteredGaps: string[],
): PresenceInsightDetail[] {
  if (!w?.url) return [];
  const insights: PresenceInsightDetail[] = [];

  // 1. HTTPS
  insights.push({
    id: 'https',
    label: w.hasHttps ? 'Secure website' : 'Not using HTTPS',
    status: w.hasHttps ? 'positive' : 'negative',
    summary: w.hasHttps
      ? 'The website is using HTTPS — pages load over an encrypted, secure connection.'
      : 'The website is not using HTTPS. Pages may load over an unencrypted connection.',
    whyItMatters: 'HTTPS is a baseline trust signal for both visitors and search engines. Browsers actively warn users about non-HTTPS sites, which increases bounce rates and reduces credibility.',
    recommendedImprovement: w.hasHttps
      ? 'Maintain secure redirects across all pages, subdomains, and assets to keep the padlock in place.'
      : 'Install an SSL/TLS certificate and configure all URLs to redirect from HTTP to HTTPS, including images and scripts.',
    evidence: [
      { label: 'Website', value: w.url, type: 'link' },
      { label: 'HTTPS detected', value: w.hasHttps ? 'Yes' : 'No' },
    ],
    technicalDetails: [`hasHttps: ${w.hasHttps}`, `URL: ${w.url}`],
  });

  // 2. Sitemap
  const sitemapStatus: InsightStatus = w.hasSitemap ? 'positive' : hasSitemapData ? 'neutral' : 'negative';
  const sitemapLabel = w.hasSitemap
    ? 'Sitemap found'
    : hasSitemapData
      ? `${sitemapPageCount} pages detected`
      : 'No sitemap found';
  insights.push({
    id: 'sitemap',
    label: sitemapLabel,
    status: sitemapStatus,
    summary: w.hasSitemap
      ? 'A sitemap was found at the standard location, helping search engines discover all the site\'s pages.'
      : hasSitemapData
        ? `A sitemap.xml wasn't found at the root, but ${sitemapPageCount} pages were captured through a direct scan — the site is indexable.`
        : 'No sitemap was detected. Search engines may miss pages or crawl the site inefficiently.',
    whyItMatters: 'A sitemap tells search engines what pages exist, how often they update, and which are most important. Without one, new or deep pages may not get indexed promptly.',
    recommendedImprovement: hasSitemapData
      ? 'Ensure all key service and location pages are included in the sitemap and that it\'s submitted to Google Search Console.'
      : 'Create an XML sitemap covering all key pages and submit it to Google Search Console. Most website platforms can generate one automatically.',
    evidence: [
      ...(sitemapPageCount > 0 ? [{ label: 'Pages detected', value: String(sitemapPageCount), type: 'count' as const }] : []),
      { label: '/sitemap.xml', value: w.hasSitemap ? 'Found' : 'Not found at root' },
      ...(w.url ? (() => { try { return [{ label: 'Expected sitemap URL', value: `${new URL(w.url).origin}/sitemap.xml`, type: 'link' as const }]; } catch { return []; } })() : []),
    ],
    technicalDetails: [`hasSitemap: ${w.hasSitemap}`, `scannedPages: ${sitemapPageCount}`],
  });

  // 3. Structured data (schema markup)
  insights.push({
    id: 'schema',
    label: w.hasSchema ? 'Structured data found' : 'No structured data',
    status: w.hasSchema ? 'positive' : 'warning',
    summary: w.hasSchema
      ? 'Structured data (schema markup) is present on the site, helping search engines understand the business type and content.'
      : 'No structured data was detected on the homepage. Search engines are relying on plain text alone to understand the business.',
    whyItMatters: 'Structured data enables rich results in search (star ratings, business hours, services) and helps Google understand what kind of business this is — especially useful for local search.',
    recommendedImprovement: w.hasSchema
      ? 'Expand structured data coverage to service and location pages. Consider adding Review, Service, and FAQPage schema types for better search visibility.'
      : 'Add LocalBusiness schema markup to the homepage. For a service business, also add Service schema to individual service pages.',
    evidence: [
      { label: 'Schema detected', value: w.hasSchema ? 'Yes — homepage' : 'Not detected' },
      { value: 'Full schema audit available in Website X-Ray' },
    ],
    technicalDetails: [`hasSchema: ${w.hasSchema}`],
  });

  // 4. Phone visibility
  const hasPhone = (w.phoneNumbers?.length ?? 0) > 0;
  const phoneGapExists = filteredGaps.some(g => g.toLowerCase().includes('phone'));
  if (hasPhone || phoneGapExists) {
    insights.push({
      id: 'phone',
      label: hasPhone ? `Phone visible — ${w.phoneNumbers[0]}` : 'Phone not prominent on homepage',
      status: hasPhone ? 'positive' : 'warning',
      summary: hasPhone
        ? `A phone number (${w.phoneNumbers[0]}) was found in the page content.`
        : 'No phone number was detected in the key areas of the homepage (header, hero, or footer).',
      whyItMatters: 'For service and trade businesses, a visible phone number is one of the highest-converting elements on a website. Visitors ready to enquire need to see it immediately — friction at this point costs leads.',
      recommendedImprovement: hasPhone
        ? 'Ensure the number is also in the header or a sticky bar, not just buried in the footer. Use click-to-call links for mobile users.'
        : 'Add the business phone number to the header area, hero section, and a sticky mobile bar. Use a tel: link so visitors can tap-to-call from their phone.',
      evidence: [
        ...(w.phoneNumbers?.length > 0
          ? w.phoneNumbers.map((n: string) => ({ label: 'Number found', value: n }))
          : [{ value: 'No phone number found on homepage' }]),
        { label: 'Areas checked', value: 'Header, hero, body text, footer' },
      ],
    });
  }

  // 5. Calls to action
  const ctaCount = w.ctaSignals?.length ?? 0;
  insights.push({
    id: 'cta',
    label: ctaCount > 0 ? `${ctaCount} call${ctaCount !== 1 ? 's' : ''} to action found` : 'No calls to action detected',
    status: ctaCount >= 3 ? 'positive' : ctaCount > 0 ? 'neutral' : 'warning',
    summary: ctaCount > 0
      ? `${ctaCount} call-to-action element${ctaCount !== 1 ? 's' : ''} ${ctaCount !== 1 ? 'were' : 'was'} detected on the homepage.`
      : 'No clear calls to action were detected on the homepage. Visitors may not know what to do next.',
    whyItMatters: 'CTAs guide visitors toward booking, calling, or enquiring. A homepage without clear next steps creates a dead end for interested prospects.',
    recommendedImprovement: ctaCount > 0
      ? 'Ensure CTAs are action-specific ("Get a Free Quote", "Book Now") and appear above the fold as well as after key content sections.'
      : 'Add at least one primary CTA above the fold (e.g. "Get a Free Quote", "Call Now"). Follow it with secondary CTAs after each service section.',
    evidence: ctaCount > 0
      ? w.ctaSignals.map((c: string) => ({ label: 'CTA found', value: c }))
      : [{ value: 'No button text or form CTAs detected on homepage' }],
  });

  // 6. Service page coverage
  const servicePageCount = w.servicePageUrls?.length ?? 0;
  if (servicePageCount > 0 || filteredGaps.some(g => g.toLowerCase().includes('service'))) {
    insights.push({
      id: 'service-pages',
      label: servicePageCount > 0
        ? `${servicePageCount} service page${servicePageCount !== 1 ? 's' : ''} found`
        : 'Limited service page coverage',
      status: servicePageCount >= 3 ? 'positive' : servicePageCount > 0 ? 'neutral' : 'warning',
      summary: servicePageCount > 0
        ? `${servicePageCount} dedicated service page${servicePageCount !== 1 ? 's were' : ' was'} detected on the site.`
        : 'The site appears to have limited or no dedicated service pages.',
      whyItMatters: 'Dedicated service pages help visitors quickly understand what\'s offered, and give Google specific pages to rank for each service. A single "Services" page listing everything is far less effective.',
      recommendedImprovement: servicePageCount >= 3
        ? 'Ensure each service page has a clear headline, description, trust signals (reviews, credentials), and a prominent CTA.'
        : 'Create a dedicated page for each major service with clear descriptions, local signals, trust elements, and a call to action.',
      evidence: [
        { label: 'Service pages detected', value: String(servicePageCount), type: 'count' },
        ...w.servicePageUrls.slice(0, 6).map((u: string) => ({ value: u, type: 'link' as const })),
        ...(w.servicePageUrls.length > 6 ? [{ value: `+${w.servicePageUrls.length - 6} more pages` }] : []),
      ],
    });
  }

  // 7. Trust signals
  const trustCount = w.trustSignals?.length ?? 0;
  if (trustCount > 0) {
    insights.push({
      id: 'trust-signals',
      label: `${trustCount} trust signal${trustCount !== 1 ? 's' : ''} detected`,
      status: trustCount >= 3 ? 'positive' : 'neutral',
      summary: `${trustCount} trust signal${trustCount !== 1 ? 's were' : ' was'} found on the homepage, including elements like testimonials, certifications, or awards.`,
      whyItMatters: 'Trust signals reduce visitor hesitation, particularly for service businesses where quality and reliability are key buying factors.',
      recommendedImprovement: 'Ensure trust signals are visible above the fold. Video testimonials and specific numbers ("500+ jobs completed") outperform generic text.',
      evidence: w.trustSignals.map((t: string) => ({ label: 'Signal detected', value: t })),
    });
  }

  // 8. Location page coverage
  const locationPageCount = w.locationPageUrls?.length ?? 0;
  if (locationPageCount > 0) {
    insights.push({
      id: 'location-pages',
      label: `${locationPageCount} location page${locationPageCount !== 1 ? 's' : ''} found`,
      status: locationPageCount >= 2 ? 'positive' : 'neutral',
      summary: `${locationPageCount} location-specific page${locationPageCount !== 1 ? 's were' : ' was'} found — these help the site rank in specific geographic searches.`,
      whyItMatters: 'Location pages let a business rank in multiple areas. Without them, a business in one suburb struggles to appear for nearby suburb searches.',
      recommendedImprovement: 'Each location page should mention the specific area naturally, include local trust signals, and have a locally relevant CTA.',
      evidence: w.locationPageUrls.slice(0, 6).map((u: string) => ({ value: u, type: 'link' as const })),
    });
  }

  return insights;
}

// ── GBP insights ───────────────────────────────────────────────────────────

export function buildGbpInsights(gbp: any): PresenceInsightDetail[] {
  if (!gbp?.placeId && !gbp?.name) return [];
  const insights: PresenceInsightDetail[] = [];

  // Listing quality (rating + reviews)
  if (gbp.rating != null || gbp.reviewCount != null) {
    const rating = gbp.rating ?? null;
    const reviewCount = gbp.reviewCount ?? 0;
    const ratingStatus: InsightStatus =
      (rating ?? 0) >= 4.5 ? 'positive' : (rating ?? 0) >= 4.0 ? 'neutral' : 'warning';
    insights.push({
      id: 'gbp-rating',
      label: rating != null ? `${rating.toFixed(1)} ★ · ${reviewCount} reviews` : `${reviewCount} reviews`,
      status: ratingStatus,
      summary: rating != null
        ? `This business has a ${rating.toFixed(1)}-star Google rating from ${reviewCount} review${reviewCount !== 1 ? 's' : ''}.`
        : `${reviewCount} Google reviews found with no aggregate rating available.`,
      whyItMatters: 'Google rating directly affects Maps Pack placement and click-through rates. Listings below 4.0 stars see significantly lower enquiry volumes. Reviews are also a confirmed local ranking signal.',
      recommendedImprovement: (rating ?? 5) < 4.5
        ? 'Implement a post-job review request process. Even 1–2 new positive reviews per week can shift ranking position within 60–90 days.'
        : 'Maintain review velocity — consistent new reviews signal to Google that the business is active and trustworthy.',
      evidence: [
        ...(rating != null ? [{ label: 'Average rating', value: `${rating.toFixed(1)} / 5.0`, type: 'count' as const }] : []),
        { label: 'Total reviews', value: String(reviewCount), type: 'count' },
        ...(gbp.mapsUrl ? [{ label: 'Google Maps listing', value: gbp.mapsUrl, type: 'link' as const }] : []),
      ],
      technicalDetails: [
        ...(gbp.placeId ? [`Place ID: ${gbp.placeId}`] : []),
        ...(gbp.category ? [`Category: ${gbp.category}`] : []),
      ],
    });
  }

  // Health notes — each note as its own insight
  (gbp.healthNotes ?? []).forEach((note: string, i: number) => {
    insights.push({
      id: `gbp-health-${i}`,
      label: note,
      status: 'warning',
      summary: note,
      whyItMatters: 'Google Business Profile health issues can suppress Maps Pack visibility and reduce the quality score of the listing.',
      recommendedImprovement: 'Review the GBP listing in Google Business Manager and address flagged items. Incomplete or inconsistent information reduces ranking potential.',
      evidence: [
        { label: 'Flag detected on', value: gbp.name || 'GBP listing' },
        ...(gbp.mapsUrl ? [{ label: 'Listing URL', value: gbp.mapsUrl, type: 'link' as const }] : []),
      ],
    });
  });

  return insights;
}

// ── Social insights ────────────────────────────────────────────────────────

export function buildSocialInsights(soc: any): PresenceInsightDetail[] {
  if (!soc) return [];

  const platforms = [
    {
      id: 'facebook', key: 'facebook', label: 'Facebook',
      data: soc.facebook,
      whyItMatters: 'Facebook is a key discovery and trust channel for service businesses. Many potential customers check a business\'s Facebook page before enquiring.',
    },
    {
      id: 'instagram', key: 'instagram', label: 'Instagram',
      data: soc.instagram,
      whyItMatters: 'Instagram works especially well for showing completed work, team culture, and behind-the-scenes content — particularly effective for trade businesses.',
    },
    {
      id: 'linkedin', key: 'linkedin', label: 'LinkedIn',
      data: soc.linkedin,
      whyItMatters: 'LinkedIn matters for B2B and professional service contexts. For trade businesses serving commercial clients, a LinkedIn presence adds credibility.',
    },
    {
      id: 'twitter', key: 'twitter', label: 'X / Twitter',
      data: soc.twitter,
      whyItMatters: 'X is less critical for most trade businesses but valuable for thought leadership and industry engagement.',
    },
  ] as const;

  return platforms
    .filter(p => p.data !== undefined)
    .map(p => ({
      id: p.id,
      label: p.data?.detected ? `${p.label} page found` : `${p.label} — not found`,
      status: (p.data?.detected ? 'positive' : 'neutral') as InsightStatus,
      summary: p.data?.detected
        ? `A ${p.label} page was found${p.data.url ? ' and linked from the website.' : '.'}`
        : `No ${p.label} presence was detected on the website.`,
      whyItMatters: p.whyItMatters,
      recommendedImprovement: p.data?.detected
        ? `Ensure the ${p.label} page is active and posts consistently. Link it from the website header or footer.`
        : `If the business has a ${p.label} page, link to it from the website. If not, consider creating one and sharing completed work, reviews, and offers.`,
      evidence: p.data?.detected && p.data?.url
        ? [{ label: `${p.label} URL`, value: p.data.url, type: 'link' as const }]
        : [{ value: `No ${p.label} link detected on website` }],
    }));
}

// ── Search / keyword insights ──────────────────────────────────────────────

export function buildSearchInsights(w: any, serp: any): PresenceInsightDetail[] {
  const insights: PresenceInsightDetail[] = [];

  const serviceKws: string[] = w?.serviceKeywords?.slice(0, 8) ?? [];
  const locationKws: string[] = w?.locationKeywords?.slice(0, 8) ?? [];

  if (serviceKws.length > 0) {
    insights.push({
      id: 'service-keywords',
      label: `${serviceKws.length} service keyword${serviceKws.length !== 1 ? 's' : ''} detected`,
      status: serviceKws.length >= 4 ? 'positive' : 'neutral',
      summary: `${serviceKws.length} service-related keyword${serviceKws.length !== 1 ? 's were' : ' was'} found in the website content.`,
      whyItMatters: 'Service keywords signal to search engines what the business does. Pages optimised for specific service terms rank better for those searches.',
      recommendedImprovement: 'Ensure each service keyword maps to a dedicated page — not just a mention on the homepage. Use natural language that matches how customers search.',
      evidence: serviceKws.map(k => ({ label: 'Service keyword', value: k })),
    });
  }

  if (locationKws.length > 0) {
    insights.push({
      id: 'location-keywords',
      label: `${locationKws.length} location signal${locationKws.length !== 1 ? 's' : ''} detected`,
      status: locationKws.length >= 3 ? 'positive' : 'neutral',
      summary: `${locationKws.length} location-specific term${locationKws.length !== 1 ? 's were' : ' was'} found in the website content.`,
      whyItMatters: 'Location signals on the website reinforce local relevance for search engines, directly supporting Maps Pack and organic rankings in the target area.',
      recommendedImprovement: 'Include the primary service area in page titles, headings, and naturally within body text. Avoid keyword stuffing — 2–3 natural mentions per page is ideal.',
      evidence: locationKws.map(k => ({ label: 'Location signal', value: k })),
    });
  }

  if (serp?.competitors?.length > 0) {
    insights.push({
      id: 'competitors',
      label: `${serp.competitors.length} competitor${serp.competitors.length !== 1 ? 's' : ''} estimated`,
      status: 'neutral',
      summary: `${serp.competitors.length} competing business${serp.competitors.length !== 1 ? 'es were' : ' was'} identified in the estimated search landscape for this area and service.`,
      whyItMatters: 'Understanding which competitors appear in local search helps identify the gap to close and what a winning listing or page looks like.',
      recommendedImprovement: 'Review top-ranking competitor pages and GBP listings. Match or exceed their review count, page completeness, and content depth.',
      evidence: serp.competitors.map((c: any) => ({ label: 'Competitor', value: c.name || c })),
      technicalDetails: ['Source: GPT-estimated (not live SERP data)', `Generated: ${serp.generatedAt || 'unknown'}`],
    });
  }

  return insights;
}

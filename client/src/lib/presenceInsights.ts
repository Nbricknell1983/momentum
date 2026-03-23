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
  title?: string;          // Optional: modal heading when it should differ from the row label
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

  // 1. HTTPS + page structure overview
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
      { label: 'Website', value: w.url, type: 'link' as const },
      { label: 'HTTPS', value: w.hasHttps ? '✓ Secure' : '✗ Not secure' },
      ...(w.title ? [{ label: 'Page title', value: w.title }] : []),
      ...(w.metaDescription ? [{ label: 'Meta description', value: w.metaDescription }] : []),
      ...(w.canonicalUrl ? [{ label: 'Canonical URL', value: w.canonicalUrl, type: 'link' as const }] : []),
      ...(w.wordCount ? [{ label: 'Word count', value: `${w.wordCount.toLocaleString()} words`, type: 'count' as const }] : []),
      // Full heading hierarchy (H1 → H6)
      ...(w.headingHierarchy?.length
        ? w.headingHierarchy.map((h: { tag: string; text: string }) => ({
            label: h.tag,
            value: h.text,
            type: 'code' as const,
          }))
        : [
            ...(w.h1s?.length ? w.h1s.map((h: string) => ({ label: 'H1', value: h, type: 'code' as const })) : []),
            ...(w.h2s?.slice(0, 6).map((h: string) => ({ label: 'H2', value: h, type: 'code' as const })) ?? []),
          ]
      ),
      // Body text snippet
      ...(w.bodySnippet ? [{ label: 'Body content', value: w.bodySnippet }] : []),
    ],
    technicalDetails: [
      `hasHttps: ${w.hasHttps}`,
      `URL: ${w.url}`,
      ...(w.canonicalUrl ? [`canonical: ${w.canonicalUrl}`] : []),
    ],
  });

  // 1b. Internal links
  const linkUrls: { href: string; text: string }[] = w.internalLinkUrls ?? [];
  const linkCount = w.internalLinks ?? linkUrls.length;
  if (linkCount > 0 || linkUrls.length > 0) {
    insights.push({
      id: 'internal-links',
      label: `${linkCount} internal link${linkCount !== 1 ? 's' : ''} found`,
      status: linkCount >= 5 ? 'positive' : 'neutral',
      summary: `${linkCount} internal link${linkCount !== 1 ? 's were' : ' was'} found on the homepage — these help Google and visitors navigate the site.`,
      whyItMatters: 'Internal links distribute page authority and help search engines discover all pages on the site. A well-linked homepage is a strong signal of site structure quality.',
      recommendedImprovement: linkCount < 5
        ? 'Add clear navigation links and contextual links from the homepage to key service, location, and about pages.'
        : 'Ensure all key service and location pages are reachable within 2–3 clicks from the homepage.',
      evidence: [
        { label: 'Total internal links', value: String(linkCount), type: 'count' as const },
        ...linkUrls.slice(0, 30).map(({ href, text }) => ({
          label: text,
          value: href,
          type: 'link' as const,
        })),
        ...(linkUrls.length > 30 ? [{ value: `+${linkUrls.length - 30} more links` }] : []),
      ],
      technicalDetails: [`internalLinks: ${linkCount}`],
    });
  }

  // 2. Sitemap
  // Detection probes robots.txt + 4 common paths + body-sniffs the response.
  // Only surface "No sitemap" (negative) when detection is confirmed-absent;
  // use "not yet verified" (neutral) for stale/incomplete evidence.
  const detectedSitemapUrl: string | null = w.sitemapUrl ?? null;
  // hasSitemap === true  → confirmed present
  // hasSitemap === false → confirmed absent (crawl checked and didn't find one)
  // hasSitemap === null/undefined → not checked yet
  const sitemapConfirmedAbsent = w.hasSitemap === false;
  const sitemapStatus: InsightStatus = w.hasSitemap ? 'positive' : hasSitemapData ? 'neutral' : 'warning';
  const sitemapLabel = w.hasSitemap
    ? 'Sitemap found'
    : hasSitemapData
      ? `${sitemapPageCount} pages detected`
      : sitemapConfirmedAbsent
        ? 'No sitemap found'
        : 'Sitemap not yet verified';
  insights.push({
    id: 'sitemap',
    label: sitemapLabel,
    status: sitemapStatus,
    summary: w.hasSitemap
      ? `Sitemap confirmed — search engines can discover all pages on this site.${detectedSitemapUrl ? ` Found at ${detectedSitemapUrl}.` : ''}`
      : hasSitemapData
        ? `A sitemap wasn't confirmed at common locations, but ${sitemapPageCount} pages were captured through a direct scan — the site is indexable.`
        : sitemapConfirmedAbsent
          ? 'No sitemap was found at robots.txt or any common sitemap paths. Search engines will need to crawl links to discover pages.'
          : 'Sitemap presence hasn\'t been confirmed yet. Re-running the website scan will check robots.txt and common sitemap paths.',
    whyItMatters: 'A sitemap tells search engines what pages exist, how often they update, and which are most important. Without one, new or deep pages may not get indexed promptly.',
    recommendedImprovement: w.hasSitemap
      ? 'Ensure all key service and location pages are included in the sitemap and that it\'s submitted to Google Search Console.'
      : hasSitemapData
        ? 'Ensure all key service and location pages are included in the sitemap and that it\'s submitted to Google Search Console.'
        : 'Create an XML sitemap covering all key pages and submit it to Google Search Console. Most CMS platforms can generate this automatically.',
    evidence: [
      ...(sitemapPageCount > 0 ? [{ label: 'Pages in sitemap', value: String(sitemapPageCount), type: 'count' as const }] : []),
      ...(detectedSitemapUrl
        ? [{ label: 'Sitemap URL', value: detectedSitemapUrl, type: 'link' as const }]
        : w.url
          ? (() => { try { return [{ label: 'Checked at', value: `${new URL(w.url).origin}/sitemap.xml`, type: 'link' as const }]; } catch { return []; } })()
          : []
      ),
      { label: 'Detection result', value: w.hasSitemap ? '✓ Confirmed' : 'Not confirmed' },
      ...(w.navLabels?.length
        ? [
            { label: 'Navigation structure', value: `${w.navLabels.length} nav items detected` },
            ...w.navLabels.slice(0, 10).map((label: string) => ({ label: '→ Nav item', value: label })),
          ]
        : []
      ),
    ],
    technicalDetails: [
      `hasSitemap: ${w.hasSitemap}`,
      `sitemapUrl: ${detectedSitemapUrl ?? 'none'}`,
      `scannedPages: ${sitemapPageCount}`,
      ...(w.navLabels?.length ? [`navLabels: ${w.navLabels.join(', ')}`] : []),
    ],
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
      { label: 'Schema detected', value: w.hasSchema ? '✓ Present on homepage' : '✗ Not detected' },
      ...(w.schemaTypes?.length
        ? w.schemaTypes.map((t: string) => ({ label: 'Schema type', value: t, type: 'code' as const }))
        : w.hasSchema
          ? [{ value: 'Schema found but types could not be parsed' }]
          : [{ value: 'No JSON-LD structured data found on homepage' }]
      ),
    ],
    technicalDetails: [
      `hasSchema: ${w.hasSchema}`,
      ...(w.schemaTypes?.length ? [`schemaTypes: ${w.schemaTypes.join(', ')}`] : []),
    ],
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
        { label: 'Service pages', value: String(servicePageCount), type: 'count' as const },
        ...w.servicePageUrls.slice(0, 8).map((u: string) => ({ label: 'Page URL', value: u, type: 'link' as const })),
        ...(w.servicePageUrls.length > 8 ? [{ value: `+${w.servicePageUrls.length - 8} more service pages` }] : []),
        ...(w.serviceKeywords?.length
          ? [
              { label: 'Service keywords found', value: `${w.serviceKeywords.length} detected`, type: 'count' as const },
              ...w.serviceKeywords.slice(0, 6).map((k: string) => ({ label: '→ Keyword', value: k })),
            ]
          : []
        ),
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
      evidence: [
        { label: 'Location pages', value: String(locationPageCount), type: 'count' as const },
        ...w.locationPageUrls.slice(0, 8).map((u: string) => ({ label: 'Page URL', value: u, type: 'link' as const })),
        ...(w.locationPageUrls.length > 8 ? [{ value: `+${w.locationPageUrls.length - 8} more location pages` }] : []),
        ...(w.locationKeywords?.length
          ? [
              { label: 'Location signals', value: `${w.locationKeywords.length} detected`, type: 'count' as const },
              ...w.locationKeywords.slice(0, 6).map((k: string) => ({ label: '→ Location', value: k })),
            ]
          : []
        ),
      ],
    });
  }

  return insights;
}

// ── GBP insights ───────────────────────────────────────────────────────────

export function buildGbpInsights(gbp: any): PresenceInsightDetail[] {
  if (!gbp?.placeId && !gbp?.name) return [];
  const insights: PresenceInsightDetail[] = [];

  const hasNetwork = (gbp.networkSummary?.totalLocations ?? 0) > 1;
  const net = gbp.networkSummary;

  // ── Multi-location network insight ────────────────────────────────────────
  if (hasNetwork) {
    const totalLocs  = net.totalLocations as number;
    const totalRevs  = net.totalReviews as number;
    const avgRating  = net.avgRating as number | null;
    const high       = net.highestRated;
    const low        = net.lowestRated;
    const siblings   = (gbp.siblingLocations ?? []) as any[];

    const netStatus: InsightStatus = avgRating == null ? 'neutral' : avgRating >= 4.2 ? 'positive' : avgRating >= 3.8 ? 'neutral' : 'warning';

    insights.push({
      id: 'gbp-network',
      label: `${totalLocs} locations detected across brand`,
      title: `${(gbp.name || 'Business')} — Google Business Profile network`,
      status: netStatus,
      summary: `${totalLocs} Google Business Profile locations were detected for this brand, with ${totalRevs.toLocaleString()} total reviews across the network${avgRating != null ? ` and an average rating of ${avgRating.toFixed(1)}★` : ''}.`,
      whyItMatters: 'Multi-location brands have uneven reputations across their network. A poorly performing location can drag down perception of the whole brand, while the highest-rated location sets the ceiling. Keeping all GBP listings optimised is essential for maintaining consistent Maps Pack visibility.',
      recommendedImprovement: avgRating != null && avgRating < 4.3
        ? 'Prioritise review generation at underperforming locations. Standardise GBP profiles across all branches — consistent categories, photos, and descriptions improve the network-wide ranking baseline.'
        : 'Maintain review velocity across all locations. Ensure each branch has complete GBP profiles with accurate hours, photos, and service descriptions.',
      evidence: [
        { label: 'Total locations', value: String(totalLocs), type: 'count' },
        { label: 'Total reviews', value: totalRevs.toLocaleString(), type: 'count' },
        ...(avgRating != null ? [{ label: 'Average rating', value: `${avgRating.toFixed(1)} / 5.0`, type: 'count' as const }] : []),
        ...(high ? [{ label: 'Highest rated', value: `${high.name}${high.rating != null ? ` — ${high.rating.toFixed(1)}★ (${high.reviewCount ?? 0} reviews)` : ''}` }] : []),
        ...(low  ? [{ label: 'Lowest rated',  value: `${low.name}${low.rating != null ? ` — ${low.rating.toFixed(1)}★ (${low.reviewCount ?? 0} reviews)` : ''}` }] : []),
        ...siblings.slice(0, 5).map((s: any) => ({
          label: s.relation === 'domain-match' ? 'Same website' : 'Brand location',
          value: `${s.name}${s.address ? ` — ${s.address}` : ''}${s.rating != null ? ` | ${s.rating.toFixed(1)}★` : ''}`,
        })),
        ...(siblings.length > 5 ? [{ value: `+${siblings.length - 5} more locations` }] : []),
      ],
      technicalDetails: [
        `Detection method: brand-name expansion (second-pass)`,
        ...(siblings.map((s: any, i: number) => `Sibling ${i + 1}: ${s.name} | confidence=${s.confidence} | ${s.reasons?.join(', ')}`)),
      ],
    });
  }

  // ── Primary location rating + reviews ─────────────────────────────────────
  if (gbp.rating != null || gbp.reviewCount != null) {
    const rating     = gbp.rating ?? null;
    const reviewCount = gbp.reviewCount ?? 0;
    const ratingStatus: InsightStatus = (rating ?? 0) >= 4.5 ? 'positive' : (rating ?? 0) >= 4.0 ? 'neutral' : 'warning';

    insights.push({
      id: 'gbp-rating',
      label: hasNetwork
        ? `Primary: ${rating != null ? `${rating.toFixed(1)}★` : '—'} · ${reviewCount} reviews`
        : rating != null ? `${rating.toFixed(1)} ★ · ${reviewCount} reviews` : `${reviewCount} reviews`,
      status: ratingStatus,
      summary: rating != null
        ? `The primary matched location has a ${rating.toFixed(1)}-star Google rating from ${reviewCount} review${reviewCount !== 1 ? 's' : ''}.`
        : `${reviewCount} Google reviews found with no aggregate rating available.`,
      whyItMatters: 'Google rating directly affects Maps Pack placement and click-through rates. Listings below 4.0 stars see significantly lower enquiry volumes. Reviews are also a confirmed local ranking signal.',
      recommendedImprovement: (rating ?? 5) < 4.5
        ? 'Implement a post-job review request process. Even 1–2 new positive reviews per week can shift ranking position within 60–90 days.'
        : 'Maintain review velocity — consistent new reviews signal to Google that the business is active and trustworthy.',
      evidence: [
        ...(rating != null ? [{ label: 'Rating', value: `${rating.toFixed(1)} / 5.0`, type: 'count' as const }] : []),
        { label: 'Reviews', value: String(reviewCount), type: 'count' },
        ...(gbp.address ? [{ label: 'Address', value: gbp.address }] : []),
        ...(gbp.mapsUrl ? [{ label: 'Google Maps listing', value: gbp.mapsUrl, type: 'link' as const }] : []),
      ],
      technicalDetails: [
        ...(gbp.placeId ? [`Place ID: ${gbp.placeId}`] : []),
        ...(gbp.category ? [`Category: ${gbp.category}`] : []),
      ],
    });
  }

  // ── Health notes — each note as its own insight ────────────────────────────
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

// ── Paid Search insights ────────────────────────────────────────────────────
// Converts raw keyword auction data into plain-English insight rows.
// All auction terminology (impression share, top-of-page rate) is confined to
// evidence + technical sections — the card and modal summary use commercial language.

// Module-private helpers
function _pct(v: number): string { return `${Math.round(v * 100)}%`; }
function _shareLabel(v: number): string { return v >= 0.65 ? 'strong' : v >= 0.35 ? 'modest' : 'limited'; }
function _shareStatus(v: number): InsightStatus { return v >= 0.65 ? 'positive' : v >= 0.35 ? 'neutral' : 'warning'; }
function _strengthStatus(s: string): InsightStatus { return s === 'strong' ? 'positive' : s === 'moderate' ? 'neutral' : 'warning'; }
function _cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export function buildPaidSearchInsights(ps: any): PresenceInsightDetail[] {
  if (!ps) return [];
  const insights: PresenceInsightDetail[] = [];

  // ── Normalise nested (PaidSearchEvidence) vs flat (legacy) shape ─────────
  const activityState: string | null  = ps.activityState ?? null;
  const transparency: any             = ps.transparency ?? null;
  const auction: any                  = ps.auction ?? null;

  // Auction fields — read from nested auction sub-object first, then flat (legacy)
  const overallShare: number | null = auction?.overallImpressionShare ?? ps.overallImpressionShare ?? null;
  const topOfPage:    number | null = auction?.overallTopOfPageRate   ?? ps.overallTopOfPageRate   ?? null;
  const branded:      string | null = auction?.brandedStrength        ?? ps.brandedStrength        ?? null;
  const nonBrand:     string | null = auction?.nonBrandStrength       ?? ps.nonBrandStrength       ?? null;
  const entries:      any[]         = auction?.entries ?? ps.entries ?? [];
  const keyWins:      string[]      = ps.keyWins ?? [];
  const keyGaps:      string[]      = ps.keyGaps ?? [];

  // Transparency fields
  const adsDetected:  boolean = transparency?.activeAdsDetected ?? false;
  const recentAds:    boolean = transparency?.recentAdsDetected ?? false;
  const adCount:      number | null = transparency?.adCount ?? null;
  const exampleAds:   any[]   = transparency?.exampleAds ?? [];
  const advertiserName: string | null = transparency?.advertiserName ?? null;

  // ── 1. Overall activity status ─────────────────────────────────────────────
  // Resolve from activityState (new model), then transparency, then auction data
  const resolvedState: 'confirmed'|'detected'|'unknown'|'not-detected'|null =
    activityState as any ??
    (adsDetected ? (exampleAds.length > 0 ? 'confirmed' : 'detected') : null) ??
    (overallShare != null ? (overallShare > 0 ? 'confirmed' : 'not-detected') : null) ??
    (entries.length > 0 ? 'detected' : null);

  const hasActivity = resolvedState === 'confirmed' || resolvedState === 'detected';
  const isUnknown   = resolvedState === 'unknown' || resolvedState == null;

  const activityLabel = resolvedState === 'confirmed'     ? 'Paid search activity is confirmed'
    : resolvedState === 'detected'                        ? 'Paid search activity detected'
    : resolvedState === 'not-detected'                    ? 'No paid search activity detected'
    : 'Paid search status unknown';

  const activityStatus: InsightStatus = resolvedState === 'confirmed' ? 'positive'
    : resolvedState === 'detected'  ? 'positive'
    : resolvedState === 'unknown'   ? 'neutral'
    : 'neutral';

  insights.push({
    id: 'ps-activity',
    label: activityLabel,
    status: activityStatus,
    summary: ps.summary || (hasActivity
      ? `Paid search activity is ${resolvedState === 'confirmed' ? 'confirmed' : 'detected'} for this business${overallShare != null ? ` — capturing approximately ${_pct(overallShare)} of available impressions across tracked keywords` : transparency ? ' via the Google Ads Transparency Center' : ''}.`
      : isUnknown
        ? 'Paid search activity could not be determined at this time. Evidence gathering may be incomplete.'
        : 'No current paid search activity has been detected for this business.'),
    whyItMatters: 'Paid search activity signals investment in keyword-level visibility. For a sales conversation, it confirms budget intent and lets you position your agency around improving efficiency — not just awareness.',
    recommendedImprovement: hasActivity
      ? 'Ensure paid and organic strategies are complementary. High-cost paid keywords that also rank organically should be reviewed — consolidating spend on genuinely competitive terms reduces wasted budget.'
      : isUnknown
        ? 'Gather more evidence before drawing conclusions. Trigger an evidence refresh and consider checking the Google Ads Transparency Center manually for this business.'
        : 'Explore whether paid search is commercially viable. A focused pilot on 5–10 high-intent service keywords can quickly validate opportunity before committing to ongoing spend.',
    evidence: [
      ...(resolvedState ? [{ label: 'Activity state', value: _cap(resolvedState.replace('-', ' ')) }] : []),
      ...(advertiserName ? [{ label: 'Advertiser name', value: advertiserName }] : []),
      ...(adCount != null ? [{ label: 'Ads detected', value: String(adCount), type: 'count' as const }] : []),
      ...(overallShare != null ? [{ label: 'Impression share', value: _pct(overallShare), type: 'count' as const }] : []),
      ...(topOfPage     != null ? [{ label: 'Top-of-page rate', value: _pct(topOfPage),   type: 'count' as const }] : []),
      ...(entries.length > 0 ? [{ label: 'Keywords tracked', value: String(entries.length), type: 'count' as const }] : []),
      ...keyWins.map(w => ({ label: 'Win', value: w })),
      ...keyGaps.map(g => ({ label: 'Gap', value: g })),
    ],
  });

  // ── 1b. Transparency Center creative activity ──────────────────────────────
  // Only rendered when transparency data is present (i.e. the scraper ran).
  if (transparency) {
    const hasCreatives = exampleAds.length > 0;
    const creativeLabel = hasCreatives
      ? `${exampleAds.length} ad creative${exampleAds.length !== 1 ? 's' : ''} retrieved`
      : adsDetected
        ? 'Ads detected — creative detail not yet available'
        : 'No ad creatives detected in Transparency Center';

    insights.push({
      id: 'ps-transparency',
      label: creativeLabel,
      title: 'Google Ads Transparency Center findings',
      status: adsDetected ? (hasCreatives ? 'positive' : 'neutral') : 'neutral',
      summary: adsDetected
        ? `This business was found in the Google Ads Transparency Center${transparency.advertiserName ? ` as "${transparency.advertiserName}"` : ''}. ${hasCreatives ? `${exampleAds.length} ad creative${exampleAds.length !== 1 ? 's' : ''} ${exampleAds.length !== 1 ? 'were' : 'was'} retrieved.` : 'Ad count was detected but creative content was not retrievable at this time.'}`
        : 'No active ads were found in the Google Ads Transparency Center for this business during the evidence gathering window.',
      whyItMatters: 'The Google Ads Transparency Center shows all active paid search and display ads running for a given advertiser. Detecting ad activity here confirms the business is actively spending on Google Ads, which signals both budget intent and a potential competitive threat for your agency\'s other clients.',
      recommendedImprovement: adsDetected && hasCreatives
        ? 'Review the example creatives to understand messaging, offers, and positioning. Gaps in their ad creative quality or landing page relevance are opportunities to highlight when positioning your agency\'s capabilities.'
        : adsDetected
          ? 'Trigger an evidence refresh to attempt creative retrieval. If creatives consistently fail to load, check the Google Ads Transparency Center manually using the business name or domain.'
          : 'If you suspect the business is running ads but they weren\'t detected, it\'s possible they are using a different advertiser name or domain. Try searching manually in the Transparency Center.',
      evidence: [
        { label: 'Source', value: 'Google Ads Transparency Center' },
        { label: 'Ads detected', value: adsDetected ? 'Yes' : 'No' },
        ...(recentAds && adsDetected ? [{ label: 'Recent activity', value: 'Yes' }] : []),
        ...(adCount != null ? [{ label: 'Ad count', value: String(adCount), type: 'count' as const }] : []),
        ...(transparency.regions?.length > 0 ? [{ label: 'Regions', value: transparency.regions.join(', ') }] : []),
        // Show up to 3 example ad headlines
        ...exampleAds.slice(0, 3).map((ad: any, i: number) => ({
          label: `Example ad ${i + 1}`,
          value: [ad.headline, ad.body].filter(Boolean).join(' — ') || 'Creative retrieved',
        })),
        ...(exampleAds.length > 3 ? [{ value: `+${exampleAds.length - 3} more creatives` }] : []),
      ],
      technicalDetails: [
        `Extraction strategy: ${transparency.extractionStrategy ?? 'unknown'}`,
        `Fetched at: ${transparency.fetchedAt}`,
        ...(transparency.parseWarnings?.length > 0 ? transparency.parseWarnings.map((w: string) => `Warning: ${w}`) : []),
      ],
    });
  }

  // ── 2. Overall impression share ───────────────────────────────────────────
  if (overallShare != null) {
    const lbl = _shareLabel(overallShare);
    insights.push({
      id: 'ps-overall-share',
      label: `Overall paid search share looks ${lbl}`,
      status: _shareStatus(overallShare),
      summary: `Across tracked keywords, this business captures approximately ${_pct(overallShare)} of available paid search impressions. ${
        lbl === 'strong'
          ? 'This is a competitive position — the business is winning a majority of relevant auction opportunities.'
          : lbl === 'modest'
            ? 'There is meaningful room to grow — more than half of available impressions are going to other advertisers.'
            : 'Most available impressions are being won by competitors. Budget constraints or bidding strategy likely need attention.'
      }`,
      whyItMatters: 'Impression share measures how often an ad appeared versus how often it was eligible to appear. Lost impression share represents leads that went to a competitor — often at the moment of highest purchase intent.',
      recommendedImprovement: overallShare < 0.65
        ? 'Review bidding strategy and Quality Score health. Improving ad relevance and landing page experience simultaneously reduces cost-per-click while lifting impression share.'
        : 'Protect top-performing terms with exact match and bid adjustments by device and hour. Monitor for competitor budget changes that could erode share.',
      evidence: [
        { label: 'Impression share', value: _pct(overallShare), type: 'count' },
        { label: 'Benchmark', value: overallShare >= 0.65 ? '≥ 65% — above competitive threshold' : overallShare >= 0.35 ? '35–65% — growth opportunity' : '< 35% — limited presence' },
      ],
    });
  }

  // ── 3. Brand keyword coverage ─────────────────────────────────────────────
  if (branded) {
    const brandedEntries = entries.filter((e: any) => e.isBranded === true);
    insights.push({
      id: 'ps-brand',
      label: `Brand keyword coverage is ${branded}`,
      title: 'Brand keyword performance',
      status: _strengthStatus(branded),
      summary: branded === 'strong'
        ? 'The business is appearing strongly for its own brand terms — protecting brand-aware searches from competitor conquest campaigns.'
        : branded === 'moderate'
          ? 'Brand keyword coverage is partial. Some brand-aware searches may be captured by competitors running conquest campaigns.'
          : "Brand keyword protection looks weak. Competitors may be actively bidding on this brand's name — intercepting traffic from customers who are already brand-aware.",
      whyItMatters: 'Branded keyword coverage is the highest-ROI form of paid search for most businesses — it protects the bottom of the funnel. When brand searches go unanswered by the brand itself, they are often won by a direct competitor.',
      recommendedImprovement: branded !== 'strong'
        ? 'Run a dedicated brand keyword campaign with exact match. Brand CPC is typically low and Quality Score is high — this is the most cost-efficient paid search investment available.'
        : 'Maintain brand protection with consistent top-of-page position. Monitor competitor activity on brand terms — if conquest campaigns appear, increase bids selectively.',
      evidence: [
        { label: 'Brand coverage', value: _cap(branded) },
        ...brandedEntries.slice(0, 4).map((e: any) => ({
          label: 'Brand keyword',
          value: `${e.keyword}${e.impressionShare != null ? ` — ${_pct(e.impressionShare)} share` : ''}`,
        })),
      ],
    });
  }

  // ── 4. Non-brand competitive position ────────────────────────────────────
  if (nonBrand) {
    const nbEntries = entries.filter((e: any) => e.isBranded !== true);

    // Aggregate competitor share across non-brand keywords
    const competitorMap: Record<string, number[]> = {};
    for (const e of nbEntries) {
      for (const c of (e.competitorImpressionShare ?? [])) {
        if (!competitorMap[c.domain]) competitorMap[c.domain] = [];
        competitorMap[c.domain].push(c.value);
      }
    }
    const topCompetitors = Object.entries(competitorMap)
      .map(([domain, vals]) => ({ domain, avg: vals.reduce((s, v) => s + v, 0) / vals.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);

    insights.push({
      id: 'ps-nonbrand',
      label: nonBrand === 'strong'
        ? 'Non-brand terms are well-covered'
        : nonBrand === 'moderate'
          ? 'Non-brand coverage is moderate'
          : 'Competitors are winning on non-brand terms',
      title: 'Non-brand competitive position',
      status: _strengthStatus(nonBrand),
      summary: nonBrand === 'strong'
        ? "The business has solid coverage of non-brand service terms — capturing category-level demand from prospects who aren't yet brand-aware."
        : nonBrand === 'moderate'
          ? 'Non-brand coverage is partial. Competitors are capturing a meaningful share of category-level service searches.'
          : "Competitors are dominating non-brand search impressions for service terms. The business risks being invisible to prospects at the top of the funnel.",
      whyItMatters: "Non-brand keywords represent the top of the acquisition funnel — customers searching for services without a preferred provider. Winning these searches builds the pipeline beyond brand-loyal traffic. Losing them consistently means ceding the category to competitors.",
      recommendedImprovement: nonBrand !== 'strong'
        ? 'Develop a structured service + location keyword strategy. Start with highest-value terms, then expand into longer-tail variations to improve impression share without exhausting budget.'
        : 'Monitor competitor bidding on non-brand terms. Landing page relevance and ad copy differentiation become the key lever for maintaining share without proportional bid increases.',
      evidence: [
        { label: 'Non-brand performance', value: _cap(nonBrand) },
        { label: 'Non-brand keywords', value: String(nbEntries.length), type: 'count' as const },
        ...topCompetitors.map(c => ({
          label: 'Competitor',
          value: `${c.domain} — ${_pct(c.avg)} avg share`,
        })),
      ],
    });
  }

  // ── 5. Top-of-page presence ───────────────────────────────────────────────
  if (topOfPage != null) {
    const isConsistent = topOfPage >= 0.6;
    insights.push({
      id: 'ps-top-of-page',
      label: isConsistent ? 'Top-of-page presence is consistent' : 'Top-of-page presence is inconsistent',
      status: isConsistent ? 'positive' : 'warning',
      summary: `Ads appear in the top positions on the page approximately ${_pct(topOfPage)} of the time. ${
        isConsistent
          ? 'This indicates consistent top-placement performance — where click-through rates are highest.'
          : 'Many eligible impressions are appearing in lower positions where visibility and click-through rates drop significantly.'
      }`,
      whyItMatters: "Top-of-page placements generate substantially higher click-through rates than below-the-fold ads. A low top-of-page rate means spend is going to impressions with limited commercial value.",
      recommendedImprovement: !isConsistent
        ? 'Review Quality Scores for underperforming keywords — improving ad relevance and landing page experience lifts top-of-page rate without necessarily increasing bids.'
        : 'Maintain Quality Score health through regular ad copy testing. Protect top positions on highest-converting terms with bid adjustments for high-value time windows and devices.',
      evidence: [
        { label: 'Top-of-page rate', value: _pct(topOfPage), type: 'count' as const },
        { label: 'Benchmark', value: isConsistent ? '≥ 60% — consistent top placement' : '< 60% — inconsistent — below-fold impressions dominant' },
      ],
    });
  }

  // ── 6. Keyword-level breakdown ────────────────────────────────────────────
  if (entries.length > 0) {
    const withPressure = entries
      .filter((e: any) => (e.competitorImpressionShare?.length ?? 0) > 0)
      .map((e: any) => {
        const top = [...(e.competitorImpressionShare ?? [])].sort((a: any, b: any) => b.value - a.value)[0];
        return { ...e, topComp: top };
      })
      .sort((a: any, b: any) => (b.topComp?.value ?? 0) - (a.topComp?.value ?? 0));

    insights.push({
      id: 'ps-keywords',
      label: `${entries.length} keyword${entries.length !== 1 ? 's' : ''} tracked — view breakdown`,
      title: 'Keyword-level paid search breakdown',
      status: 'neutral',
      summary: `${entries.length} keyword${entries.length !== 1 ? 's are' : ' is'} being tracked in paid search. The breakdown below shows impression share and competitive pressure at the individual keyword level.`,
      whyItMatters: 'Keyword-level data pinpoints exactly where paid spend is efficient and where competitors are winning. It enables precise decisions: where to increase budget, which terms to cut, and which gaps in competitor coverage to exploit.',
      recommendedImprovement: 'Focus budget on keywords with high commercial intent and manageable competition. Keywords with impression share below 40% should be assessed — increase bids, improve Quality Score, or reallocate to better-performing terms.',
      evidence: [
        { label: 'Keywords tracked', value: String(entries.length), type: 'count' as const },
        ...entries.slice(0, 8).map((e: any) => ({
          label: e.keyword,
          value: [
            e.impressionShare != null ? `${_pct(e.impressionShare)} share` : null,
            e.topOfPageRate   != null ? `${_pct(e.topOfPageRate)} top-of-page` : null,
          ].filter(Boolean).join(' · ') || 'No data',
        })),
        ...(entries.length > 8 ? [{ value: `+${entries.length - 8} more keywords` }] : []),
        ...(withPressure.length > 0 ? [{
          label: 'Highest competitor pressure',
          value: `${withPressure[0].keyword} — ${withPressure[0].topComp?.domain} at ${_pct(withPressure[0].topComp?.value ?? 0)}`,
        }] : []),
      ],
      technicalDetails: entries.map((e: any) => {
        const cs = (e.competitorImpressionShare ?? []).map((c: any) => `${c.domain}:${_pct(c.value)}`).join(', ');
        const ct = (e.competitorTopOfPageRate  ?? []).map((c: any) => `${c.domain}:${_pct(c.value)}`).join(', ');
        return [
          e.keyword,
          `IS:${e.impressionShare != null ? _pct(e.impressionShare) : 'n/a'}`,
          `ToP:${e.topOfPageRate  != null ? _pct(e.topOfPageRate)  : 'n/a'}`,
          cs ? `CompIS:[${cs}]` : null,
          ct ? `CompToP:[${ct}]` : null,
        ].filter(Boolean).join(' | ');
      }),
    });
  }

  return insights;
}

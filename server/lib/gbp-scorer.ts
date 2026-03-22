// ── GBP branch-aware candidate scorer ────────────────────────────────────
// Google's Places API returns results ordered by "prominence" — meaning the
// busiest or most widely-known branch wins by default. For multi-location
// businesses (e.g. "First Parking" with 8 CBD car parks) this is almost
// always the wrong result: the lead record refers to ONE specific branch,
// and we must match it to the right GBP listing before we surface ratings,
// reviews, or health signals. We therefore score every returned candidate
// against the lead's suburb, phone, and domain, and pick the highest scorer.
//
// Signal weights (intentionally generous on suburb + phone because those
// two signals are the strongest branch-level identifiers):
//   name exact match      40 pts
//   name contains/contained 30 pts
//   name word-overlap     0–20 pts (proportional)
//   suburb in address     25 pts  ← primary multi-branch discriminator
//   city in address       20 pts  ← fallback when suburb not on lead
//   state in address      10 pts  ← tiebreaker
//   phone last-8 match    20 pts  ← strongest branch-exact signal
//   website domain match  15 pts  ← same business unit (shares domain)
//
// Returns the score AND a human-readable reasons[] array so we can log
// exactly why a candidate was chosen, making future branch-selection
// issues easy to diagnose without re-running the full flow.

export interface GbpLeadContext {
  nameLower:  string;
  leadSuburb: string;
  leadCity:   string;
  leadState:  string;
  leadPhone:  string; // digits only
  leadDomain: string;
}

export interface GbpScoreResult {
  score:   number;
  reasons: string[];
}

export function scoreGbpCandidate(place: any, ctx: GbpLeadContext): GbpScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const pName  = (place.displayName?.text || '').toLowerCase();
  const pAddr  = (place.formattedAddress  || '').toLowerCase();
  const pPhone = (place.nationalPhoneNumber || '').replace(/\D/g, '');
  const pDomain = (() => {
    try { return place.websiteUri ? new URL(place.websiteUri).hostname.replace(/^www\./, '') : ''; }
    catch { return ''; }
  })();

  // Name match (0–40 pts)
  if (pName === ctx.nameLower) {
    score += 40; reasons.push('exact-name(+40)');
  } else if (pName.includes(ctx.nameLower) || ctx.nameLower.includes(pName)) {
    score += 30; reasons.push('partial-name(+30)');
  } else {
    const words   = ctx.nameLower.split(/\s+/).filter(w => w.length > 2);
    const matched = words.filter(w => pName.includes(w));
    const pts     = Math.round((matched.length / Math.max(words.length, 1)) * 20);
    if (pts > 0) { score += pts; reasons.push(`word-overlap(+${pts})`); }
  }

  // Suburb / locality match (0–25 pts) — key discriminator for multi-branch
  if (ctx.leadSuburb && pAddr.includes(ctx.leadSuburb)) {
    score += 25; reasons.push('suburb-match(+25)');
  } else if (ctx.leadCity && pAddr.includes(ctx.leadCity)) {
    score += 20; reasons.push('city-match(+20)');
  }

  // State match (0–10 pts)
  if (ctx.leadState && pAddr.includes(ctx.leadState)) {
    score += 10; reasons.push('state-match(+10)');
  }

  // Phone match (0–20 pts — strongest branch-exact signal)
  if (ctx.leadPhone.length >= 8 && pPhone.length >= 8 &&
      (pPhone.endsWith(ctx.leadPhone.slice(-8)) || ctx.leadPhone.endsWith(pPhone.slice(-8)))) {
    score += 20; reasons.push('phone-match(+20)');
  }

  // Website domain match (0–15 pts)
  if (ctx.leadDomain && pDomain && ctx.leadDomain === pDomain) {
    score += 15; reasons.push('domain-match(+15)');
  }

  return { score, reasons };
}

// Convenience: build a GbpLeadContext from a raw lead record (handles null-safety).
export function buildLeadContext(lead: {
  businessName?: string; companyName?: string; contactName?: string;
  suburb?: string; city?: string; state?: string;
  phone?: string; website?: string;
}): GbpLeadContext {
  return {
    nameLower:  (lead.businessName || lead.companyName || lead.contactName || '').toLowerCase(),
    leadSuburb: (lead.suburb || '').toLowerCase().trim(),
    leadCity:   (lead.city   || '').toLowerCase().trim(),
    leadState:  (lead.state  || '').toLowerCase().trim(),
    leadPhone:  (lead.phone  || '').replace(/\D/g, ''),
    leadDomain: (() => {
      try { return lead.website ? new URL(lead.website).hostname.replace(/^www\./, '') : ''; }
      catch { return ''; }
    })(),
  };
}

// ── Sibling brand scorer ──────────────────────────────────────────────────
// Used in the second-pass brand expansion: determines whether a Places API
// result is a plausible additional location for the same brand (e.g. another
// car park belonging to "First Parking"). Unlike the primary scorer, this one
// intentionally ignores location signals (suburb/city/phone) because sibling
// locations WILL have different addresses by definition. Instead it focuses
// on brand-name overlap and website domain — the two signals that indicate
// "same company, different branch".
//
// Confidence thresholds:
//   ≥ 50 pts → high confidence (domain match OR strong name overlap)
//   30–49    → moderate confidence (meaningful brand-word overlap)
//   < 30     → excluded — too much risk of false positives

export interface GbpSiblingScore {
  confidence: number;  // 0–100
  relation: 'brand-match' | 'domain-match' | 'name-match';
  reasons: string[];
}

export function scoreGbpSibling(
  place: any,
  ctx: GbpLeadContext,
  primaryPlaceId: string | null,
): GbpSiblingScore | null {
  // Never include the primary location as its own sibling
  if (place.id && place.id === primaryPlaceId) return null;
  // Skip permanently closed listings — they're not operational locations
  if (place.businessStatus === 'CLOSED_PERMANENTLY') return null;

  let confidence = 0;
  const reasons: string[] = [];
  let relation: GbpSiblingScore['relation'] = 'name-match';

  const pName = (place.displayName?.text || '').toLowerCase();
  const pDomain = (() => {
    try { return place.websiteUri ? new URL(place.websiteUri).hostname.replace(/^www\./, '') : ''; }
    catch { return ''; }
  })();

  // ── Domain match (strongest sibling signal — same website, different location) ──
  if (ctx.leadDomain && pDomain && ctx.leadDomain === pDomain) {
    confidence += 50;
    relation = 'domain-match';
    reasons.push('same-domain(+50)');
  }

  // ── Brand name word overlap ────────────────────────────────────────────────
  // Require words with ≥ 3 chars to exclude filler words (of, the, a, etc.)
  const brandWords = ctx.nameLower.split(/\s+/).filter(w => w.length >= 3);
  if (brandWords.length > 0) {
    const matchedWords = brandWords.filter(w => pName.includes(w));
    const ratio = matchedWords.length / brandWords.length;
    const pts = Math.round(ratio * 40);
    if (pts >= 16) {  // At least ~40% brand-word overlap
      confidence += pts;
      if (relation === 'name-match') relation = 'brand-match';
      reasons.push(`brand-words(+${pts})`);
    }
  }

  // Minimum confidence gate — exclude weak matches to avoid false positives
  if (confidence < 30) return null;

  return { confidence, relation, reasons };
}

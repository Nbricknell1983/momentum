// Deterministic fixture-based validation for the GBP branch-aware scorer.
// Run with:  npx tsx server/__tests__/gbp-scoring.test.ts
//
// No test framework required — passes exit(0) on success, exit(1) on failure.
// Safe to run in any environment: zero network calls, zero DB access.

import { scoreGbpCandidate, buildLeadContext } from "../lib/gbp-scorer";

// ── Minimal assertion helper ───────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ ${description}${detail ? `\n      ${detail}` : ''}`);
    failed++;
  }
}

function suite(name: string, fn: () => void): void {
  console.log(`\n▸ ${name}`);
  fn();
}

// ── Fixtures ──────────────────────────────────────────────────────────────

// Represents two GBP listings for the same chain — Google ranks the CBD/busiest
// branch first (high prominence) but the lead is for the South Brisbane branch.
const firstParkingCbd: any = {
  displayName:         { text: 'First Parking Brisbane CBD' },
  formattedAddress:    '123 Queen St, Brisbane City QLD 4000, Australia',
  nationalPhoneNumber: '(07) 3000 1111',
  websiteUri:          'https://www.firstparking.com.au/',
};

const firstParkingSouthBrisbane: any = {
  displayName:         { text: 'First Parking South Brisbane' },
  formattedAddress:    '45 Grey St, South Brisbane QLD 4101, Australia',
  nationalPhoneNumber: '(07) 3000 2222',
  websiteUri:          'https://www.firstparking.com.au/',
};

const leadSouthBrisbane = {
  companyName: 'First Parking',
  suburb:      'south brisbane',
  city:        'brisbane',
  state:       'qld',
  phone:       '(07) 3000 2222', // matches South Brisbane branch
  website:     'https://www.firstparking.com.au/',
};

// ── Test suite 1: Multi-location suburb + phone discrimination ─────────────

suite('Multi-location business — suburb + phone match picks correct branch', () => {
  const ctx = buildLeadContext(leadSouthBrisbane);

  const cbdResult   = scoreGbpCandidate(firstParkingCbd, ctx);
  const southResult = scoreGbpCandidate(firstParkingSouthBrisbane, ctx);

  assert(
    'South Brisbane branch scores higher than CBD branch',
    southResult.score > cbdResult.score,
    `South=${southResult.score} CBD=${cbdResult.score}`
  );

  assert(
    'South Brisbane branch includes suburb-match reason',
    southResult.reasons.some(r => r.startsWith('suburb-match')),
    `reasons: [${southResult.reasons.join(', ')}]`
  );

  assert(
    'South Brisbane branch includes phone-match reason',
    southResult.reasons.some(r => r.startsWith('phone-match')),
    `reasons: [${southResult.reasons.join(', ')}]`
  );

  assert(
    'CBD branch does NOT get suburb-match',
    !cbdResult.reasons.some(r => r.startsWith('suburb-match')),
    `reasons: [${cbdResult.reasons.join(', ')}]`
  );

  assert(
    'CBD branch does NOT get phone-match',
    !cbdResult.reasons.some(r => r.startsWith('phone-match')),
    `reasons: [${cbdResult.reasons.join(', ')}]`
  );

  assert(
    'Both branches get domain-match (shared website)',
    southResult.reasons.some(r => r.startsWith('domain-match')) &&
    cbdResult.reasons.some(r => r.startsWith('domain-match')),
    `south reasons: [${southResult.reasons.join(', ')}]  cbd reasons: [${cbdResult.reasons.join(', ')}]`
  );
});

// ── Test suite 2: Exact name match scores highest single signal ────────────

suite('Exact name match awards full 40 pts', () => {
  const ctx = buildLeadContext({ companyName: 'Jim\'s Mowing', suburb: '', city: '', state: '', phone: '', website: '' });
  const exact: any = {
    displayName:      { text: 'Jim\'s Mowing' },
    formattedAddress: '1 Main Rd, Anywhere VIC 3000',
  };
  const partial: any = {
    displayName:      { text: 'Jim\'s Mowing Frankston' },
    formattedAddress: '2 High St, Frankston VIC 3199',
  };
  const r1 = scoreGbpCandidate(exact, ctx);
  const r2 = scoreGbpCandidate(partial, ctx);

  assert('Exact name gets exact-name(+40) reason', r1.reasons.includes('exact-name(+40)'));
  assert('Partial name gets partial-name(+30) reason', r2.reasons.includes('partial-name(+30)'));
  assert('Exact name score > partial name score', r1.score > r2.score,
    `exact=${r1.score} partial=${r2.score}`);
});

// ── Test suite 3: Phone-only match picks correct branch (no suburb) ────────

suite('Phone match alone distinguishes branches when suburb is missing', () => {
  const leadNoSuburb = { companyName: 'Ace Plumbing', suburb: '', city: '', state: '', phone: '0412345678', website: '' };
  const ctx = buildLeadContext(leadNoSuburb);

  const correctBranch: any = {
    displayName:         { text: 'Ace Plumbing' },
    formattedAddress:    '10 Trade St, Malvern VIC 3144',
    nationalPhoneNumber: '0412 345 678',
  };
  const wrongBranch: any = {
    displayName:         { text: 'Ace Plumbing' },
    formattedAddress:    '22 Factory Rd, Dandenong VIC 3175',
    nationalPhoneNumber: '0499 000 000',
  };

  const correct = scoreGbpCandidate(correctBranch, ctx);
  const wrong   = scoreGbpCandidate(wrongBranch, ctx);

  assert('Correct branch gets phone-match reason', correct.reasons.some(r => r.startsWith('phone-match')));
  assert('Wrong branch does NOT get phone-match reason', !wrong.reasons.some(r => r.startsWith('phone-match')));
  assert('Correct branch scores higher', correct.score > wrong.score,
    `correct=${correct.score} wrong=${wrong.score}`);
});

// ── Test suite 4: Unified sitemap status logic ─────────────────────────────
// This validates the derived boolean that replaces the raw hasSitemap check.
// The logic itself is simple enough to test with plain conditionals — the
// important thing is that it correctly handles all four combinations.

suite('Unified sitemap status — four input combinations', () => {
  type SitemapInputs = { hasSitemap: boolean; sitemapPagesCount: number };

  // Mirror the logic from PrepCallPackCard / DealLiveActivityFeed
  function hasSitemapData({ hasSitemap, sitemapPagesCount }: SitemapInputs): boolean {
    return !!(hasSitemap || sitemapPagesCount > 0);
  }

  function filterSitemapGaps(gaps: string[], inputs: SitemapInputs): string[] {
    return hasSitemapData(inputs)
      ? gaps.filter(g => !g.toLowerCase().includes('sitemap'))
      : gaps;
  }

  const sitemapGap = 'No sitemap detected';
  const otherGap   = 'No phone number visible';

  assert(
    'hasSitemapData=true when hasSitemap=true and pages=0',
    hasSitemapData({ hasSitemap: true, sitemapPagesCount: 0 })
  );
  assert(
    'hasSitemapData=true when hasSitemap=false and pages=17',
    hasSitemapData({ hasSitemap: false, sitemapPagesCount: 17 })
  );
  assert(
    'hasSitemapData=true when hasSitemap=true and pages=17',
    hasSitemapData({ hasSitemap: true, sitemapPagesCount: 17 })
  );
  assert(
    'hasSitemapData=false when hasSitemap=false and pages=0',
    !hasSitemapData({ hasSitemap: false, sitemapPagesCount: 0 })
  );

  // Gap filtering
  const inputs17Pages = { hasSitemap: false, sitemapPagesCount: 17 };
  const filtered = filterSitemapGaps([sitemapGap, otherGap], inputs17Pages);
  assert(
    'Sitemap gap suppressed when 17 pages scanned (hasSitemap=false)',
    !filtered.includes(sitemapGap),
    `filtered: [${filtered.join(', ')}]`
  );
  assert(
    'Non-sitemap gap preserved when filtering',
    filtered.includes(otherGap),
    `filtered: [${filtered.join(', ')}]`
  );

  const inputsNoSitemap = { hasSitemap: false, sitemapPagesCount: 0 };
  const unfiltered = filterSitemapGaps([sitemapGap, otherGap], inputsNoSitemap);
  assert(
    'Sitemap gap shown when no sitemap data at all',
    unfiltered.includes(sitemapGap)
  );

  // Also validate the chip label choices (mirrors PrepCallPackCard logic)
  function chipLabel(inputs: SitemapInputs): string {
    if (!hasSitemapData(inputs)) return 'No sitemap';
    if (inputs.hasSitemap) return 'Sitemap ✓';
    return `${inputs.sitemapPagesCount} pages found`;
  }

  assert('Chip label: Sitemap ✓ when raw check passes', chipLabel({ hasSitemap: true, sitemapPagesCount: 0 }) === 'Sitemap ✓');
  assert('Chip label: N pages found when scanned but no /sitemap.xml', chipLabel({ hasSitemap: false, sitemapPagesCount: 17 }) === '17 pages found');
  assert('Chip label: No sitemap when neither source has data', chipLabel({ hasSitemap: false, sitemapPagesCount: 0 }) === 'No sitemap');
});

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

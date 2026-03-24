// =============================================================================
// VISIBILITY OS — CONSTANTS AND LOOKUP TABLES
// =============================================================================
// All numeric weights, cron schedules, enums-as-objects, and lookup tables.
// Changing weights here changes BattleScore computation everywhere.
// =============================================================================

import type {
  ConversionArchetype, BrandTone, ArchetypeProfile, ComponentType,
  AutonomyMode, BottleneckType, ClientJourneyStage, MomentumStage,
  NextBestActionType, ObjectionCategory,
} from './types';

// ─── BattleScore weights (must sum to 100) ────────────────────────────────────

export const BATTLESCORE_WEIGHTS = {
  mapsPackRank:     30,
  organicRank:      25,
  gbpCompleteness:  20,
  siteQuality:      15,
  contentCoverage:  10,
} as const satisfies Record<string, number>;

// ─── GBP completeness dimension weights (must sum to 100) ────────────────────

export const GBP_COMPLETENESS_WEIGHTS = {
  name:              5,
  phone:             10,
  address:           10,
  website:           10,
  hours:             10,
  description:       10,   // >250 chars = full score
  primaryCategory:   10,
  services:          15,   // ≥5 services = full score
  photos:            10,   // ≥10 photos = full score
  recentPhotos:      5,    // ≥1 photo in last 30d
  questionsAnswered: 5,    // all questions answered
} as const satisfies Record<string, number>;

// ─── Site quality scoring weights (must sum to 100) ───────────────────────────

export const SITE_QUALITY_WEIGHTS = {
  mobileOptimised:   25,
  loadTimeMs:        20,   // < 3000ms = full score
  hasSchema:         15,
  hasCtaAboveFold:   15,
  hasPhone:          15,
  hasSitemap:        5,
  hasRobots:         5,
} as const satisfies Record<string, number>;

// ─── Content coverage scoring ─────────────────────────────────────────────────

// Score = (pages present / pages required) × 100
// Required pages determined from GBP service + service area count

export const CONTENT_COVERAGE_THRESHOLDS = {
  servicePageMin: 1,          // at least 1 service page required
  locationPageMin: 1,         // at least 1 location page required
  wordCountMinService: 400,   // below this = half credit for that page
  wordCountTargetService: 800,
  wordCountMinLocation: 300,
  wordCountTargetLocation: 500,
} as const;

// ─── Maps Pack position scoring ───────────────────────────────────────────────

export const MAPS_PACK_SCORE_TABLE: Record<number | string, number> = {
  1:  30,
  2:  24,
  3:  18,
  4:  12,
  5:  8,
  6:  5,
  7:  3,
  8:  2,
  9:  1,
  10: 0,
  absent: 0,
};

// ─── Organic rank scoring ─────────────────────────────────────────────────────

export const ORGANIC_SCORE_TABLE: Record<number | string, number> = {
  1:  25,
  2:  20,
  3:  16,
  4:  12,
  5:  9,
  6:  7,
  7:  5,
  8:  3,
  9:  2,
  10: 1,
  absent: 0,
};

// ─── Drop-off thresholds ──────────────────────────────────────────────────────
// These trigger BottleneckType classification in the interpretation layer.

export const DROP_OFF_THRESHOLDS = {
  discovery: {
    visibilityRateMin: 20,           // %
    invisibleGridPointsMax: 3,
  },
  first_impression: {
    organicCTRMin: 3,                // %
    gbpEngagementRateMin: 2,         // %
    ratingMin: 4.2,
    photosLast60DaysMin: 1,
  },
  landing: {
    bounceRateMax: 65,               // %
    lcpMax: 3500,                    // ms
  },
  consideration: {
    pagesPerSessionMin: 2,
    servicePageVisitRateMin: 30,     // % of sessions visiting a service page
  },
  conversion: {
    conversionRateMin: 1,            // %
    formFieldMax: 4,
  },
  post_conversion: {
    reviewVelocityMin: 1,            // reviews per month
    ownerResponseRateMin: 50,        // %
  },
} as const;

// ─── Bottleneck classification mapping ────────────────────────────────────────

export const STAGE_TO_BOTTLENECK: Record<ClientJourneyStage, BottleneckType> = {
  discovery:        'INVISIBLE',
  first_impression: 'POOR_IMPRESSION',
  landing:          'TRUST_FAILURE',
  consideration:    'SHALLOW_CONTENT',
  conversion:       'CONVERSION_BLOCKED',
  post_conversion:  'NO_AUTHORITY',
};

export const BOTTLENECK_LABELS: Record<BottleneckType, string> = {
  INVISIBLE:           'Not visible in search',
  POOR_IMPRESSION:     'Visible but not clicked',
  TRUST_FAILURE:       'Clicks but bouncing',
  SHALLOW_CONTENT:     'Engaged but not going deeper',
  CONVERSION_BLOCKED:  'Interested but not converting',
  NO_AUTHORITY:        'Converting but not compounding',
};

// ─── Archetype profiles ───────────────────────────────────────────────────────

export const ARCHETYPE_PROFILES: Record<ConversionArchetype, ArchetypeProfile> = {
  EMERGENCY_SERVICE: {
    archetype:       'EMERGENCY_SERVICE',
    tone:            'urgent',
    primaryCta:      'Call Now — Available 24/7',
    ctaStrategy:     'call_dominant',
    stickyPhone:     true,
    maxCtasPerPage:  6,
    defaultSectionOrder: [
      'NAV', 'HERO', 'TRUST_BAR', 'SERVICES', 'CTA_SECTION',
      'TESTIMONIALS', 'FAQ', 'LOCATION_BLOCK', 'FORM', 'FOOTER',
    ],
    trustPriority: [
      'response_time', 'availability_24_7', 'licensed_insured',
      'google_rating', 'years_in_business',
    ],
  },
  TRADES_LEAD_GEN: {
    archetype:       'TRADES_LEAD_GEN',
    tone:            'trade',
    primaryCta:      'Get a Free Quote',
    ctaStrategy:     'form_lead',
    stickyPhone:     true,
    maxCtasPerPage:  4,
    defaultSectionOrder: [
      'NAV', 'HERO', 'SERVICES', 'TRUST_BAR', 'TESTIMONIALS',
      'PROCESS', 'CTA_SECTION', 'GALLERY', 'LOCATION_BLOCK', 'FAQ', 'FOOTER',
    ],
    trustPriority: [
      'google_rating', 'years_in_business', 'jobs_completed',
      'licence_number', 'before_after_photos',
    ],
  },
  PREMIUM_SERVICE: {
    archetype:       'PREMIUM_SERVICE',
    tone:            'authority',
    primaryCta:      'Book a Consultation',
    ctaStrategy:     'consultation',
    stickyPhone:     false,
    maxCtasPerPage:  2,
    defaultSectionOrder: [
      'NAV', 'HERO', 'ABOUT', 'GALLERY', 'SERVICES',
      'PROCESS', 'TESTIMONIALS', 'AUTHORITY', 'CTA_SECTION', 'FOOTER',
    ],
    trustPriority: [
      'portfolio_quality', 'named_testimonials', 'credentials_awards',
      'years_specialising', 'press_mentions',
    ],
  },
  BOOKING_BASED: {
    archetype:       'BOOKING_BASED',
    tone:            'trust_first',
    primaryCta:      'Book Now',
    ctaStrategy:     'booking',
    stickyPhone:     true,
    maxCtasPerPage:  4,
    defaultSectionOrder: [
      'NAV', 'HERO', 'SERVICES', 'PROCESS', 'TESTIMONIALS',
      'FORM', 'LOCATION_BLOCK', 'FAQ', 'FOOTER',
    ],
    trustPriority: [
      'star_rating_count', 'insurance_check_badges', 'satisfaction_guarantee',
      'price_transparency', 'before_after_photos',
    ],
  },
  QUOTE_BASED: {
    archetype:       'QUOTE_BASED',
    tone:            'trade',
    primaryCta:      'Get Your Free Quote',
    ctaStrategy:     'quote',
    stickyPhone:     true,
    maxCtasPerPage:  4,
    defaultSectionOrder: [
      'NAV', 'HERO', 'TRUST_BAR', 'SERVICES', 'GALLERY',
      'PROCESS', 'TESTIMONIALS', 'LOCATION_BLOCK', 'FORM', 'FAQ', 'FOOTER',
    ],
    trustPriority: [
      'projects_completed', 'years_in_business', 'licensed_insured',
      'google_rating', 'project_gallery',
    ],
  },
};

// ─── Tone defaults ────────────────────────────────────────────────────────────

export const TONE_TYPOGRAPHY: Record<BrandTone, {
  fontHeading: string;
  fontBody: string;
  weightBody: number;
  weightBold: number;
  borderRadius: string;
  cardStyle: 'flat' | 'elevated' | 'bordered';
}> = {
  authority: {
    fontHeading:  "'Playfair Display', Georgia, serif",
    fontBody:     "'Inter', 'DM Sans', system-ui, sans-serif",
    weightBody:   400,
    weightBold:   700,
    borderRadius: '4px',
    cardStyle:    'bordered',
  },
  trade: {
    fontHeading:  "'Montserrat', 'Barlow Condensed', system-ui, sans-serif",
    fontBody:     "'Open Sans', 'Source Sans 3', system-ui, sans-serif",
    weightBody:   400,
    weightBold:   800,
    borderRadius: '6px',
    cardStyle:    'elevated',
  },
  urgent: {
    fontHeading:  "'Oswald', 'Barlow Condensed', system-ui, sans-serif",
    fontBody:     "'Roboto', 'Inter', system-ui, sans-serif",
    weightBody:   400,
    weightBold:   900,
    borderRadius: '4px',
    cardStyle:    'flat',
  },
  trust_first: {
    fontHeading:  "'Nunito Sans', 'Poppins', system-ui, sans-serif",
    fontBody:     "'Lato', 'Open Sans', system-ui, sans-serif",
    weightBody:   400,
    weightBold:   700,
    borderRadius: '12px',
    cardStyle:    'elevated',
  },
};

// ─── CTA phrase banks ─────────────────────────────────────────────────────────

export const CTA_PHRASES: Record<ConversionArchetype, string[]> = {
  EMERGENCY_SERVICE: [
    "Call Now — We're Ready",
    'Get Help Now',
    'Available Right Now — Call Us',
    'Emergency? Call Now',
    "We're On Our Way",
  ],
  TRADES_LEAD_GEN: [
    'Get Your Free Quote',
    'Request a Quote Today',
    'Book a Free Measure & Quote',
    'Get Started — Free Quote',
    'Claim Your Free Quote',
  ],
  PREMIUM_SERVICE: [
    'Book a Consultation',
    'Start Your Project',
    'Request a Meeting',
    'Discuss Your Project',
    'Begin Your Journey',
  ],
  BOOKING_BASED: [
    'Book Now',
    'Check Availability',
    'Book Your Appointment',
    'Get an Instant Quote',
    'Reserve Your Slot',
  ],
  QUOTE_BASED: [
    'Get Your Free Quote',
    'Request a Site Visit',
    'Get a Quote in 24 Hours',
    'Start with a Free Quote',
    'Request Your Quote',
  ],
};

// ─── H1 structure patterns ────────────────────────────────────────────────────

export type H1Pattern =
  | 'SERVICE_LOCATION'        // "[Service] in [City]"
  | 'DIFFERENTIATOR_FIRST'    // "[Differentiator] [Service] in [City]"
  | 'OUTCOME_LED'             // "[Outcome] with [Service] in [City]"
  | 'QUESTION_FORM'           // "Looking for [Service] in [City]?"
  | 'URGENCY_LED';            // "24/7 [Service] — [City] — Call Now"

export const H1_PATTERNS: Record<H1Pattern, string> = {
  SERVICE_LOCATION:      '{service} in {city}',
  DIFFERENTIATOR_FIRST:  '{differentiator} {service} in {city}',
  OUTCOME_LED:           '{outcome} with {service} in {city}',
  QUESTION_FORM:         'Looking for {service} in {city}?',
  URGENCY_LED:           '24/7 {service} — {city} — Call Now',
};

// ─── Schema type selection ────────────────────────────────────────────────────

export const ARCHETYPE_SCHEMA_SUBTYPE: Record<ConversionArchetype, string> = {
  EMERGENCY_SERVICE: 'HomeAndConstructionBusiness',
  TRADES_LEAD_GEN:   'HomeAndConstructionBusiness',
  PREMIUM_SERVICE:   'ProfessionalService',
  BOOKING_BASED:     'LocalBusiness',
  QUOTE_BASED:       'GeneralContractor',
};

// ─── Sitemap priority by page type ───────────────────────────────────────────

export const SITEMAP_PRIORITY: Record<string, number> = {
  home:       1.0,
  service:    0.9,
  location:   0.8,
  authority:  0.7,
  supporting: 0.5,
  about:      0.4,
  contact:    0.4,
};

// ─── Momentum journey: stage order (for transition validation) ────────────────

export const MOMENTUM_STAGE_ORDER: MomentumStage[] = [
  'DISCOVERY',
  'AWARENESS',
  'PROBLEM_REALISATION',
  'SOLUTION_FRAMING',
  'TRUST_AND_CERTAINTY',
  'DECISION',
  'ONBOARDING',
  'WON',
  'LOST',
];

// ─── Cold alert thresholds (days of inactivity per stage) ────────────────────

export const COLD_ALERT_DAYS: Record<MomentumStage, number> = {
  DISCOVERY:            7,
  AWARENESS:            3,
  PROBLEM_REALISATION:  3,
  SOLUTION_FRAMING:     3,
  TRUST_AND_CERTAINTY:  5,
  DECISION:             5,
  ONBOARDING:           2,
  WON:                  999,   // not applicable
  LOST:                 999,   // not applicable
};

// ─── Follow-up sequence lengths per stage ────────────────────────────────────

export const FOLLOW_UP_SEQUENCE_COUNT: Partial<Record<MomentumStage, number>> = {
  SOLUTION_FRAMING:     4,
  TRUST_AND_CERTAINTY:  3,
  DECISION:             3,
};

// ─── Objection category labels ────────────────────────────────────────────────

export const OBJECTION_LABELS: Record<ObjectionCategory, string> = {
  TIMING:                   'Not the right time',
  BUDGET:                   'Budget concern',
  TRUST:                    'Trust / credibility',
  COMPETITOR_COMPARISON:    'Comparing with another agency',
  INTERNAL_APPROVAL:        'Needs internal sign-off',
  NOT_CONVINCED_IT_WORKS:   'Sceptical about results',
  ALREADY_DOING_IT:         'Already has a solution',
};

// ─── NBA type labels ──────────────────────────────────────────────────────────

export const NBA_LABELS: Record<NextBestActionType, string> = {
  call:                    'Make a call',
  email:                   'Send an email',
  send_gap_report:         'Send gap report',
  send_competitor_matrix:  'Send competitor matrix',
  send_proposal:           'Send proposal',
  send_decision_brief:     'Send decision brief',
  follow_up:               'Send follow-up',
  close:                   'Close the deal',
  re_engage:               'Re-engage (cold lead)',
  book_discovery:          'Book discovery call',
};

// ─── Default visibility config ────────────────────────────────────────────────

export const DEFAULT_VISIBILITY_CONFIG = {
  defaultAutopilotMode: 'review' as AutonomyMode,
  sensorSchedules: {
    rankGrid:        '0 3 * * *',        // daily at 3am
    gbpHealth:       '0 4 * * 1',        // weekly Monday 4am
    serpSnapshot:    '0 3 * * *',        // daily at 3am
    siteCrawl:       '0 5 * * 1',        // weekly Monday 5am
    gscSnapshot:     '0 6 * * *',        // daily at 6am (skipped if no GSC)
    competitorCrawl: '0 5 * * 3',        // weekly Wednesday 5am
  },
  battleScoreWeights: { ...BATTLESCORE_WEIGHTS },
  trackedKeywords:    [] as string[],
  trackedCompetitors: [] as string[],
} as const;

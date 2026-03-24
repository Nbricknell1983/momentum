// =============================================================================
// VISIBILITY OS — TYPE DEFINITIONS
// =============================================================================
// All Firestore documents for the Visibility Operating System.
// Multi-tenant: every document lives under orgs/{orgId}/...
// Timestamps: ISO 8601 strings throughout (matches project convention).
// No runtime logic here — pure interfaces and union types only.
// =============================================================================

// ─── Shared primitives ────────────────────────────────────────────────────────

export type ISOTimestamp = string;

export type SensorType =
  | 'rank_grid'       // Local Falcon grid scan
  | 'gbp_health'      // Google Places API GBP audit
  | 'serp_snapshot'   // SerpApi organic + PAA snapshot
  | 'site_crawl'      // Internal website crawler
  | 'gsc_snapshot'    // Google Search Console (requires setup — see BLOCKERS)
  | 'ga4_snapshot'    // Google Analytics 4 (requires setup — see BLOCKERS)
  | 'competitor_crawl'; // Crawl top 3 competitor sites

export type AutonomyMode = 'autopilot' | 'review' | 'manual';

// ─── LAYER 1: Sensor Layer ────────────────────────────────────────────────────
// Path: orgs/{orgId}/clients/{clientId}/sensorRuns/{runId}

export type SensorRunStatus = 'running' | 'complete' | 'partial' | 'failed';
export type SensorRunTrigger = 'schedule' | 'event' | 'manual' | 'reactive';

export interface GridPoint {
  lat: number;
  lng: number;
  position: number | null; // null = not in pack
  label?: string;          // suburb/area label for this grid point
}

export interface GridSnapshot {
  keyword: string;
  gridPoints: GridPoint[];
  avgPosition: number | null;
  invisibleCount: number;    // grid points where position === null
  capturedAt: ISOTimestamp;
}

export interface GBPSnapshot {
  name: string;
  primaryCategory: string;
  categories: string[];
  services: string[];
  serviceAreas: string[];
  rating: number | null;
  reviewCount: number;
  recentReviews: number;     // reviews in last 30 days
  photoCount: number;
  recentPhotos: number;      // photos added in last 30 days
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  questionsAnswered: number;
  questionsUnanswered: number;
  descriptionLength: number; // chars — 0 = missing
  completenessScore: number; // 0–100 derived
  capturedAt: ISOTimestamp;
}

export interface SERPSnapshot {
  keyword: string;
  organicPosition: number | null;
  inMapsPack: boolean;
  mapsPackPosition: number | null;
  hasFeaturedSnippet: boolean;
  peopleAlsoAsk: string[];
  topCompetitors: SERPCompetitor[];
  capturedAt: ISOTimestamp;
}

export interface SERPCompetitor {
  url: string;
  domain: string;
  position: number;
  title: string;
  description: string;
  estimatedWordCount?: number;
}

export interface SiteCrawlSnapshot {
  url: string;
  pageCount: number;
  hasViewport: boolean;
  loadTimeMs: number | null;
  h1s: string[];
  schemaTypes: string[];
  hasSitemap: boolean;
  hasRobots: boolean;
  internalLinkCount: number;
  missingMeta: string[];     // pages missing title or description
  capturedAt: ISOTimestamp;
}

export interface GSCSnapshot {
  // Requires Google Search Console API — not yet configured.
  // Fields stubbed; access layer will skip if integration absent.
  totalClicks: number;
  totalImpressions: number;
  avgCTR: number;
  avgPosition: number;
  topQueries: GSCQuery[];
  capturedAt: ISOTimestamp;
}

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SensorRun {
  id?: string;
  orgId: string;
  clientId: string;
  triggeredBy: SensorRunTrigger;
  sensors: SensorType[];
  status: SensorRunStatus;
  snapshots: {
    rankGrid?: GridSnapshot;
    gbp?: GBPSnapshot;
    serp?: SERPSnapshot[];      // one per tracked keyword
    siteCrawl?: SiteCrawlSnapshot;
    gsc?: GSCSnapshot;          // null if not configured
    competitorCrawl?: SiteCrawlSnapshot[];
  };
  errorLog: string[];           // sensor-level errors (non-fatal)
  startedAt: ISOTimestamp;
  completedAt: ISOTimestamp | null;
}

// ─── LAYER 2: Interpretation Layer ───────────────────────────────────────────
// Path: orgs/{orgId}/clients/{clientId}/interpretations/{interpretationId}

export type DeltaDirection = 'improved' | 'declined' | 'new' | 'lost' | 'unchanged';
export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Delta {
  dimension: string;           // e.g. 'mapsPackPosition', 'reviewCount'
  previous: number | string | null;
  current: number | string | null;
  direction: DeltaDirection;
  magnitude: number;           // absolute change
  note: string;                // human-readable summary
}

export interface Gap {
  dimension: string;
  ourValue: number | string | null;
  competitorValue: number | string | null;
  competitorName: string;
  severity: GapSeverity;
  actionableInsight: string;   // specific, not generic
}

export interface BattleScoreBreakdown {
  total: number;               // 0–100
  mapsPackRank: number;        // 0–30
  organicRank: number;         // 0–25
  gbpCompleteness: number;     // 0–20
  siteQuality: number;         // 0–15
  contentCoverage: number;     // 0–10
  notes: string[];
}

export interface Opportunity {
  id: string;
  actionType: ActionType;
  title: string;
  impact: number;              // 0–10 estimated impact score
  effort: number;              // 0–10 estimated effort
  priority: number;            // impact / effort — higher = better ROI
  reasoning: string;
  estimatedBattleScoreDelta: number;
}

export interface Interpretation {
  id?: string;
  orgId: string;
  clientId: string;
  sensorRunId: string;
  battleScore: BattleScoreBreakdown;
  battleScorePrev: number | null;
  battleScoreDelta: number | null;
  deltas: Delta[];
  gaps: Gap[];
  opportunityQueue: Opportunity[];  // sorted descending by priority
  topCompetitor: string | null;
  criticalAlert: string | null;     // null or plain-English urgent message
  createdAt: ISOTimestamp;
}

// ─── LAYER 3: Decision Layer ──────────────────────────────────────────────────
// Path: orgs/{orgId}/clients/{clientId}/decisions/{decisionId}

export type ActionType =
  | 'CONTENT'      // generate/update page copy
  | 'STRUCTURE'    // add page, change nav, add schema
  | 'GBP'          // post, photo, Q&A, category
  | 'REVIEW'       // trigger review-request campaign
  | 'TECHNICAL'    // Core Web Vitals, canonical, redirect
  | 'BACKLINK'     // outreach opportunity (human action)
  | 'DEPLOY';      // push site to hosting

export type DecisionStatus =
  | 'pending'       // awaiting autonomy gate check
  | 'approved'      // ready for execution
  | 'executing'     // agent jobs dispatched
  | 'done'          // all actions complete
  | 'rejected'      // human or system rejected
  | 'partial';      // some actions done, some failed

export interface Action {
  id: string;
  actionType: ActionType;
  title: string;
  description: string;
  agentId: string;              // which agent executes this
  priority: number;             // 1 = highest
  estimatedDurationMs: number;
  dependsOnActionIds: string[]; // intra-decision ordering
  requiresHuman: boolean;       // never auto-execute if true
  inputPayload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'executing' | 'done' | 'failed' | 'skipped';
  executionId: string | null;
}

export interface Decision {
  id?: string;
  orgId: string;
  clientId: string;
  interpretationId: string;
  actions: Action[];
  autonomyMode: AutonomyMode;
  status: DecisionStatus;
  approvedBy: string | null;    // userId if manual approval
  approvedAt: ISOTimestamp | null;
  rejectedReason: string | null;
  createdAt: ISOTimestamp;
  completedAt: ISOTimestamp | null;
}

// ─── LAYER 4: Execution Layer ─────────────────────────────────────────────────
// Path: orgs/{orgId}/clients/{clientId}/executions/{executionId}

export type ExecutionStatus =
  | 'running'
  | 'complete'
  | 'failed'
  | 'rolled_back';

export interface Execution {
  id?: string;
  orgId: string;
  clientId: string;
  decisionId: string;
  actionId: string;
  actionType: ActionType;
  agentId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  diff: string | null;          // human-readable description of what changed
  status: ExecutionStatus;
  retryCount: number;
  errorLog: string | null;
  agentJobId: string | null;    // linked agentJobs/{id} if dispatched via job system
  startedAt: ISOTimestamp;
  completedAt: ISOTimestamp | null;
}

// ─── LAYER 5: Visibility Snapshot (daily) ────────────────────────────────────
// Path: orgs/{orgId}/clients/{clientId}/visibilitySnapshots/{date}  (date = YYYY-MM-DD)

export interface VisibilitySnapshot {
  date: string;                          // YYYY-MM-DD key
  orgId: string;
  clientId: string;
  battleScore: number;                   // 0–100
  battleScoreBreakdown: BattleScoreBreakdown;
  mapsPackPosition: number | null;       // best position across tracked keywords
  mapsPackKeyword: string | null;        // keyword where best position was found
  organicPositions: Record<string, number>; // keyword → position
  gbpCompleteness: number;              // 0–100
  reviewCount: number;
  avgRating: number | null;
  recentReviewVelocity: number;         // new reviews in last 30 days
  capturedAt: ISOTimestamp;
}

// ─── Feedback: Action Learnings ───────────────────────────────────────────────
// Path: orgs/{orgId}/clients/{clientId}/actionLearnings/{learningId}

export type LearningClassification = 'effective' | 'neutral' | 'regressive';

export interface ActionLearning {
  id?: string;
  orgId: string;
  clientId: string;
  executionId: string;
  decisionId: string;
  actionType: ActionType;
  agentId: string;
  actionTitle: string;
  battleScoreBefore: number;
  battleScoreAfter: number;
  battleScoreDelta: number;
  rankDeltaAvg: number | null;    // average rank improvement across tracked keywords
  reviewDelta: number | null;     // change in review count
  classification: LearningClassification;
  measurementWindowDays: number;  // how long after execution before measuring
  createdAt: ISOTimestamp;
}

// ─── BRAND SYSTEM ─────────────────────────────────────────────────────────────

export type BrandTone = 'authority' | 'trade' | 'urgent' | 'trust_first';

export interface BrandTokens {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string;
  accentDark: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  border: string;
  danger: string;

  fontHeading: string;
  fontBody: string;
  scaleBase: number;
  weightBody: number;
  weightMedium: number;
  weightBold: number;

  borderRadius: string;
  borderRadiusLarge: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;

  sectionPaddingY: string;
  containerMaxWidth: string;
  gridGap: string;

  tone: BrandTone;
  ctaStyle: 'filled' | 'filled_pill' | 'outline_bold';
  navStyle: 'top_bar' | 'sticky_compact' | 'top_bar_with_banner';
  heroStyle: 'full_bleed' | 'split' | 'contained' | 'overlay';
  cardStyle: 'flat' | 'elevated' | 'bordered';
}

// ─── CONVERSION ARCHETYPES ────────────────────────────────────────────────────

export type ConversionArchetype =
  | 'EMERGENCY_SERVICE'
  | 'TRADES_LEAD_GEN'
  | 'PREMIUM_SERVICE'
  | 'BOOKING_BASED'
  | 'QUOTE_BASED';

export interface ArchetypeProfile {
  archetype: ConversionArchetype;
  tone: BrandTone;
  primaryCta: string;
  ctaStrategy: 'call_dominant' | 'form_lead' | 'booking' | 'consultation' | 'quote';
  stickyPhone: boolean;
  maxCtasPerPage: number;
  defaultSectionOrder: ComponentType[];
  trustPriority: string[];
}

// ─── COMPONENT LIBRARY TYPES ──────────────────────────────────────────────────

export type ComponentType =
  | 'NAV'
  | 'HERO'
  | 'TRUST_BAR'
  | 'SERVICES'
  | 'PROCESS'
  | 'CTA_SECTION'
  | 'TESTIMONIALS'
  | 'GALLERY'
  | 'LOCATION_BLOCK'
  | 'FAQ'
  | 'FORM'
  | 'ABOUT'
  | 'AUTHORITY'
  | 'FOOTER';

export interface ComponentSpec {
  componentType: ComponentType;
  variant: string;               // e.g. 'SPLIT_LEFT_CONTENT', 'EMERGENCY_BANNER'
  position: number;              // order in page
  dataContract: Record<string, unknown>;
  ctaVariant?: string;           // phrase from CTA bank
  ruleSource?: string;           // which Conversion Rule triggered this selection
  archetypeCompatible: ConversionArchetype[];
}

// ─── PAGE BLUEPRINT (enhanced) ────────────────────────────────────────────────

export type PageType = 'home' | 'service' | 'location' | 'authority' | 'supporting' | 'about' | 'contact';
export type PageIntent = 'transactional' | 'informational' | 'local' | 'authority';

export interface SEOMeta {
  title: string;
  description: string;
  canonical?: string;
  og?: { title?: string; description?: string; image?: string };
  robots?: string;
}

export interface JSONLDSchema {
  type: string;                 // e.g. 'LocalBusiness', 'Service', 'FAQPage'
  data: Record<string, unknown>;
}

export interface InternalLink {
  targetPageKey: string;
  anchorText: string;
  contextHint: string;          // where in the page this link should appear
}

export interface PageBlueprint {
  key: string;
  route: string;
  title: string;
  pageType: PageType;
  intent: PageIntent;
  targetKeyword: string;
  seoMeta: SEOMeta;
  schema: JSONLDSchema[];
  sections: ComponentSpec[];
  internalLinksOut: InternalLink[];
  wordCountTarget: number;
  conversionRulesApplied: string[];
  variationSeed: string;        // deterministic variation identifier (hash of key+orgId)
}

export interface SitemapEntry {
  loc: string;
  priority: number;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  lastmod: string;
}

export interface WebsiteBlueprint {
  id?: string;
  orgId: string;
  clientId: string;
  version: string;
  generatedAt: ISOTimestamp;

  brandTokens: BrandTokens;
  archetype: ConversionArchetype;
  tone: BrandTone;

  siteMeta: {
    brand: string;
    uvp: string;
    nap: { address: string; phone: string; email?: string };
    license?: string;
    social?: { gbp?: string; fb?: string; ig?: string };
    tracking?: { ga4?: boolean; gtm?: boolean; gsc?: boolean };
  };

  nav: { variant: string; items: Array<{ label: string; href: string }> };
  footer: { nap: { address: string; phone: string; email?: string }; links: Array<{ label: string; href: string }> };

  pages: PageBlueprint[];
  assets: Array<{
    key: string;
    alt: string;
    suggestedSource?: string;
    placement?: { pageKey: string; sectionKind: string };
  }>;

  performance: {
    images: { format: 'webp' | 'avif'; sizes: string[] };
    fonts?: { preloads: string[] };
  };

  sitemapEntries: SitemapEntry[];
  internalLinkGraph: Array<{ from: string; to: string; anchorText: string }>;
  gbpAlignmentReport: GBPAlignmentReport;
}

// ─── GBP ALIGNMENT ────────────────────────────────────────────────────────────

export type AlignmentCheckResult = 'pass' | 'fail' | 'warning' | 'skipped';

export interface AlignmentCheck {
  name: string;
  result: AlignmentCheckResult;
  detail: string;
  autoFixed: boolean;
}

export interface GBPAlignmentReport {
  overall: AlignmentCheckResult;
  checks: AlignmentCheck[];
  missingServicePages: string[];   // GBP services without a blueprint page
  missingLocationPages: string[];  // GBP service areas without a blueprint page
  generatedAt: ISOTimestamp;
}

// ─── CLIENT LEAD JOURNEY ──────────────────────────────────────────────────────
// Embedded in: orgs/{orgId}/clients/{clientId} (root doc field)
// Sub-collection: orgs/{orgId}/clients/{clientId}/journeyStageHistory/{date}

export type ClientJourneyStage =
  | 'discovery'
  | 'first_impression'
  | 'landing'
  | 'consideration'
  | 'conversion'
  | 'post_conversion';

export type BottleneckType =
  | 'INVISIBLE'
  | 'POOR_IMPRESSION'
  | 'TRUST_FAILURE'
  | 'SHALLOW_CONTENT'
  | 'CONVERSION_BLOCKED'
  | 'NO_AUTHORITY';

export type StageHealthStatus = 'healthy' | 'warning' | 'critical' | 'no_data';

export interface StageScore {
  score: number;                           // 0–100
  status: StageHealthStatus;
  primaryMetric: number | null;
  primaryMetricLabel: string;
  signals: Record<string, number | boolean | null>;
  dropOffDetected: boolean;
  bottleneckClassification: BottleneckType | null;
  pendingActions: string[];                // action titles queued for this stage
  lastMeasuredAt: ISOTimestamp | null;
}

export interface ClientLeadJourney {
  lastUpdated: ISOTimestamp;
  overallScore: number;
  stageScores: Record<ClientJourneyStage, StageScore>;
  criticalBottleneck: ClientJourneyStage | null;
  activeActionIds: string[];
}

export interface JourneyStageHistoryRecord {
  date: string;                            // YYYY-MM-DD
  overallScore: number;
  stageScores: Record<ClientJourneyStage, number>;
  bottleneck: BottleneckType | null;
  actionsExecuted: string[];
  capturedAt: ISOTimestamp;
}

// ─── MOMENTUM LEAD JOURNEY ────────────────────────────────────────────────────
// Embedded in: orgs/{orgId}/leads/{leadId} (root doc field)
// Sub-collections:
//   orgs/{orgId}/leads/{leadId}/journeyStageHistory/{transitionId}
//   orgs/{orgId}/leads/{leadId}/momentumFollowUps/{followUpId}
//   orgs/{orgId}/leads/{leadId}/momentumObjections/{objectionId}

export type MomentumStage =
  | 'DISCOVERY'
  | 'AWARENESS'
  | 'PROBLEM_REALISATION'
  | 'SOLUTION_FRAMING'
  | 'TRUST_AND_CERTAINTY'
  | 'DECISION'
  | 'ONBOARDING'
  | 'WON'
  | 'LOST';

export type MomentumTransitionTrigger = 'rep' | 'system' | 'autopilot';

export interface StageTransition {
  from: MomentumStage;
  to: MomentumStage;
  triggeredBy: MomentumTransitionTrigger;
  at: ISOTimestamp;
  notes?: string;
}

export interface ConfidenceFactors {
  competitorVulnerability: number;   // 0–25
  battleScoreGap: number;            // 0–25
  industryFamiliarity: number;       // 0–20
  leadEngagement: number;            // 0–20
  timelineClarity: number;           // 0–10
  total: number;                     // sum 0–100
}

export type NextBestActionType =
  | 'call'
  | 'email'
  | 'send_gap_report'
  | 'send_competitor_matrix'
  | 'send_proposal'
  | 'send_decision_brief'
  | 'follow_up'
  | 'close'
  | 're_engage'
  | 'book_discovery';

export interface NextBestAction {
  actionType: NextBestActionType;
  label: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  generatedAt: ISOTimestamp;
  dueAt?: ISOTimestamp;
}

export type FollowUpChannel = 'email' | 'sms' | 'call_script';
export type FollowUpStatus = 'queued' | 'sent' | 'replied' | 'ignored';

export interface FollowUp {
  id?: string;
  orgId: string;
  leadId: string;
  stage: MomentumStage;
  sequenceIndex: number;            // 1, 2, 3… within stage sequence
  channel: FollowUpChannel;
  subject?: string;                 // email only
  body: string;
  generatedAt: ISOTimestamp;
  sentAt?: ISOTimestamp;
  status: FollowUpStatus;
}

export type ObjectionCategory =
  | 'TIMING'
  | 'BUDGET'
  | 'TRUST'
  | 'COMPETITOR_COMPARISON'
  | 'INTERNAL_APPROVAL'
  | 'NOT_CONVINCED_IT_WORKS'
  | 'ALREADY_DOING_IT';

export interface Objection {
  id?: string;
  orgId: string;
  leadId: string;
  text: string;
  category: ObjectionCategory;
  responseGenerated: string;        // NEPQ-style response
  loggedAt: ISOTimestamp;
  resolved: boolean;
  resolvedAt?: ISOTimestamp;
}

export interface MomentumJourney {
  currentStage: MomentumStage;
  stageEnteredAt: ISOTimestamp;
  stageHistory: StageTransition[];
  confidenceScore: number;
  confidenceFactors: ConfidenceFactors;
  lastActivityAt: ISOTimestamp;
  daysSinceLastActivity: number;
  coldAlertSent: boolean;
  nextBestAction: NextBestAction | null;
  nepqQueueForStage: string[];     // pre-generated NEPQ questions for current stage
  lossReason?: string;
}

export interface MomentumStageHistoryRecord {
  id?: string;
  stage: MomentumStage;
  enteredAt: ISOTimestamp;
  exitedAt: ISOTimestamp | null;
  durationHours: number | null;
  activitiesInStage: number;
  outcomeNote: string;
  triggerForExit: MomentumTransitionTrigger | null;
}

// ─── ORG-LEVEL VISIBILITY CONFIG ─────────────────────────────────────────────
// Path: orgs/{orgId}/visibilityConfig/default  (single doc per org)

export interface VisibilityConfig {
  orgId: string;
  defaultAutopilotMode: AutonomyMode;
  sensorSchedules: {
    rankGrid: string;       // cron expression, e.g. '0 2 * * *'
    gbpHealth: string;
    serpSnapshot: string;
    siteCrawl: string;
    gscSnapshot: string;    // ignored if GSC not configured
    competitorCrawl: string;
  };
  battleScoreWeights: {
    mapsPackRank: number;   // default 30
    organicRank: number;    // default 25
    gbpCompleteness: number; // default 20
    siteQuality: number;    // default 15
    contentCoverage: number; // default 10
  };
  trackedKeywords: string[];
  trackedCompetitors: string[];  // domain names
  updatedAt: ISOTimestamp;
}

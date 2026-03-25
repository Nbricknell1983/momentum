/**
 * Strategy Presentation Domain Model
 *
 * Typed interfaces for the client-facing strategy experience layer.
 * These are the structures passed to StrategyReportPage and managed
 * by the strategy report system.
 */

// ─── Confidence ──────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface StrategyConfidence {
  level: ConfidenceLevel;
  explanation: string;
  observedDataSources: string[];
  estimatedDataSources: string[];
}

// ─── Visibility Triangle ─────────────────────────────────────────────────────

export interface TriangleSignal {
  score: number;          // 0-100
  evidence: string;       // plain-language evidence sentence
  interpretation: string; // what the score means for the business
}

export interface DigitalVisibilityTriangle {
  relevance: TriangleSignal;
  authority: TriangleSignal;
  trust: TriangleSignal;
}

// ─── Discovery Path ──────────────────────────────────────────────────────────

export type SignalStrength = 'strong' | 'partial' | 'weak';

export interface DiscoveryPathStage {
  stage: string;
  strength: SignalStrength;
  issue: string;
  impact: string;
}

// ─── Intent Gaps ─────────────────────────────────────────────────────────────

export type CoverageLevel = 'strong' | 'partial' | 'missing';

export interface IntentGap {
  category: string;
  coverage: CoverageLevel;
  evidence: string;
  suggestedMove: string;
}

// ─── Buyer Reality Gap ───────────────────────────────────────────────────────

export interface BuyerRealityGap {
  summary: string;
  points: Array<{
    buyerExpects: string;
    currentReality: string;
    severity: 'critical' | 'moderate' | 'minor';
  }>;
}

// ─── Market Opportunity ───────────────────────────────────────────────────────

export interface KeywordOpportunity {
  keyword: string;
  monthlySearches: number;
  currentRank: string;
  difficulty: number | null;
  opportunity: 'high' | 'medium' | 'low';
}

export interface MarketOpportunity {
  summary: string;
  totalMonthlySearches: number;
  currentCapture: string;
  potentialCapture: string;
  keyInsight: string;
  keywords: KeywordOpportunity[];
}

// ─── Search Engine View ───────────────────────────────────────────────────────

export interface SearchEngineView {
  totalPages: number;
  servicePages: number;
  locationPages: number;
  portfolioPages: number;
  otherPages: number;
}

// ─── Growth Pillars ───────────────────────────────────────────────────────────

export interface GrowthPillar {
  pillar: string;
  focus: string;
  timeline: string;
  roi: string;
}

// ─── Projected Outcomes ───────────────────────────────────────────────────────

export interface ProjectedOutcome {
  month: string;
  estimatedLeads: string;
  rankingKeywords: number | null;
  confidence: 'high' | 'medium' | 'low';
  scenarioCaveat: string;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export interface KPI {
  metric: string;
  baseline: string;
  target12Month: string;
  dataQuality: 'observed' | 'estimated' | 'projected';
}

// ─── Growth Phases ────────────────────────────────────────────────────────────

export interface GrowthPhase {
  phase: string;
  focus: string;
  milestone: string;
  timeline: string;
}

// ─── Cost of Inaction ─────────────────────────────────────────────────────────

export interface CostOfInaction {
  headline: string;
  body: string;
  metrics: Array<{ label: string; value: string }>;
}

// ─── Momentum Moment ──────────────────────────────────────────────────────────

export interface MomentumMoment {
  headline: string;
  body: string;
  urgency: 'high' | 'medium' | 'low';
}

// ─── Insight Snapshots ────────────────────────────────────────────────────────

export interface InsightSnapshot {
  headline: string;
  metric: string;
  explanation: string;
}

// ─── Scope Framing ────────────────────────────────────────────────────────────

export interface ScopeFraming {
  headline: string;
  leadText: string;
  ctaText: string;
}

// ─── Strategy Diagnosis (stored separately at report root) ───────────────────

export interface StrategyDiagnosis {
  readinessScore: number;
  insightSentence: string;
  subscores: {
    serviceClarityScore: number;
    locationRelevanceScore: number;
    contentCoverageScore: number;
    gbpAlignmentScore: number;
    authorityScore: number;
  };
  gaps: Array<{ title: string }>;
  priorities: string[];
  growthPotential: {
    summary: string;
    forecastBand: {
      additionalImpressions: string;
      additionalVisitors: string;
      additionalEnquiries: string;
    };
  };
  currentPosition: string;
}

// ─── Full Strategy Document ───────────────────────────────────────────────────

export interface StrategyDocument {
  executiveSummary: {
    summary: string;
    keyFindings: string[];
    topOpportunity: string;
    urgency: 'immediate' | 'high' | 'medium' | 'low';
  };
  oneSentenceStrategy: string;
  strategyConfidence: StrategyConfidence;
  digitalVisibilityTriangle: DigitalVisibilityTriangle;
  discoveryPath: DiscoveryPathStage[];
  buyerRealityGap: BuyerRealityGap;
  intentGaps: IntentGap[];
  marketOpportunity: MarketOpportunity;
  searchEngineView: SearchEngineView;
  growthPillars: GrowthPillar[];
  projectedOutcomes: ProjectedOutcome[];
  kpis: KPI[];
  growthPhases: GrowthPhase[];
  costOfInaction: CostOfInaction;
  momentumMoment: MomentumMoment;
  insightSnapshots: InsightSnapshot[];
  scopeFraming: ScopeFraming;
  generatedAt: string;
}

// ─── Full Strategy Report (Firestore document) ───────────────────────────────

export interface StrategyReport {
  id: string;
  orgId: string;
  leadId?: string;          // if generated from a lead
  clientId?: string;        // if generated from a client
  businessName: string;
  industry?: string;
  location?: string;
  websiteUrl?: string;
  preparedBy?: string;
  preparedByEmail?: string;
  phone?: string;
  strategyDiagnosis?: StrategyDiagnosis;
  strategy: StrategyDocument;
  publicSlug: string;
  type: 'strategy';
  status: 'draft' | 'active' | 'locked' | 'revoked';
  lockedForProposal?: boolean;
  lockedAt?: string;
  revokedAt?: string;
  expiresAt?: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  acceptedScope?: {
    acceptedServices: string[];
    contactName: string;
    contactEmail: string;
    notes: string;
    acceptedAt: string;
  };
  // Share link config
  shareConfig?: ShareLinkConfig;
}

// ─── Share Link Config ────────────────────────────────────────────────────────

export interface ShareLinkConfig {
  mode: 'internal' | 'shareable';
  expiresAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
  accessLog: AccessLogEntry[];
}

export interface AccessLogEntry {
  viewedAt: string;
  userAgent?: string;
  ip?: string;
}

// ─── Presentation Snapshot (versioning) ──────────────────────────────────────

export interface PresentationSnapshot {
  snapshotId: string;
  reportId: string;
  takenAt: string;
  takenBy: string;
  label?: string;           // e.g. "Sent to client 12/03/2026"
  locked: boolean;
  strategy: StrategyDocument;
  strategyDiagnosis?: StrategyDiagnosis;
}

// ─── CTA State ────────────────────────────────────────────────────────────────

export type CTAAction =
  | 'book_strategy_session'
  | 'approve_proposal'
  | 'proceed_to_onboarding'
  | 'request_follow_up'
  | 'view_recommended_modules';

export interface PresentationCTAState {
  primaryAction: CTAAction;
  primaryLabel: string;
  secondaryAction?: CTAAction;
  secondaryLabel?: string;
  urgencyNote?: string;
  stage: string;
}

// ─── Presentation Metadata ────────────────────────────────────────────────────

export interface PresentationVisibilitySummary {
  overallScore: number;
  label: 'Strong' | 'Growing' | 'Early Stage';
  topGap: string;
  topOpportunity: string;
  competitorAdvantage?: string;
}

export interface PresentationOpportunityMap {
  totalAddressableSearches: number;
  currentMonthlyVisibility: string;
  potentialMonthlyVisibility: string;
  gapDescription: string;
  keywordOpportunities: KeywordOpportunity[];
}

export interface PresentationRoadmap {
  phases: Array<{
    name: string;
    timeframe: string;
    what: string;
    why: string;
    outcome: string;
    icon: string;
  }>;
  quickWins: Array<{ action: string; impact: string; effort: 'low' | 'medium' | 'high' }>;
}

export interface PresentationConfidenceBlock {
  level: ConfidenceLevel;
  observedFacts: string[];
  estimates: string[];
  assumptions: string[];
  willImproveAfterOnboarding: string[];
}

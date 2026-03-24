// =============================================================================
// VISIBILITY OS — PUBLIC API
// =============================================================================
// Import from here in route handlers and other server modules.
// Never import directly from types.ts / access.ts / constants.ts in routes.
// =============================================================================

export type {
  // Sensor Layer
  SensorRun, SensorRunStatus, SensorRunTrigger, SensorType,
  GridPoint, GridSnapshot, GBPSnapshot, SERPSnapshot, SERPCompetitor,
  SiteCrawlSnapshot, GSCSnapshot, GSCQuery,
  // Interpretation Layer
  Delta, Gap, BattleScoreBreakdown, Opportunity, Interpretation,
  DeltaDirection, GapSeverity,
  // Decision Layer
  Decision, DecisionStatus, Action, ActionType, AutonomyMode,
  // Execution Layer
  Execution, ExecutionStatus,
  // Snapshot + Learning
  VisibilitySnapshot, ActionLearning, LearningClassification,
  // Brand System
  BrandTokens, BrandTone, ConversionArchetype, ArchetypeProfile,
  // Component Library
  ComponentType, ComponentSpec,
  // Blueprint
  PageBlueprint, PageType, PageIntent, SEOMeta, JSONLDSchema,
  InternalLink, SitemapEntry, WebsiteBlueprint,
  // GBP Alignment
  GBPAlignmentReport, AlignmentCheck, AlignmentCheckResult,
  // Client Lead Journey
  ClientLeadJourney, ClientJourneyStage, StageScore, StageHealthStatus,
  BottleneckType, JourneyStageHistoryRecord,
  // Momentum Lead Journey
  MomentumJourney, MomentumStage, StageTransition, MomentumTransitionTrigger,
  ConfidenceFactors, NextBestAction, NextBestActionType,
  FollowUp, FollowUpChannel, FollowUpStatus,
  Objection, ObjectionCategory,
  MomentumStageHistoryRecord,
  // Config
  VisibilityConfig,
  // Shared
  ISOTimestamp,
} from './types';

export {
  // Constants
  BATTLESCORE_WEIGHTS,
  GBP_COMPLETENESS_WEIGHTS,
  SITE_QUALITY_WEIGHTS,
  MAPS_PACK_SCORE_TABLE,
  ORGANIC_SCORE_TABLE,
  DROP_OFF_THRESHOLDS,
  STAGE_TO_BOTTLENECK,
  BOTTLENECK_LABELS,
  ARCHETYPE_PROFILES,
  TONE_TYPOGRAPHY,
  CTA_PHRASES,
  H1_PATTERNS,
  ARCHETYPE_SCHEMA_SUBTYPE,
  SITEMAP_PRIORITY,
  MOMENTUM_STAGE_ORDER,
  COLD_ALERT_DAYS,
  FOLLOW_UP_SEQUENCE_COUNT,
  OBJECTION_LABELS,
  NBA_LABELS,
  DEFAULT_VISIBILITY_CONFIG,
  CONTENT_COVERAGE_THRESHOLDS,
} from './constants';

export type { H1Pattern } from './constants';

// Tenant isolation — import this in route handlers
export { VisibilityTenant, createTenant } from './tenant';

/**
 * Proposal Acceptance + Onboarding Transition Domain Model
 *
 * Typed interfaces for the complete proposal → acceptance → onboarding → provisioning lifecycle.
 * These types are stored on the Lead document under `onboardingState` and track
 * everything from strategy presentation through to tenant provisioning.
 */

// ─── Proposal Status Lifecycle ────────────────────────────────────────────────

export type ProposalStatus =
  | 'strategy_presented'     // Strategy report has been generated and shared
  | 'proposal_pending'       // Scope discussed, waiting for acceptance
  | 'proposal_accepted'      // Prospect has accepted the proposal
  | 'onboarding_in_progress' // Onboarding capture form being completed
  | 'onboarding_ready'       // All required fields captured, no blockers
  | 'provisioning'           // Provisioning request sent to AI Systems
  | 'provisioned'            // Tenant created and active in AI Systems
  | 'onboarding_failed';     // Provisioning failed or stalled

// ─── Module definitions ───────────────────────────────────────────────────────

export type ModuleKey =
  | 'website'
  | 'seo'
  | 'gbp'
  | 'google_ads'
  | 'content'
  | 'local_seo'
  | 'telemetry'
  | 'autopilot'
  | 'portal_access';

export type ModuleTiming = 'now' | 'later' | 'not_included';

export interface ModuleSelection {
  key: ModuleKey;
  label: string;
  timing: ModuleTiming;
  notes?: string;
}

export interface SelectedModules {
  modules: ModuleSelection[];
  selectedAt: string;           // ISO 8601
  selectedBy: string;           // userId
  strategyReportId?: string;    // which strategy version this maps to
  strategyReportSlug?: string;
  notes?: string;
}

// ─── Onboarding Capture ───────────────────────────────────────────────────────

export interface OnboardingContact {
  firstName: string;
  lastName: string;
  role: string;
  phone: string;
  email: string;
}

export interface OnboardingBusinessDetails {
  legalName: string;
  tradingName: string;
  abn: string;
  industry: string;
  businessCategory: string;
  serviceModel: 'mobile_service' | 'fixed_location' | 'hybrid' | 'digital_only';
  employeeCount: 'solo' | '2-5' | '6-15' | '16-50' | '51+' | '';
  establishedYear: string;
  phone: string;
  email: string;
}

export interface OnboardingAddress {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}

export interface OnboardingWebDetails {
  currentDomain: string;
  newDomainRequired: boolean;
  preferredDomain: string;
  hostingProvider: string;
  hasCms: boolean;
  cmsNotes: string;
}

export interface OnboardingServiceArea {
  name: string;
  state: string;
  postcode: string;
  priority: 'primary' | 'secondary' | 'tertiary';
}

export interface OnboardingTargetService {
  serviceName: string;
  category: string;
  isPrimary: boolean;
  averageJobValue: string;
}

export interface OnboardingGbpDetails {
  hasGbp: boolean;
  gbpName: string;
  gbpCategory: string;
  gbpPhone: string;
  gbpNotes: string;
}

export interface OnboardingBranding {
  hasLogo: boolean;
  hasBrandColors: boolean;
  hasPhotos: boolean;
  brandNotes: string;
}

export interface OnboardingCapture {
  contact: OnboardingContact;
  business: OnboardingBusinessDetails;
  address: OnboardingAddress;
  web: OnboardingWebDetails;
  serviceAreas: OnboardingServiceArea[];
  targetServices: OnboardingTargetService[];
  gbp: OnboardingGbpDetails;
  branding: OnboardingBranding;
  handoverNotes: string;
  capturedAt: string;   // ISO 8601
  capturedBy: string;   // userId
}

// ─── Readiness Checklist ─────────────────────────────────────────────────────

export type ReadinessCheckKey =
  | 'strategy_locked'
  | 'scope_selected'
  | 'contact_captured'
  | 'business_details_complete'
  | 'service_areas_defined'
  | 'target_services_defined'
  | 'web_details_captured'
  | 'no_critical_blockers';

export interface ReadinessCheck {
  key: ReadinessCheckKey;
  label: string;
  description: string;
  passed: boolean;
  weight: 'required' | 'recommended';
  fixAction?: string;    // what to do to fix this
}

export interface OnboardingBlocker {
  key: string;
  severity: 'critical' | 'warning';
  description: string;
  fixAction: string;
}

export interface OnboardingReadinessResult {
  score: number;               // 0–100
  isReady: boolean;            // all required checks pass
  checks: ReadinessCheck[];
  blockers: OnboardingBlocker[];
  computedAt: string;          // ISO 8601
}

// ─── Proposal Acceptance Event ────────────────────────────────────────────────

export interface ProposalAcceptanceEvent {
  acceptedAt: string;        // ISO 8601
  acceptedBy: string;        // userId (internal sales person)
  acceptedByName: string;
  strategyReportId: string;
  strategyReportSlug: string;
  acceptedModules: string[]; // module keys accepted
  contactName?: string;      // prospect contact name if captured
  contactEmail?: string;
  notes?: string;
  channel: 'internal' | 'self_serve'; // internal = rep accepted on behalf of prospect
}

// ─── Accepted Strategy Version ────────────────────────────────────────────────

export interface AcceptedStrategyVersion {
  reportId: string;
  publicSlug: string;
  lockedAt?: string;
  generatedAt: string;
  status: 'active' | 'locked';
  summarySnapshot?: {
    readinessScore: number;
    topGap: string;
    primaryPillar: string;
    estimatedOutcome: string;
  };
}

// ─── Provisioning Trigger State ───────────────────────────────────────────────

export type ProvisioningTriggerStatus =
  | 'not_triggered'
  | 'pending'
  | 'submitted'
  | 'succeeded'
  | 'failed'
  | 'retrying';

export interface ProvisioningTriggerState {
  status: ProvisioningTriggerStatus;
  triggeredAt?: string;
  triggeredBy?: string;
  provisioningRequestId?: string;
  tenantId?: string;
  aiSystemsLifecycleState?: string;
  lastError?: string;
  retryCount?: number;
  succeededAt?: string;
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export interface OnboardingAuditEntry {
  eventType:
    | 'status_changed'
    | 'scope_updated'
    | 'capture_updated'
    | 'readiness_checked'
    | 'provisioning_triggered'
    | 'provisioning_succeeded'
    | 'provisioning_failed'
    | 'blocker_resolved';
  timestamp: string;        // ISO 8601
  performedBy: string;      // userId
  performedByName?: string;
  fromStatus?: ProposalStatus;
  toStatus?: ProposalStatus;
  detail?: string;
  payload?: Record<string, unknown>;
}

// ─── Full Onboarding State (stored on Lead document) ─────────────────────────

export interface OnboardingState {
  status: ProposalStatus;

  // Scope
  selectedModules?: SelectedModules;

  // Capture
  capture?: Partial<OnboardingCapture>;

  // Acceptance
  acceptanceEvent?: ProposalAcceptanceEvent;

  // Strategy version that was accepted
  acceptedStrategyVersion?: AcceptedStrategyVersion;

  // Readiness (computed, cached)
  readiness?: OnboardingReadinessResult;

  // Provisioning
  provisioning?: ProvisioningTriggerState;

  // Audit
  auditTrail?: OnboardingAuditEntry[];

  // Timestamps
  statusChangedAt?: string;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
}

// ─── Module Catalogue (static definition) ────────────────────────────────────

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  icon: string;
  requiresWebsite?: boolean;
  requiresGbp?: boolean;
  isCore?: boolean;
}

export const MODULE_CATALOGUE: ModuleDefinition[] = [
  {
    key: 'website',
    label: 'Website',
    description: 'New conversion-focused website with service pages, trust signals, and strong calls to action.',
    icon: '🌐',
    isCore: true,
  },
  {
    key: 'seo',
    label: 'SEO',
    description: 'Local and service search optimisation — keyword targeting, content depth, and technical foundations.',
    icon: '🔍',
    isCore: true,
  },
  {
    key: 'gbp',
    label: 'Google Business Profile',
    description: 'Complete GBP optimisation — categories, photos, posts, Q&A, and review strategy.',
    icon: '📍',
    isCore: true,
  },
  {
    key: 'google_ads',
    label: 'Google Ads',
    description: 'Targeted paid campaigns for high-value service terms while organic rankings build.',
    icon: '📢',
  },
  {
    key: 'content',
    label: 'Content',
    description: 'Strategic content creation — service pages, location pages, blog, and educational articles.',
    icon: '✍️',
  },
  {
    key: 'local_seo',
    label: 'Local SEO',
    description: 'Suburb-level search targeting, local citation building, and map pack dominance.',
    icon: '📌',
  },
  {
    key: 'telemetry',
    label: 'Telemetry & Reporting',
    description: 'Search Console, GA4, and GBP Insights integration with monthly performance reporting.',
    icon: '📊',
  },
  {
    key: 'autopilot',
    label: 'Autopilot',
    description: 'AI-driven proactive optimisation — the system monitors and acts without manual intervention.',
    icon: '⚡',
  },
  {
    key: 'portal_access',
    label: 'Client Portal',
    description: 'Branded client dashboard giving the business owner visibility into performance and activity.',
    icon: '🔑',
  },
];

// ─── Helper: derive onboarding state from lead fields ─────────────────────────

export function deriveProposalStatus(lead: any): ProposalStatus {
  const os: OnboardingState = lead.onboardingState || {};
  if (os.status) return os.status;

  // Infer from existing lead data
  if (lead.strategyReportId) return 'strategy_presented';
  return 'proposal_pending';
}

export function deriveReadiness(lead: any, onboardingState: OnboardingState): OnboardingReadinessResult {
  const os = onboardingState;
  const capture = os.capture || {};
  const modules = os.selectedModules?.modules || [];

  const checks: ReadinessCheck[] = [
    {
      key: 'strategy_locked',
      label: 'Strategy version locked',
      description: 'A strategy report must be locked before accepting a proposal.',
      passed: !!os.acceptedStrategyVersion || !!lead.strategyReportId,
      weight: 'required',
      fixAction: 'Generate and lock a strategy report in the Strategy Report tab.',
    },
    {
      key: 'scope_selected',
      label: 'Scope selected',
      description: 'At least one module must be selected.',
      passed: modules.filter((m: ModuleSelection) => m.timing === 'now').length > 0,
      weight: 'required',
      fixAction: 'Select at least one module in the Scope step.',
    },
    {
      key: 'contact_captured',
      label: 'Primary contact captured',
      description: 'First name, last name, phone, and email for the primary contact.',
      passed: !!(capture.contact?.firstName && capture.contact?.email && capture.contact?.phone),
      weight: 'required',
      fixAction: 'Complete the contact details in the Capture step.',
    },
    {
      key: 'business_details_complete',
      label: 'Business details complete',
      description: 'Trading name, industry, and service model.',
      passed: !!(capture.business?.tradingName && capture.business?.industry),
      weight: 'required',
      fixAction: 'Complete the business details in the Capture step.',
    },
    {
      key: 'service_areas_defined',
      label: 'Service areas defined',
      description: 'At least one service area must be defined.',
      passed: (capture.serviceAreas?.length || 0) > 0,
      weight: 'required',
      fixAction: 'Add at least one service area in the Capture step.',
    },
    {
      key: 'target_services_defined',
      label: 'Target services defined',
      description: 'At least one target service with a primary service marked.',
      passed: (capture.targetServices?.length || 0) > 0,
      weight: 'required',
      fixAction: 'Add at least one target service in the Capture step.',
    },
    {
      key: 'web_details_captured',
      label: 'Website details captured',
      description: 'Current domain or new domain preference recorded.',
      passed: !!(capture.web?.currentDomain || capture.web?.preferredDomain || capture.web?.newDomainRequired != null),
      weight: 'recommended',
      fixAction: 'Add website details in the Capture step.',
    },
    {
      key: 'no_critical_blockers',
      label: 'No critical blockers',
      description: 'All critical blockers must be resolved before provisioning.',
      passed: true, // computed below
      weight: 'required',
      fixAction: 'Resolve all critical blockers listed below.',
    },
  ];

  const blockers: OnboardingBlocker[] = [];
  const requiredFailed = checks.filter(c => c.weight === 'required' && !c.passed && c.key !== 'no_critical_blockers');
  for (const c of requiredFailed) {
    blockers.push({
      key: c.key,
      severity: 'critical',
      description: c.description,
      fixAction: c.fixAction || '',
    });
  }

  // Update the no_critical_blockers check
  const noCritCheck = checks.find(c => c.key === 'no_critical_blockers');
  if (noCritCheck) noCritCheck.passed = blockers.length === 0;

  const totalRequired = checks.filter(c => c.weight === 'required').length;
  const passedRequired = checks.filter(c => c.weight === 'required' && c.passed).length;
  const totalAll = checks.length;
  const passedAll = checks.filter(c => c.passed).length;
  const score = Math.round((passedAll / totalAll) * 100);
  const isReady = blockers.length === 0;

  return { score, isReady, checks, blockers, computedAt: new Date().toISOString() };
}

// ─── Empty defaults ───────────────────────────────────────────────────────────

export function emptyCapture(): Partial<OnboardingCapture> {
  return {
    contact: { firstName: '', lastName: '', role: '', phone: '', email: '' },
    business: {
      legalName: '', tradingName: '', abn: '', industry: '',
      businessCategory: '', serviceModel: 'fixed_location',
      employeeCount: '', establishedYear: '', phone: '', email: '',
    },
    address: { street: '', suburb: '', state: '', postcode: '', country: 'Australia' },
    web: { currentDomain: '', newDomainRequired: false, preferredDomain: '', hostingProvider: '', hasCms: false, cmsNotes: '' },
    serviceAreas: [],
    targetServices: [],
    gbp: { hasGbp: true, gbpName: '', gbpCategory: '', gbpPhone: '', gbpNotes: '' },
    branding: { hasLogo: false, hasBrandColors: false, hasPhotos: false, brandNotes: '' },
    handoverNotes: '',
  };
}

export function emptyModuleSelections(): ModuleSelection[] {
  return MODULE_CATALOGUE.map(m => ({
    key: m.key,
    label: m.label,
    timing: (m.isCore ? 'now' : 'not_included') as ModuleTiming,
  }));
}

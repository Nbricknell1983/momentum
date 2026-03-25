// ── AI Systems Summary Adapter ───────────────────────────────────────────────
// Derives AI Systems-side state from available Momentum data.
//
// ARCHITECTURE:
// 1. PRIMARY: Live sync snapshots from orgs/{orgId}/aiSystemsSync/{clientId}
//    Written by the server-side sync service after each pull or AI Systems push.
// 2. FALLBACK: Inferred from Momentum-synced fields (deliveryStatus, modules, etc.)
//
// Freshness rules:
//   - Live (< 4h):   use sync snapshot directly, mark dataQuality: 'live'
//   - Stale (4–24h): use cached snapshot, mark dataQuality: 'cached'
//   - Expired (>24h) or no snapshot: fall back to inferred, mark dataQuality: 'derived'
//   - No tenantId:   mark dataQuality: 'unavailable'
//
// All fields that cannot be known are marked with dataQuality: 'unavailable'
// so the UI is always honest about confidence.

import type { Client, Lead } from '@/lib/types';
import type { AISystemsSideState, AISystemsDataQuality } from '@/lib/unifiedOpsTypes';
import type { OnboardingState, ProvisioningTriggerState } from '@/lib/proposalAcceptanceTypes';
import type { AISystemsSyncSnapshot } from '@/lib/aiSystemsSyncTypes';
import { STALE_THRESHOLD_MS, EXPIRED_THRESHOLD_MS } from '@/lib/aiSystemsSyncTypes';

// ── Build AISystemsSideState from a live sync snapshot ───────────────────────
// Called when fresh or stale (but not expired) data is available.

export function buildAISystemsStateFromLiveSummary(
  snapshot: AISystemsSyncSnapshot
): AISystemsSideState | null {
  if (!snapshot.summary) return null;
  const s = snapshot.summary;

  // Determine freshness
  const ageMs = snapshot.lastSyncedAt
    ? Date.now() - new Date(snapshot.lastSyncedAt).getTime()
    : Infinity;

  const isFresh = ageMs < STALE_THRESHOLD_MS;
  const isStale = ageMs < EXPIRED_THRESHOLD_MS;

  if (!isFresh && !isStale) return null;  // Expired — fall back to inferred

  const dataQuality: AISystemsDataQuality = isFresh ? 'live' : 'cached';
  const syncDate = snapshot.lastSyncedAt
    ? new Date(snapshot.lastSyncedAt).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : undefined;

  return {
    tenantId:          s.tenantId,
    lifecycleState:    s.lifecycleState,
    deliveryStatus:    s.isActive ? 'active' : s.isOnboarding ? 'onboarding' : s.isBlocked ? 'blocked' : 'unknown',
    websiteStatus:     s.websiteStatus,
    contentStatus:     s.contentStatus,
    telemetryStatus:   s.telemetryStatus,
    optimisationStatus: s.seoStatus,
    portalStatus:      s.portalStatus,
    healthStatus:      s.overallHealth === 'green' ? 'green' : s.overallHealth === 'red' ? 'red' : 'amber',
    activeModules:     s.modules.filter(m => m.status !== 'not_included').map(m => m.key),
    lastRefreshed:     syncDate,
    dataQuality,
    dataQualityNote:   isFresh
      ? `Live AI Systems data — synced ${syncDate ?? 'recently'}`
      : `Cached AI Systems data — synced ${syncDate ?? 'recently'} (may be slightly out of date)`,
    // Extended fields from live summary
    liveSnapshot: {
      activeBlockers:   s.activeBlockers,
      recentMilestones: s.recentMilestones,
      nextActions:      s.nextActions,
      websiteUrl:       s.websiteUrl,
      portalUrl:        s.portalUrl,
      overallHealth:    s.overallHealth,
      healthNotes:      s.healthNotes,
      activeAgents:     s.activeAgents,
      summaryGeneratedAt: s.summaryGeneratedAt,
    },
  };
}

// ── Derive from Client ────────────────────────────────────────────────────────

export function deriveAISystemsStateFromClient(client: Client): AISystemsSideState {
  const os = (client as any).onboardingState as OnboardingState | undefined;
  const prov = os?.provisioning;

  // Infer active modules from client products or selected modules
  const activeModules: string[] = [];
  if ((client as any).products?.length > 0) {
    activeModules.push(...((client as any).products as { name?: string; key?: string }[]).map(p => p.key ?? p.name ?? '').filter(Boolean));
  }

  const selectedModules: string[] = os?.selectedModules?.modules
    ?.filter(m => m.timing === 'now')
    ?.map(m => m.key) ?? [];

  const allModules = Array.from(new Set([...activeModules, ...selectedModules]));

  // Determine website/content/telemetry/optimisation from module list
  const hasWebsite    = allModules.includes('website');
  const hasTelemetry  = allModules.includes('telemetry');
  const hasPortal     = allModules.includes('portal_access');
  const hasSeo        = allModules.includes('seo');
  const hasContent    = allModules.includes('content');

  // Delivery status as delivery-side signal
  const deliveryStatus = client.deliveryStatus ?? 'unknown';
  const isActive       = deliveryStatus === 'active';
  const isOnboarding   = deliveryStatus === 'onboarding';
  const isBlocked      = deliveryStatus === 'blocked';

  // Inferred statuses — honest about what we know
  const websiteStatus: string = hasWebsite
    ? isActive ? 'published' : isOnboarding ? 'building' : 'unknown'
    : 'not_included';

  const contentStatus: string = hasContent
    ? isActive ? 'active' : 'not_started'
    : 'not_included';

  const telemetryStatus: string = hasTelemetry
    ? isActive && client.healthStatus === 'green' ? 'connected' : isOnboarding ? 'pending' : 'unknown'
    : 'not_included';

  const optimisationStatus: string = isActive && client.healthStatus === 'green' && hasSeo
    ? 'active'
    : isActive ? 'pending'
    : 'not_started';

  const portalStatus: string = hasPortal
    ? isActive ? 'live' : 'pending'
    : 'not_included';

  // Data quality: if we have a tenantId, we're more confident; otherwise derived
  const tenantId = prov?.tenantId ?? (client as any).tenantId;
  const dataQuality: AISystemsDataQuality = tenantId ? 'derived' : 'unavailable';

  return {
    tenantId,
    lifecycleState: prov?.status ?? deliveryStatus,
    deliveryStatus,
    websiteStatus,
    contentStatus,
    telemetryStatus,
    optimisationStatus,
    portalStatus,
    healthStatus: client.healthStatus,
    activeModules: allModules,
    lastRefreshed: client.updatedAt ? new Date(client.updatedAt).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : undefined,
    dataQuality,
    dataQualityNote: dataQuality === 'unavailable'
      ? 'AI Systems data not yet connected — showing inferences from Momentum data only'
      : 'Derived from Momentum-synced fields. Full AI Systems API connection pending.',
  };
}

// ── Derive from Lead (pre-provisioning) ───────────────────────────────────────

export function deriveAISystemsStateFromLead(lead: Lead): AISystemsSideState {
  const os = (lead as any).onboardingState as OnboardingState | undefined;
  const prov: ProvisioningTriggerState | undefined = os?.provisioning;

  const selectedModules: string[] = os?.selectedModules?.modules
    ?.filter(m => m.timing === 'now')
    ?.map(m => m.key) ?? [];

  const tenantId = prov?.tenantId;

  let deliveryStatus = 'not_started';
  if (prov?.status === 'succeeded') deliveryStatus = 'provisioned';
  else if (prov?.status === 'submitted' || prov?.status === 'pending') deliveryStatus = 'provisioning';
  else if (prov?.status === 'failed') deliveryStatus = 'failed';

  const dataQuality: AISystemsDataQuality = tenantId ? 'derived' : 'unavailable';

  return {
    tenantId,
    lifecycleState: prov?.status ?? 'not_triggered',
    deliveryStatus,
    websiteStatus: prov?.status === 'succeeded' ? 'building' : 'not_started',
    contentStatus: 'not_started',
    telemetryStatus: 'not_started',
    optimisationStatus: 'not_started',
    portalStatus: 'not_started',
    healthStatus: undefined,
    activeModules: selectedModules,
    dataQuality,
    dataQualityNote: tenantId
      ? `Tenant ${tenantId} created — delivery-side data pending sync`
      : 'No tenant provisioned yet. AI Systems data not available.',
  };
}

// ── Portfolio-level AI Systems summary ────────────────────────────────────────

export interface AISystemsPortfolioSummary {
  totalTenants: number;
  activeDelivery: number;
  onboarding: number;
  blocked: number;
  telemetryConnected: number;
  optimisationActive: number;
  portalLive: number;
  dataQuality: AISystemsDataQuality;
}

export function deriveAISystemsPortfolioSummary(clients: Client[]): AISystemsPortfolioSummary {
  const states = clients.filter(c => !c.archived).map(deriveAISystemsStateFromClient);

  return {
    totalTenants: states.filter(s => s.tenantId).length,
    activeDelivery: states.filter(s => s.deliveryStatus === 'active').length,
    onboarding: states.filter(s => s.deliveryStatus === 'onboarding').length,
    blocked: states.filter(s => s.deliveryStatus === 'blocked').length,
    telemetryConnected: states.filter(s => s.telemetryStatus === 'connected').length,
    optimisationActive: states.filter(s => s.optimisationStatus === 'active').length,
    portalLive: states.filter(s => s.portalStatus === 'live').length,
    dataQuality: 'derived',
  };
}

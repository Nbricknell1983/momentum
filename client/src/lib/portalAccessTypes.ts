// =============================================================================
// CLIENT PORTAL ACCESS — Domain Model
// =============================================================================
// All types for the client portal access layer:
// access control, share links, invites, visibility rules, digest scheduling,
// delivery tracking, audit logging.
// =============================================================================

// ─── Access status ────────────────────────────────────────────────────────────

export type PortalAccessStatus = 'active' | 'revoked' | 'expired' | 'pending';
export type PortalUserRole = 'client_primary' | 'client_viewer';

// ─── Share links ──────────────────────────────────────────────────────────────

export interface PortalShareLink {
  token:            string;          // UUID — used as Firestore doc ID in portalTokens/
  label:            string;          // e.g. "Primary contact link"
  createdAt:        string;          // ISO date
  expiresAt?:       string;          // ISO date — optional, undefined = permanent
  createdBy:        string;          // userId of admin who created it
  status:           PortalAccessStatus;
  revokedAt?:       string;          // ISO date
  lastAccessedAt?:  string;          // ISO date — updated on each portal view
  accessCount:      number;          // how many times the portal has been opened
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export type PortalInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface PortalInvite {
  id:           string;
  email:        string;
  name:         string;
  role:         PortalUserRole;
  createdAt:    string;
  expiresAt?:   string;
  status:       PortalInviteStatus;
  sentAt?:      string;
  acceptedAt?:  string;
  revokedAt?:   string;
  invitedBy:    string;              // userId
  message?:     string;              // optional personal message to include in invite
}

// ─── Access log ───────────────────────────────────────────────────────────────

export type PortalAccessLogAction =
  | 'link_created'
  | 'link_revoked'
  | 'link_accessed'
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_revoked'
  | 'access_enabled'
  | 'access_disabled'
  | 'digest_previewed'
  | 'digest_sent'
  | 'visibility_updated'
  | 'digest_config_updated';

export interface PortalAccessLog {
  id:         string;
  timestamp:  string;               // ISO date
  action:     PortalAccessLogAction;
  actorType:  'admin' | 'client';
  actorId?:   string;
  actorLabel: string;               // display label: user email or "Client (share link)"
  detail:     string;               // human-readable summary
}

// ─── Visibility rules ─────────────────────────────────────────────────────────

export interface PortalVisibilityRule {
  sections: {
    delivery:         boolean;
    performance:      boolean;
    milestones:       boolean;
    nextActions:      boolean;
    optimisation:     boolean;
    strategyAlignment: boolean;
  };
  showHealthScore: boolean;
  showMRR:         boolean;
  customWelcomeMessage?: string;
  customBrandName?:     string;
}

export const DEFAULT_VISIBILITY_RULES: PortalVisibilityRule = {
  sections: {
    delivery:         true,
    performance:      true,
    milestones:       true,
    nextActions:      true,
    optimisation:     true,
    strategyAlignment: true,
  },
  showHealthScore:  true,
  showMRR:          false,
};

// ─── Digest schedule ──────────────────────────────────────────────────────────

export type DigestCadence = 'weekly' | 'monthly' | 'milestone_only' | 'disabled';
export type DigestDeliveryDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

export interface DigestSchedule {
  cadence:        DigestCadence;
  enabled:        boolean;
  deliveryDay?:   DigestDeliveryDay; // for weekly
  deliveryHour?:  number;            // 0–23 AEST
  lastSentAt?:    string;            // ISO date
  nextDueAt?:     string;            // ISO date — computed
}

// ─── Digest type ──────────────────────────────────────────────────────────────

export type DigestType = 'weekly' | 'monthly' | 'milestone' | 'approval_reminder' | 'missing_input';

// ─── Client update digest ─────────────────────────────────────────────────────

export interface ClientUpdateDigest {
  id:                    string;
  clientId:              string;
  businessName:          string;
  type:                  DigestType;
  period:                string;          // "Week ending 24 Mar 2026"
  subject:               string;          // email subject line
  previewText:           string;          // email preview snippet
  completedThisPeriod:   string[];        // what was done
  inProgress:            string[];        // what is underway
  comingNext:            string[];        // what is scheduled
  clientActionsNeeded:   string[];        // what the client must do
  keyWins:               string[];        // standout positive results
  healthSummary:         string;          // 1–2 sentence health snapshot
  deliveryPhaseLabel:    string;          // "Live & Growing"
  ctaPrompt?:            string;          // call to action text
  portalUrl?:            string;          // the share link URL if available
  generatedAt:           string;          // ISO date
}

// ─── Digest delivery record ───────────────────────────────────────────────────

export type DigestDeliveryStatus = 'generated' | 'delivered' | 'failed' | 'preview';

export interface DigestDeliveryRecord {
  id:               string;
  type:             DigestType;
  generatedAt:      string;
  deliveredAt?:     string;
  deliveryChannel:  'email' | 'portal' | 'preview';
  status:           DigestDeliveryStatus;
  snapshotSummary:  string;           // one-line: "3 channels live · 2 actions pending"
  recipientEmail?:  string;
  failureReason?:   string;
}

// ─── Portal session policy ────────────────────────────────────────────────────

export interface PortalSessionPolicy {
  requireEmailVerification: boolean;
  allowShareLinks:          boolean;
  sessionDurationHours:     number;    // 0 = permanent
  enforceIPRestriction:     boolean;
  allowedIPs?:              string[];
}

export const DEFAULT_SESSION_POLICY: PortalSessionPolicy = {
  requireEmailVerification: false,
  allowShareLinks:          true,
  sessionDurationHours:     0,
  enforceIPRestriction:     false,
};

// ─── Client portal config ─────────────────────────────────────────────────────

export interface ClientPortalConfig {
  clientId:        string;
  orgId:           string;
  accessEnabled:   boolean;
  shareLinks:      PortalShareLink[];
  invites:         PortalInvite[];
  visibilityRules: PortalVisibilityRule;
  digestSchedule:  DigestSchedule;
  deliveryHistory: DigestDeliveryRecord[];
  accessLog:       PortalAccessLog[];    // last 50 entries
  sessionPolicy:   PortalSessionPolicy;
  updatedAt:       string;
}

export const DEFAULT_PORTAL_CONFIG = (clientId: string, orgId: string): ClientPortalConfig => ({
  clientId,
  orgId,
  accessEnabled:   false,
  shareLinks:      [],
  invites:         [],
  visibilityRules: DEFAULT_VISIBILITY_RULES,
  digestSchedule:  { cadence: 'weekly', enabled: false, deliveryDay: 'monday', deliveryHour: 8 },
  deliveryHistory: [],
  accessLog:       [],
  sessionPolicy:   DEFAULT_SESSION_POLICY,
  updatedAt:       new Date().toISOString(),
});

// ─── Portal token record (Firestore: portalTokens/{token}) ───────────────────

export interface PortalTokenRecord {
  token:     string;
  orgId:     string;
  clientId:  string;
  label:     string;
  createdAt: string;
  expiresAt?: string;
  status:    PortalAccessStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isLinkActive(link: PortalShareLink): boolean {
  if (link.status !== 'active') return false;
  if (!link.expiresAt) return true;
  return new Date(link.expiresAt) > new Date();
}

export function isInviteActive(invite: PortalInvite): boolean {
  if (invite.status === 'revoked') return false;
  if (invite.status === 'accepted') return true;
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return false;
  return invite.status === 'pending';
}

export function getActiveLinks(config: ClientPortalConfig): PortalShareLink[] {
  return config.shareLinks.filter(isLinkActive);
}

export function getActiveInvites(config: ClientPortalConfig): PortalInvite[] {
  return config.invites.filter(isInviteActive);
}

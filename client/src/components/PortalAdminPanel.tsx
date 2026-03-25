/**
 * PortalAdminPanel
 *
 * Internal admin panel for managing a client's portal access.
 * Tabs: Links · Invites · Visibility · Digest · Log
 *
 * This is admin-only. Clients never see this panel.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import {
  Link2, Mail, Eye as EyeIcon, Bell, ClipboardList, Plus, Copy, Trash2,
  Shield, CheckCircle2, AlertCircle, Send, ExternalLink, ToggleLeft, ToggleRight,
  Globe, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { Client } from '@/lib/types';
import type {
  ClientPortalConfig, PortalShareLink, PortalInvite,
  PortalVisibilityRule, DigestCadence, DigestDeliveryDay,
  DigestType, ClientUpdateDigest,
} from '@/lib/portalAccessTypes';
import { DEFAULT_PORTAL_CONFIG, isLinkActive } from '@/lib/portalAccessTypes';
import { deriveClientDashboard } from '@/lib/clientCommandAdapter';
import { deriveClientDigest } from '@/lib/digestAdapter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return '—'; }
}

function copyToClipboard(text: string, toast: ReturnType<typeof useToast>['toast']) {
  navigator.clipboard.writeText(text).then(() => {
    toast({ description: 'Copied to clipboard', duration: 2000 });
  });
}

// ─── API fetcher ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers },
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || res.statusText); }
  return res.json();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TabBtn({ id, label, icon: Icon, active, onClick }: {
  id: string; label: string; icon: typeof Globe; active: boolean; onClick: () => void;
}) {
  return (
    <button
      data-testid={`portal-tab-${id}`}
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
        active
          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

// ─── LINKS TAB ────────────────────────────────────────────────────────────────

function LinksTab({ config, clientId, orgId, onRefresh }: {
  config: ClientPortalConfig; clientId: string; orgId: string; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState<'never' | '7d' | '30d' | '90d'>('never');

  const origin = window.location.origin;

  const createLink = useMutation({
    mutationFn: () => apiFetch(`/api/portal/config/${clientId}/links`, {
      method: 'POST',
      body: JSON.stringify({ label: label || 'Client portal link', expiry }),
    }),
    onSuccess: () => {
      toast({ description: 'Share link created' });
      setLabel('');
      onRefresh();
      qc.invalidateQueries({ queryKey: ['/api/portal/config', clientId] });
    },
    onError: (e: any) => toast({ description: e.message, variant: 'destructive' }),
  });

  const revokeLink = useMutation({
    mutationFn: (token: string) => apiFetch(`/api/portal/config/${clientId}/links/${token}`, { method: 'DELETE' }),
    onSuccess: () => { toast({ description: 'Link revoked' }); onRefresh(); qc.invalidateQueries({ queryKey: ['/api/portal/config', clientId] }); },
    onError: (e: any) => toast({ description: e.message, variant: 'destructive' }),
  });

  const activeLinks = config.shareLinks.filter(isLinkActive);
  const inactiveLinks = config.shareLinks.filter(l => !isLinkActive(l));

  return (
    <div className="space-y-4">
      {/* Enable/disable portal access */}
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Portal access</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {config.accessEnabled ? 'Clients can access their portal via any active link.' : 'Portal is disabled — all links and invites are inactive.'}
          </p>
        </div>
        <Badge variant={config.accessEnabled ? 'default' : 'outline'}
          className={config.accessEnabled ? 'bg-emerald-600 text-white' : ''}>
          {config.accessEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      {/* Create new link */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Create share link</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Link label (e.g. Primary contact)"
            className="flex-1 h-8 px-3 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            data-testid="input-portal-link-label"
          />
          <select
            value={expiry}
            onChange={e => setExpiry(e.target.value as any)}
            className="h-8 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          >
            <option value="never">No expiry</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
          <Button
            size="sm" className="h-8 text-xs"
            disabled={createLink.isPending}
            onClick={() => createLink.mutate()}
            data-testid="btn-create-portal-link"
          >
            <Plus className="w-3 h-3 mr-1" />
            Create
          </Button>
        </div>
      </div>

      {/* Active links */}
      {activeLinks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Active links ({activeLinks.length})</p>
          {activeLinks.map(link => (
            <div key={link.token} data-testid={`portal-link-${link.token.slice(0, 8)}`}
              className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{link.label}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-mono">
                    {origin}/share/{link.token}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-zinc-400">Created {fmtDate(link.createdAt)}</span>
                    {link.expiresAt && <span className="text-[10px] text-amber-500">Expires {fmtDate(link.expiresAt)}</span>}
                    {link.accessCount > 0 && <span className="text-[10px] text-zinc-400">{link.accessCount} view{link.accessCount !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => copyToClipboard(`${origin}/share/${link.token}`, toast)}
                    data-testid="btn-copy-portal-link"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500"
                    onClick={() => revokeLink.mutate(link.token)}
                    disabled={revokeLink.isPending}
                    data-testid="btn-revoke-portal-link"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inactive links */}
      {inactiveLinks.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Revoked / expired ({inactiveLinks.length})</p>
          {inactiveLinks.slice(0, 3).map(link => (
            <div key={link.token} className="p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800 opacity-50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{link.label}</p>
                <Badge variant="outline" className="text-[10px]">{link.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {config.shareLinks.length === 0 && (
        <div className="text-center py-8 text-zinc-400 dark:text-zinc-600">
          <Link2 className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No share links yet. Create one above.</p>
        </div>
      )}
    </div>
  );
}

// ─── INVITES TAB ──────────────────────────────────────────────────────────────

function InvitesTab({ config, clientId, onRefresh }: {
  config: ClientPortalConfig; clientId: string; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const sendInvite = useMutation({
    mutationFn: () => apiFetch(`/api/portal/config/${clientId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email, name, message }),
    }),
    onSuccess: () => {
      toast({ description: 'Invite created — email delivery requires email service setup' });
      setEmail(''); setName(''); setMessage('');
      onRefresh();
      qc.invalidateQueries({ queryKey: ['/api/portal/config', clientId] });
    },
    onError: (e: any) => toast({ description: e.message, variant: 'destructive' }),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/portal/config/${clientId}/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast({ description: 'Invite revoked' }); onRefresh(); qc.invalidateQueries({ queryKey: ['/api/portal/config', clientId] }); },
    onError: (e: any) => toast({ description: e.message, variant: 'destructive' }),
  });

  const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    revoked: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
    expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  };

  return (
    <div className="space-y-4">
      {/* Email delivery note */}
      <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Invites are recorded here. Actual email delivery requires an email service (SendGrid/Mailgun) configured in environment secrets.
          </p>
        </div>
      </div>

      {/* Create invite */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-2">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Invite client contact</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Contact name"
            className="h-8 px-3 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            data-testid="input-invite-name" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address"
            className="h-8 px-3 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            data-testid="input-invite-email" />
        </div>
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Personal message (optional)"
          rows={2}
          className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
        />
        <Button size="sm" className="h-8 text-xs"
          disabled={!email || !name || sendInvite.isPending}
          onClick={() => sendInvite.mutate()}
          data-testid="btn-send-invite"
        >
          <Send className="w-3 h-3 mr-1" />
          Create invite
        </Button>
      </div>

      {/* Existing invites */}
      {config.invites.length > 0 ? (
        <div className="space-y-2">
          {config.invites.map(invite => (
            <div key={invite.id} data-testid={`invite-${invite.id}`}
              className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{invite.name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[invite.status]}`}>
                      {invite.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{invite.email}</p>
                  {invite.createdAt && <p className="text-[10px] text-zinc-400 mt-0.5">Invited {fmtDate(invite.createdAt)}</p>}
                </div>
                {invite.status !== 'revoked' && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 flex-shrink-0"
                    onClick={() => revokeInvite.mutate(invite.id)}
                    disabled={revokeInvite.isPending}
                    data-testid={`btn-revoke-invite-${invite.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-400 dark:text-zinc-600">
          <Mail className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No invites sent yet.</p>
        </div>
      )}
    </div>
  );
}

// ─── VISIBILITY TAB ───────────────────────────────────────────────────────────

function VisibilityTab({ config, clientId, onRefresh }: {
  config: ClientPortalConfig; clientId: string; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rules, setRules] = useState<PortalVisibilityRule>(config.visibilityRules);
  const [customWelcome, setCustomWelcome] = useState(config.visibilityRules.customWelcomeMessage || '');
  const [customBrand, setCustomBrand] = useState(config.visibilityRules.customBrandName || '');
  const [saving, setSaving] = useState(false);

  const SECTION_LABELS: Record<string, string> = {
    delivery: 'Delivery progress (channel statuses, build phase)',
    performance: 'Performance metrics (visibility score, key metrics)',
    milestones: 'Milestone timeline',
    nextActions: 'Your Actions (what the client needs to do)',
    optimisation: 'Optimisation activity feed',
    strategyAlignment: 'Strategy alignment (planned / delivered / upcoming)',
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/portal/config/${clientId}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ ...rules, customWelcomeMessage: customWelcome, customBrandName: customBrand }),
      });
      toast({ description: 'Visibility rules saved' });
      onRefresh();
      qc.invalidateQueries({ queryKey: ['/api/portal/config', clientId] });
    } catch (e: any) {
      toast({ description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Control exactly what this client can see in their portal. Changes take effect immediately.
      </p>

      {/* Section toggles */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Dashboard sections</p>
        {Object.entries(SECTION_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-700 dark:text-zinc-300">{label}</p>
            <Switch
              checked={(rules.sections as any)[key]}
              onCheckedChange={v => setRules(r => ({ ...r, sections: { ...r.sections, [key]: v } }))}
              data-testid={`toggle-visibility-${key}`}
            />
          </div>
        ))}
      </div>

      {/* Data toggles */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Data controls</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-700 dark:text-zinc-300">Show health score (0–100 ring)</p>
          <Switch checked={rules.showHealthScore} onCheckedChange={v => setRules(r => ({ ...r, showHealthScore: v }))} data-testid="toggle-show-health-score" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-700 dark:text-zinc-300">Show monthly investment (MRR)</p>
          <Switch checked={rules.showMRR} onCheckedChange={v => setRules(r => ({ ...r, showMRR: v }))} data-testid="toggle-show-mrr" />
        </div>
      </div>

      {/* Customisation */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Portal customisation</p>
        <div className="space-y-2">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">Custom welcome message</label>
          <textarea rows={2} value={customWelcome} onChange={e => setCustomWelcome(e.target.value)}
            placeholder="Welcome! Here's your personalised digital growth update."
            className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">Custom brand name in portal header</label>
          <input type="text" value={customBrand} onChange={e => setCustomBrand(e.target.value)}
            placeholder="e.g. Your Agency Name"
            className="w-full h-8 px-3 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      <Button size="sm" className="text-xs w-full" disabled={saving} onClick={save} data-testid="btn-save-visibility">
        {saving ? 'Saving…' : 'Save visibility rules'}
      </Button>
    </div>
  );
}

// ─── DIGEST TAB ───────────────────────────────────────────────────────────────

function DigestTab({ config, clientId, client, onRefresh }: {
  config: ClientPortalConfig; clientId: string; client: Client; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cadence, setCadence] = useState<DigestCadence>(config.digestSchedule.cadence);
  const [enabled, setEnabled] = useState(config.digestSchedule.enabled);
  const [deliveryDay, setDeliveryDay] = useState<DigestDeliveryDay>(config.digestSchedule.deliveryDay || 'monday');
  const [previewType, setPreviewType] = useState<DigestType>('weekly');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeLink = config.shareLinks.find(l => l.status === 'active' && (!l.expiresAt || new Date(l.expiresAt) > new Date()));
  const portalUrl = activeLink ? `${window.location.origin}/share/${activeLink.token}` : undefined;

  const digest = useMemo(() => {
    const dashboard = deriveClientDashboard(client);
    return deriveClientDigest(dashboard, previewType, portalUrl);
  }, [client, previewType, portalUrl]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/portal/config/${clientId}/digest`, {
        method: 'PATCH',
        body: JSON.stringify({ cadence, enabled, deliveryDay }),
      });
      toast({ description: 'Digest schedule saved' });
      onRefresh();
      qc.invalidateQueries({ queryKey: ['/api/portal/config', clientId] });
    } catch (e: any) {
      toast({ description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const CADENCE_OPTIONS: { value: DigestCadence; label: string }[] = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'milestone_only', label: 'Milestone events only' },
    { value: 'disabled', label: 'Disabled' },
  ];

  const DIGEST_TYPE_OPTIONS: { value: DigestType; label: string }[] = [
    { value: 'weekly', label: 'Weekly update' },
    { value: 'monthly', label: 'Monthly report' },
    { value: 'milestone', label: 'Milestone reached' },
    { value: 'approval_reminder', label: 'Approval reminder' },
    { value: 'missing_input', label: 'Missing input reminder' },
  ];

  return (
    <div className="space-y-4">
      {/* Schedule config */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Digest schedule</p>
          <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="toggle-digest-enabled" />
        </div>

        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Cadence</label>
                <select value={cadence} onChange={e => setCadence(e.target.value as DigestCadence)}
                  className="w-full mt-1 h-8 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  data-testid="select-digest-cadence"
                >
                  {CADENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {cadence === 'weekly' && (
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Send on</label>
                  <select value={deliveryDay} onChange={e => setDeliveryDay(e.target.value as DigestDeliveryDay)}
                    className="w-full mt-1 h-8 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  >
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(d => (
                      <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {config.digestSchedule.lastSentAt && (
              <p className="text-[10px] text-zinc-400">Last sent: {fmtDate(config.digestSchedule.lastSentAt)}</p>
            )}
          </>
        )}

        <Button size="sm" className="text-xs" disabled={saving} onClick={save} data-testid="btn-save-digest">
          {saving ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>

      {/* Email delivery note */}
      <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Digest generation is fully built. Email delivery requires SendGrid or Mailgun configured in environment secrets.
            Previews are available below for review before any delivery is set up.
          </p>
        </div>
      </div>

      {/* Digest preview */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Preview digest</p>
          <select value={previewType} onChange={e => setPreviewType(e.target.value as DigestType)}
            className="h-7 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            data-testid="select-digest-type"
          >
            {DIGEST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <Button variant="outline" size="sm" className="text-xs w-full"
          onClick={() => setShowPreview(v => !v)}
          data-testid="btn-toggle-digest-preview"
        >
          <EyeIcon className="w-3 h-3 mr-1" />
          {showPreview ? 'Hide preview' : 'Show digest preview'}
        </Button>
        {showPreview && <DigestPreview digest={digest} />}
      </div>

      {/* Delivery history */}
      {config.deliveryHistory.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Recent deliveries</p>
          {config.deliveryHistory.slice(0, 5).map(rec => (
            <div key={rec.id} className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
              <div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300">{rec.type} · {rec.snapshotSummary}</p>
                <p className="text-[10px] text-zinc-400">{fmtDate(rec.generatedAt)}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{rec.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DigestPreview({ digest }: { digest: ClientUpdateDigest }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden text-xs">
      {/* Email header */}
      <div className="bg-violet-600 text-white px-4 py-3">
        <p className="font-bold text-sm">{digest.subject}</p>
        <p className="opacity-70 text-[10px] mt-0.5">{digest.previewText}</p>
      </div>

      <div className="p-4 space-y-4 bg-white dark:bg-zinc-950">
        <div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Period</p>
          <p className="text-zinc-700 dark:text-zinc-300">{digest.period}</p>
        </div>

        {digest.keyWins.length > 0 && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1.5">Key Wins</p>
            {digest.keyWins.map((w, i) => <p key={i} className="text-xs text-emerald-800 dark:text-emerald-300">✓ {w}</p>)}
          </div>
        )}

        {digest.completedThisPeriod.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Completed</p>
            {digest.completedThisPeriod.map((c, i) => <p key={i} className="text-zinc-600 dark:text-zinc-400">• {c}</p>)}
          </div>
        )}

        {digest.inProgress.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1.5">In Progress</p>
            {digest.inProgress.map((c, i) => <p key={i} className="text-zinc-600 dark:text-zinc-400">→ {c}</p>)}
          </div>
        )}

        {digest.comingNext.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Coming Next</p>
            {digest.comingNext.map((c, i) => <p key={i} className="text-zinc-600 dark:text-zinc-400">⏳ {c}</p>)}
          </div>
        )}

        {digest.clientActionsNeeded.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1.5">Your Actions</p>
            {digest.clientActionsNeeded.map((a, i) => <p key={i} className="text-xs text-amber-800 dark:text-amber-300">{a}</p>)}
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Health</p>
          <p className="text-zinc-600 dark:text-zinc-400">{digest.healthSummary}</p>
        </div>

        {digest.ctaPrompt && (
          <div className="text-center py-2">
            <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">{digest.ctaPrompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LOG TAB ──────────────────────────────────────────────────────────────────

function LogTab({ config }: { config: ClientPortalConfig }) {
  const ACTION_ICONS: Record<string, typeof Globe> = {
    link_created: Link2, link_revoked: Trash2, link_accessed: ExternalLink,
    invite_sent: Mail, invite_accepted: CheckCircle2, invite_revoked: Trash2,
    access_enabled: ToggleRight, access_disabled: ToggleLeft,
    digest_sent: Send, visibility_updated: Eye, digest_config_updated: Bell,
    digest_previewed: EyeIcon,
  };

  const ACTION_COLORS: Record<string, string> = {
    link_accessed: 'text-blue-500', digest_sent: 'text-emerald-500',
    link_revoked: 'text-red-500', invite_revoked: 'text-red-500',
    access_disabled: 'text-red-500', invite_accepted: 'text-emerald-500',
  };

  return (
    <div className="space-y-1">
      {config.accessLog.length === 0 && (
        <div className="text-center py-8 text-zinc-400 dark:text-zinc-600">
          <ClipboardList className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No activity logged yet.</p>
        </div>
      )}
      {config.accessLog.map(entry => {
        const Icon = ACTION_ICONS[entry.action] || ClipboardList;
        const colorClass = ACTION_COLORS[entry.action] || 'text-zinc-400';
        return (
          <div key={entry.id} className="flex items-start gap-2.5 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${colorClass}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{entry.detail}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{entry.actorLabel} · {fmtDate(entry.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type PortalTab = 'links' | 'invites' | 'visibility' | 'digest' | 'log';

const TABS: { id: PortalTab; label: string; icon: typeof Globe }[] = [
  { id: 'links',      label: 'Links',      icon: Link2 },
  { id: 'invites',    label: 'Invites',    icon: Mail },
  { id: 'visibility', label: 'Visibility', icon: EyeOff },
  { id: 'digest',     label: 'Digest',     icon: Bell },
  { id: 'log',        label: 'Log',        icon: ClipboardList },
];

interface PortalAdminPanelProps {
  client: Client;
}

export function PortalAdminPanel({ client }: PortalAdminPanelProps) {
  const [tab, setTab] = useState<PortalTab>('links');
  const { orgId } = useAuth();
  const qc = useQueryClient();

  const { data: config, isLoading, error, refetch } = useQuery<ClientPortalConfig>({
    queryKey: ['/api/portal/config', client.id],
    queryFn: () => apiFetch(`/api/portal/config/${client.id}`),
    retry: 1,
  });

  const enablePortal = useMutation({
    mutationFn: (enabled: boolean) => apiFetch(`/api/portal/config/${client.id}`, {
      method: 'POST',
      body: JSON.stringify({ accessEnabled: enabled }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/portal/config', client.id] }); refetch(); },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-xs text-zinc-400">Loading portal config…</div>
      </div>
    );
  }

  const cfg = config || DEFAULT_PORTAL_CONFIG(client.id, orgId || '');
  const activeLinks = cfg.shareLinks.filter(isLinkActive);

  return (
    <div className="flex flex-col h-full" data-testid="portal-admin-panel">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-2 flex-1">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Portal Admin</span>
          <Badge variant={cfg.accessEnabled ? 'default' : 'outline'}
            className={['text-[10px]', cfg.accessEnabled ? 'bg-emerald-600 text-white' : ''].join(' ')}>
            {cfg.accessEnabled ? 'Active' : 'Disabled'}
          </Badge>
          {activeLinks.length > 0 && (
            <span className="text-[10px] text-zinc-400">{activeLinks.length} active link{activeLinks.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <Button
          size="sm" variant={cfg.accessEnabled ? 'outline' : 'default'}
          className={['h-6 text-[10px]', !cfg.accessEnabled ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'text-red-600 border-red-200 hover:bg-red-50'].join(' ')}
          disabled={enablePortal.isPending}
          onClick={() => enablePortal.mutate(!cfg.accessEnabled)}
          data-testid="btn-toggle-portal-access"
        >
          {cfg.accessEnabled ? 'Disable portal' : 'Enable portal'}
        </Button>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/10 overflow-x-auto">
        {TABS.map(t => (
          <TabBtn key={t.id} id={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'links'      && <LinksTab config={cfg} clientId={client.id} orgId={orgId || ''} onRefresh={refetch} />}
        {tab === 'invites'    && <InvitesTab config={cfg} clientId={client.id} onRefresh={refetch} />}
        {tab === 'visibility' && <VisibilityTab config={cfg} clientId={client.id} onRefresh={refetch} />}
        {tab === 'digest'     && <DigestTab config={cfg} clientId={client.id} client={client} onRefresh={refetch} />}
        {tab === 'log'        && <LogTab config={cfg} />}
      </div>
    </div>
  );
}

export default PortalAdminPanel;

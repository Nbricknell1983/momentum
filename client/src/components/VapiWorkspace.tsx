// =============================================================================
// MOMENTUM VAPI — VOICE AGENT WORKSPACE
// =============================================================================
// Internal inspection workspace for the Vapi voice agent layer.
// Tabs: Configuration | Call Health | Recent Calls | Intent Library | Tool Audit | Missing Setup
// =============================================================================

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import {
  Phone, PhoneCall, PhoneOff, Mic, MicOff, Settings, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Shield,
  BookOpen, Activity, Wrench, Info, BarChart3, Zap, Copy
} from 'lucide-react';
import { Badge }   from '@/components/ui/badge';
import { Button }  from '@/components/ui/button';
import { Card }    from '@/components/ui/card';
import { Switch }  from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { auth as firebaseAuth } from '@/lib/firebase';
import { INTENT_DEFINITIONS } from '@/lib/vapiIntents';
import { VAPI_TOOLS } from '@/lib/vapiTypes';
import type { VapiCallRecord, VapiCallOutcome, VapiCallStatus, VapiCallIntent, VapiPolicyMode } from '@/lib/vapiTypes';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Colours / labels
// ---------------------------------------------------------------------------

const OUTCOME_LABELS: Record<VapiCallOutcome, string> = {
  meeting_booked:        'Meeting Booked',
  callback_requested:    'Callback Requested',
  not_interested:        'Not Interested',
  voicemail_left:        'Voicemail Left',
  no_answer:             'No Answer',
  objection_logged:      'Objection Logged',
  lead_qualified:        'Lead Qualified',
  lead_disqualified:     'Lead Disqualified',
  referral_given:        'Referral Given',
  intervention_succeeded:'Intervention Succeeded',
  intervention_failed:   'Intervention Failed',
  follow_up_required:    'Follow-Up Required',
  escalated_to_human:    'Escalated to Human',
  inbound_lead_created:  'Inbound Lead Created',
  unknown:               'Unknown',
};

const OUTCOME_COLOUR: Record<string, string> = {
  meeting_booked:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  callback_requested:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  not_interested:         'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  voicemail_left:         'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  no_answer:              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  lead_qualified:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  lead_disqualified:      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  referral_given:         'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  intervention_succeeded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  intervention_failed:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  escalated_to_human:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  follow_up_required:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  inbound_lead_created:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  unknown:                'bg-gray-100 text-gray-500',
};

const STATUS_COLOUR: Record<VapiCallStatus, string> = {
  initiated:   'bg-gray-100 text-gray-700',
  ringing:     'bg-blue-100 text-blue-700',
  'in-progress': 'bg-green-100 text-green-700',
  forwarding:  'bg-yellow-100 text-yellow-700',
  ended:       'bg-gray-200 text-gray-600',
  failed:      'bg-red-100 text-red-700',
};

const INTENT_LABELS: Record<VapiCallIntent, string> = {
  outbound_prospecting:       'Outbound Prospecting',
  appointment_setting:        'Appointment Setting',
  discovery_qualification:    'Discovery / Qualification',
  strategy_follow_up:         'Strategy Follow-Up',
  proposal_follow_up:         'Proposal Follow-Up',
  dormant_lead_reactivation:  'Dormant Lead Reactivation',
  churn_intervention:         'Churn Intervention',
  referral_ask:               'Referral Ask',
  inbound_lead_capture:       'Inbound Lead Capture',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VapiWorkspace() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId: authOrgId } = useAuth();
  const orgId = authOrgId ?? '';
  const [token, setToken] = useState('');
  useEffect(() => {
    firebaseAuth.currentUser?.getIdToken().then(t => setToken(t)).catch(() => {});
  }, [orgId]);

  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [expandedIntent, setExpandedIntent] = useState<VapiCallIntent | null>(null);
  const [configDirty, setConfigDirty] = useState(false);
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  const healthQ = useQuery({
    queryKey: ['/api/vapi/health', token],
    queryFn:  () => apiFetch('/api/vapi/health', token),
    staleTime: 30_000,
  });

  const configQ = useQuery({
    queryKey: ['/api/vapi/orgs', orgId, 'config'],
    queryFn:  () => apiFetch(`/api/vapi/orgs/${orgId}/config`, token),
    enabled:  !!orgId && !!token,
    staleTime: 60_000,
  });

  const callsQ = useQuery({
    queryKey: ['/api/vapi/orgs', orgId, 'calls'],
    queryFn:  () => apiFetch(`/api/vapi/orgs/${orgId}/calls`, token),
    enabled:  !!orgId && !!token,
    refetchInterval: 30_000,
  });

  // -------------------------------------------------------------------------
  // Sync local config when server config loads
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (configQ.data) {
      setLocalConfig(configQ.data);
      setConfigDirty(false);
    }
  }, [configQ.data]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const saveConfigMut = useMutation({
    mutationFn: () => apiFetch(`/api/vapi/orgs/${orgId}/config`, token, {
      method: 'POST',
      body:   JSON.stringify(localConfig),
    }),
    onSuccess: () => {
      toast({ title: 'Configuration saved' });
      qc.invalidateQueries({ queryKey: ['/api/orgs', orgId, 'vapi', 'config'] });
      setConfigDirty(false);
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  function updateConfig(key: string, value: unknown) {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setConfigDirty(true);
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const health = healthQ.data ?? {};
  const calls  = (callsQ.data?.calls ?? []) as VapiCallRecord[];
  const configured = health.configured ?? false;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function formatDuration(seconds?: number) {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  function formatDate(iso?: string) {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm'); } catch { return iso; }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => toast({ title: 'Copied' }));
  }

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="vapi-workspace">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <Phone className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Vapi Voice Agent</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Momentum voice interface layer — outbound and inbound call management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {configured ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Configured
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
              <AlertTriangle className="w-3 h-3 mr-1" /> Setup Required
            </Badge>
          )}
        </div>
      </div>

      {/* Not-configured banner */}
      {!configured && !healthQ.isLoading && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-300">Vapi not configured — voice calls will not work</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                See the <span className="font-semibold">Missing Setup</span> tab for the exact environment secrets required.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="configuration">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="configuration"  data-testid="tab-configuration"><Settings className="w-4 h-4 mr-1.5" />Configuration</TabsTrigger>
          <TabsTrigger value="health"         data-testid="tab-health"><Activity className="w-4 h-4 mr-1.5" />Call Health</TabsTrigger>
          <TabsTrigger value="calls"          data-testid="tab-calls"><PhoneCall className="w-4 h-4 mr-1.5" />Recent Calls</TabsTrigger>
          <TabsTrigger value="intents"        data-testid="tab-intents"><BookOpen className="w-4 h-4 mr-1.5" />Intent Library</TabsTrigger>
          <TabsTrigger value="tools"          data-testid="tab-tools"><Wrench className="w-4 h-4 mr-1.5" />Tool Boundaries</TabsTrigger>
          <TabsTrigger value="missing"        data-testid="tab-missing"><AlertTriangle className="w-4 h-4 mr-1.5" />Missing Setup</TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* CONFIGURATION TAB                                                 */}
        {/* ================================================================ */}
        <TabsContent value="configuration" className="mt-4 space-y-4">
          <Card className="p-5 space-y-5">
            <h2 className="font-semibold text-gray-900 dark:text-white">Vapi Voice Agent Configuration</h2>

            {/* Enable/disable */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">Enable Vapi Voice</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Allow Momentum to initiate and receive voice calls via Vapi</p>
              </div>
              <Switch
                checked={!!(localConfig.vapiEnabled)}
                onCheckedChange={v => updateConfig('vapiEnabled', v)}
                data-testid="switch-vapi-enabled"
              />
            </div>

            {/* Policy mode */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">Policy Mode</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Controls what Vapi tool calls can execute automatically.
                  <strong> approval_only</strong> is the safe default.
                </p>
              </div>
              <Select
                value={(localConfig.policyMode as string) ?? 'approval_only'}
                onValueChange={v => updateConfig('policyMode', v)}
              >
                <SelectTrigger className="w-52" data-testid="select-policy-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approval_only">Approval Only (safe)</SelectItem>
                  <SelectItem value="low_risk_auto">Low-Risk Auto</SelectItem>
                  <SelectItem value="off">Off (disabled)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Policy mode explainer */}
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/40 p-4 text-xs space-y-2">
              <p className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Policy Mode Behaviour
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { mode: 'approval_only', label: 'Approval Only', desc: 'All write actions (notes, tasks, cadence, drafts) are queued for human approval. Read-only tools (lookupLead, lookupAccount) always execute.' },
                  { mode: 'low_risk_auto', label: 'Low-Risk Auto', desc: 'Read-only + low-risk writes (notes, tasks, cadence, objection log, drafts) run automatically. Meeting booking and stage changes still queue for approval.' },
                  { mode: 'off', label: 'Off', desc: 'Vapi calls receive responses but all tool actions are blocked with a policy error. Use this to disable the voice layer without removing configuration.' },
                ].map(p => (
                  <div key={p.mode} className={`p-2 rounded border ${(localConfig.policyMode ?? 'approval_only') === p.mode ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{p.label}: </span>
                    <span className="text-gray-600 dark:text-gray-400">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar integration */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">Calendar Integration Configured</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Mark true when a calendar booking system is connected. Enables scheduleMeetingRequest tool to route to calendar.</p>
              </div>
              <Switch
                checked={!!(localConfig.calendarIntegrationConfigured)}
                onCheckedChange={v => updateConfig('calendarIntegrationConfigured', v)}
                data-testid="switch-calendar"
              />
            </div>

            {/* Assistants */}
            <div className="space-y-2">
              <p className="font-medium text-sm text-gray-900 dark:text-white">Assistant IDs (per intent)</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Each call intent uses a dedicated Vapi assistant. Create assistants in the Vapi dashboard and paste the assistant IDs here.
              </p>
              <div className="space-y-2">
                {Object.entries(INTENT_DEFINITIONS).map(([intentId, def]) => {
                  const existing = ((localConfig.assistants ?? []) as any[]).find((a: any) => a.intentId === intentId);
                  return (
                    <div key={intentId} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{def.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{def.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          type="text"
                          placeholder="asst_..."
                          defaultValue={existing?.assistantId ?? ''}
                          className="w-52 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                          onChange={e => {
                            const assistants = ((localConfig.assistants ?? []) as any[]).filter((a: any) => a.intentId !== intentId);
                            assistants.push({ intentId, assistantId: e.target.value, label: def.label, enabled: true });
                            updateConfig('assistants', assistants);
                          }}
                          data-testid={`input-assistant-${intentId}`}
                        />
                        {existing?.assistantId ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => saveConfigMut.mutate()}
                disabled={!configDirty || saveConfigMut.isPending}
                data-testid="button-save-config"
              >
                {saveConfigMut.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* CALL HEALTH TAB                                                   */}
        {/* ================================================================ */}
        <TabsContent value="health" className="mt-4 space-y-4">

          {/* Health cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'API Key',           ok: health.apiKeySet,         icon: <Zap className="w-4 h-4" /> },
              { label: 'Phone Number ID',   ok: health.phoneNumberIdSet,  icon: <Phone className="w-4 h-4" /> },
              { label: 'Webhook Secured',   ok: health.webhookSecuredSet, icon: <Shield className="w-4 h-4" /> },
              { label: 'Assistants',        ok: (health.missingSections?.length ?? 1) === 0, icon: <Mic className="w-4 h-4" />, label2: configured ? 'Connected' : 'Missing' },
            ].map((item, i) => (
              <Card key={i} className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.ok ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  <div className={item.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                    {item.icon}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>
                    {item.ok ? 'Set' : 'Missing'}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {/* Call stats */}
          <Card className="p-5">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-4">Call Statistics (last 50 calls)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Calls',    value: calls.length },
                { label: 'Meetings Booked', value: calls.filter(c => c.outcome === 'meeting_booked').length },
                { label: 'Failed Calls',   value: calls.filter(c => c.status === 'failed').length },
                { label: 'In Progress',    value: calls.filter(c => c.status === 'in-progress').length },
              ].map((stat, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Webhook URL */}
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Webhook Configuration</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Configure this URL in the Vapi dashboard (Settings → Webhooks) so Vapi can deliver tool calls and call events to Momentum.
            </p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700">
              <code className="text-xs flex-1 text-violet-700 dark:text-violet-300 break-all">
                {window.location.origin}/api/vapi/webhook
              </code>
              <Button
                variant="ghost" size="sm"
                onClick={() => copyToClipboard(`${window.location.origin}/api/vapi/webhook`)}
                data-testid="button-copy-webhook"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Set <code className="font-mono">VAPI_WEBHOOK_SECRET</code> and configure the same value in the Vapi dashboard to secure this endpoint.
            </p>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* RECENT CALLS TAB                                                  */}
        {/* ================================================================ */}
        <TabsContent value="calls" className="mt-4 space-y-3">
          {callsQ.isLoading && (
            <div className="text-sm text-gray-500 dark:text-gray-400 p-8 text-center">Loading calls...</div>
          )}

          {!callsQ.isLoading && calls.length === 0 && (
            <Card className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              <PhoneOff className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No call records yet. Calls will appear here once Vapi is configured and calls are initiated.
            </Card>
          )}

          {calls.map(call => (
            <Card key={call.callId} className="border border-gray-200 dark:border-gray-700">
              <button
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors rounded-lg"
                onClick={() => setExpandedCall(expandedCall === call.callId ? null : call.callId)}
                data-testid={`call-row-${call.callId}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOUR[call.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {call.status}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {call.entityName ?? call.phoneNumber}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {INTENT_LABELS[call.intent] ?? call.intent} · {formatDate(call.initiatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {call.outcome && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${OUTCOME_COLOUR[call.outcome] ?? 'bg-gray-100 text-gray-500'}`}>
                      {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDuration(call.durationSeconds)}</span>
                  <span className="text-xs text-gray-400">{call.toolCallCount} tools</span>
                  {expandedCall === call.callId ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {expandedCall === call.callId && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {[
                      { k: 'Call ID',      v: call.callId },
                      { k: 'Vapi Call ID', v: call.vapiCallId ?? '—' },
                      { k: 'Intent',       v: INTENT_LABELS[call.intent] ?? call.intent },
                      { k: 'Entity',       v: `${call.entityType}: ${call.entityId}` },
                      { k: 'Policy Mode',  v: call.policyMode },
                      { k: 'Duration',     v: formatDuration(call.durationSeconds) },
                      { k: 'Started',      v: formatDate(call.startedAt) },
                      { k: 'Ended',        v: formatDate(call.endedAt) },
                      { k: 'Next Step',    v: call.nextStep ?? '—' },
                    ].map(item => (
                      <div key={item.k} className="p-2 rounded bg-gray-50 dark:bg-gray-800/40">
                        <p className="text-gray-400 uppercase tracking-wider text-[10px]">{item.k}</p>
                        <p className="font-medium text-gray-800 dark:text-gray-200 mt-0.5 break-all">{item.v}</p>
                      </div>
                    ))}
                  </div>

                  {call.callSummary && (
                    <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                      <p className="text-[10px] text-blue-500 uppercase tracking-wider mb-1">Call Summary</p>
                      <p className="text-xs text-blue-800 dark:text-blue-200">{call.callSummary}</p>
                    </div>
                  )}

                  {call.objections.length > 0 && (
                    <div className="p-3 rounded bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800">
                      <p className="text-[10px] text-orange-500 uppercase tracking-wider mb-1">Objections Logged</p>
                      <ul className="space-y-0.5">
                        {call.objections.map((o, i) => <li key={i} className="text-xs text-orange-800 dark:text-orange-200">• {o}</li>)}
                      </ul>
                    </div>
                  )}

                  {call.toolCallLog.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Tool Calls ({call.toolCallLog.length})</p>
                      <div className="space-y-1.5">
                        {call.toolCallLog.map(tc => (
                          <div key={tc.toolCallId} className="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800/40 text-xs">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tc.result === 'success' ? 'bg-green-400' : tc.result === 'blocked' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                            <span className="font-mono text-gray-700 dark:text-gray-300 flex-1">{tc.toolName}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              tc.policyDecision === 'read_only' ? 'bg-gray-100 text-gray-500' :
                              tc.policyDecision === 'auto_allowed' ? 'bg-green-100 text-green-700' :
                              tc.policyDecision === 'queued_for_approval' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-600'
                            }`}>{tc.policyDecision}</span>
                            <span className="text-gray-400">{formatDate(tc.calledAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* ================================================================ */}
        {/* INTENT LIBRARY TAB                                                */}
        {/* ================================================================ */}
        <TabsContent value="intents" className="mt-4 space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Each call intent defines the purpose, entry conditions, Momentum context provided, success criteria, and allowed tools.
            These are the authoritative Momentum-side definitions — Vapi assistants operate within these boundaries.
          </p>

          {Object.entries(INTENT_DEFINITIONS).map(([intentId, def]) => (
            <Card key={intentId} className="border border-gray-200 dark:border-gray-700">
              <button
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors rounded-lg"
                onClick={() => setExpandedIntent(expandedIntent === intentId as VapiCallIntent ? null : intentId as VapiCallIntent)}
                data-testid={`intent-row-${intentId}`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                    <Phone className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{def.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{def.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="text-[10px]">
                    {def.entityType}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {def.allowedTools.length} tools
                  </Badge>
                  {expandedIntent === intentId ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {expandedIntent === intentId && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Entry Conditions</p>
                      <ul className="space-y-1">
                        {def.entryConditions.map((c, i) => (
                          <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Success Criteria</p>
                      <ul className="space-y-1">
                        {def.successCriteria.map((c, i) => (
                          <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                            <span className="text-blue-500 mt-0.5 flex-shrink-0">→</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Momentum Context Provided</p>
                      <ul className="space-y-1">
                        {def.momentumContextProvided.map((c, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                            <span className="text-gray-400 mt-0.5">•</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Escalation Conditions</p>
                      <ul className="space-y-1">
                        {def.escalationConditions.map((c, i) => (
                          <li key={i} className="text-xs text-orange-700 dark:text-orange-400 flex items-start gap-1.5">
                            <span className="text-orange-400 mt-0.5 flex-shrink-0">!</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Allowed Tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {def.allowedTools.map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-mono">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Forbidden Actions</p>
                    <ul className="space-y-1">
                      {def.forbiddenActions.map((f, i) => (
                        <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                          <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* ================================================================ */}
        {/* TOOL BOUNDARIES TAB                                               */}
        {/* ================================================================ */}
        <TabsContent value="tools" className="mt-4 space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All Vapi tool calls go through Momentum service boundaries. No direct writes from Vapi. Every action is auditable.
            Policy mode is re-checked at execution time from Firestore.
          </p>

          <div className="space-y-2">
            {VAPI_TOOLS.map(tool => (
              <Card key={tool.name} className="p-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  tool.safety === 'read_only' ? 'bg-gray-100 dark:bg-gray-800' :
                  tool.safety === 'low_risk'  ? 'bg-blue-100 dark:bg-blue-900/30' :
                  'bg-orange-100 dark:bg-orange-900/30'
                }`}>
                  <Wrench className={`w-4 h-4 ${
                    tool.safety === 'read_only' ? 'text-gray-500' :
                    tool.safety === 'low_risk'  ? 'text-blue-600 dark:text-blue-400' :
                    'text-orange-600 dark:text-orange-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white font-mono">{tool.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{tool.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={
                    tool.safety === 'read_only' ? 'bg-gray-100 text-gray-600' :
                    tool.safety === 'low_risk'  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                  }>
                    {tool.safety}
                  </Badge>
                  <Badge className={tool.autoAllowed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                    {tool.autoAllowed ? 'auto' : 'approval'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-4 h-4" /> Safety Model
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {[
                { label: 'Read-Only', colour: 'gray', desc: 'lookupLead, lookupAccount — always allowed in all policy modes. No Firestore writes.' },
                { label: 'Low-Risk', colour: 'blue', desc: 'Notes, tasks, cadence, objections, drafts — auto-allowed in low_risk_auto mode; queued in approval_only.' },
                { label: 'High-Risk', colour: 'orange', desc: 'Meeting booking — always queues an approval request regardless of policy mode.' },
              ].map(s => (
                <div key={s.label} className={`p-3 rounded-lg border ${
                  s.colour === 'gray'   ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40' :
                  s.colour === 'blue'   ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10' :
                  'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10'
                }`}>
                  <p className="font-semibold mb-1">{s.label}</p>
                  <p className="text-gray-600 dark:text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* MISSING SETUP TAB                                                 */}
        {/* ================================================================ */}
        <TabsContent value="missing" className="mt-4 space-y-4">
          <Card className="p-5 border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">Action Required — Vapi Setup</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  The following environment secrets and configuration items are required before Vapi calls will work.
                  These must be added by Nathan in the Replit environment secrets panel.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  key:      'VAPI_API_KEY',
                  label:    'Vapi API Key',
                  where:    'Vapi dashboard → Settings → API Keys',
                  required: true,
                  impact:   'Cannot create outbound calls or query call status',
                  set:      health.apiKeySet,
                },
                {
                  key:      'VAPI_PHONE_NUMBER_ID',
                  label:    'Vapi Phone Number ID',
                  where:    'Vapi dashboard → Phone Numbers — copy the ID of the outbound number',
                  required: true,
                  impact:   'Cannot initiate outbound calls',
                  set:      health.phoneNumberIdSet,
                },
                {
                  key:      'VAPI_WEBHOOK_SECRET',
                  label:    'Vapi Webhook Secret',
                  where:    'Vapi dashboard → Webhooks — set a shared secret and paste here',
                  required: false,
                  impact:   'Webhook will accept any request (security risk in production)',
                  set:      health.webhookSecuredSet,
                },
              ].map(item => (
                <div key={item.key} className={`flex items-start gap-4 p-4 rounded-lg border ${
                  item.set
                    ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                    : item.required
                      ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                }`}>
                  {item.set
                    ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    : item.required
                      ? <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  }
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-bold font-mono text-gray-900 dark:text-white">{item.key}</code>
                      <Badge className="text-[10px]">{item.required ? 'Required' : 'Recommended'}</Badge>
                      {item.set && <Badge className="text-[10px] bg-green-100 text-green-700">Set ✓</Badge>}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1"><strong>Where to find: </strong>{item.where}</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5"><strong>Impact if missing: </strong>{item.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Vapi Dashboard Setup Checklist</h3>
            <div className="space-y-2 text-sm">
              {[
                'Create a Vapi account at vapi.ai',
                'Purchase or configure a phone number for outbound calling',
                'Create one Vapi assistant per call intent (9 total) — see Intent Library tab',
                'For each assistant: set the system prompt using the Momentum conversation framework for that intent',
                'For each assistant: add the Momentum tool definitions (all 12 tools) in the Vapi dashboard',
                'Configure the webhook URL: [your domain]/api/vapi/webhook',
                'Set a webhook secret in the Vapi dashboard and add it as VAPI_WEBHOOK_SECRET here',
                'Paste each assistant ID into the Configuration tab above',
                'Enable Vapi and set the desired policy mode in the Configuration tab',
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-gray-700 dark:text-gray-300">{step}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Calendar Integration (Optional)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The <code className="font-mono">scheduleMeetingRequest</code> tool always creates an approval request
              in Momentum. To enable actual calendar booking, connect a calendar integration (Calendly, Google Calendar, etc.)
              and update the tool handler to use the calendar API. Mark <strong>Calendar Integration Configured</strong>
              to true in the Configuration tab once connected.
            </p>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 text-xs space-y-1">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Currently: Clean boundary in place</p>
              <p className="text-gray-500 dark:text-gray-400">Meeting booking requests queue to <code>orgs/&#123;orgId&#125;/approvalRequests</code> with type <code>meeting_booking</code>. Human approval required before booking.</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

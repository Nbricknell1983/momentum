// =============================================================================
// ERICA CALLING WORKSPACE
// =============================================================================
// Premium operator workspace for the Erica voice calling system.
// Tabs: Batches | Selection | Review | Brief Inspection | Results | Settings
// =============================================================================

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import {
  PhoneCall, Plus, Play, Pause, X, ChevronRight, ChevronDown,
  AlertTriangle, CheckCircle, Clock, User, Building2, Target,
  FileText, Eye, SkipForward, Trash2, RefreshCw, Phone, TrendingUp,
  Mic, BookOpen, Zap, ShieldCheck, MessageSquare, Users,
  Radio, Activity, ListOrdered, Loader2, PhoneMissed,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';
import { deriveCallContext } from '@/lib/ericaCallContext';
import { extractDealSnapshot } from '@/lib/ericaDealAdapter';
import { extractClientSnapshot } from '@/lib/ericaClientAdapter';
import { generateCallBrief, validateBatchItem } from '@/lib/ericaBriefGenerator';
import type {
  EricaCallBatch, EricaCallBatchItem, EricaCallBrief,
  EricaCallSource, EricaCallTarget, EricaCallContext,
} from '@/lib/ericaTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RootState { auth: { orgId?: string }; leads: { items: any[] }; clients: { items: any[] } }

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const BATCH_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-700',
  ready:     'bg-blue-100 text-blue-700',
  launching: 'bg-yellow-100 text-yellow-800',
  active:    'bg-green-100 text-green-800',
  paused:    'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending:      'bg-slate-100 text-slate-600',
  brief_ready:  'bg-blue-100 text-blue-700',
  brief_failed: 'bg-red-100 text-red-700',
  calling:      'bg-green-100 text-green-800',
  completed:    'bg-emerald-100 text-emerald-800',
  skipped:      'bg-slate-100 text-slate-500',
  blocked:      'bg-red-100 text-red-700',
  failed:       'bg-red-100 text-red-700',
};

const INTENT_LABELS: Record<string, string> = {
  cold_outreach:             'Cold Outreach',
  discovery_qualification:   'Discovery',
  strategy_follow_up:        'Strategy Follow-Up',
  proposal_follow_up:        'Proposal Follow-Up',
  nurture:                   'Nurture',
  upsell:                    'Upsell',
  churn_intervention:        'Churn Intervention',
  referral_ask:              'Referral Ask',
  dormant_lead_reactivation: 'Dormant Reactivation',
};

const SOURCE_LABELS: Record<string, string> = {
  leads:    'Leads Pipeline',
  clients:  'Client Accounts',
  cadence:  'Cadence Queue',
  expansion:'Expansion Engine',
  referral: 'Referral Engine',
  churn:    'Churn Risk',
  dormant:  'Dormant Leads',
  manual:   'Manual',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  const cls = map[status] ?? 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}

function MetricCard({ label, value, sub, icon: Icon, color = 'text-slate-700' }: {
  label: string; value: string | number; sub?: string;
  icon: React.FC<any>; color?: string;
}) {
  return (
    <Card className="border border-slate-200">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
          <Icon className={`w-5 h-5 mt-1 ${color} opacity-60`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Brief Inspector Dialog
// ---------------------------------------------------------------------------

function BriefInspectorDialog({
  brief, open, onClose,
}: { brief: EricaCallBrief | null; open: boolean; onClose: () => void }) {
  if (!brief) return null;
  const pkt = brief.vapiContextPacket;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Call Brief — {brief.businessName}
          </DialogTitle>
          <DialogDescription>
            {INTENT_LABELS[brief.callIntent] ?? brief.callIntent} · {SOURCE_LABELS[brief.callSource] ?? brief.callSource} · Generated {new Date(brief.generatedAt).toLocaleDateString('en-AU')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">

          {/* Who */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Contact</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Business:</span> <span className="font-medium">{brief.businessName}</span></div>
              <div><span className="text-slate-500">Contact:</span> <span className="font-medium">{brief.contactName ?? '—'}</span></div>
              <div><span className="text-slate-500">Phone:</span> <span className="font-medium font-mono">{brief.phone ?? '—'}</span></div>
              <div><span className="text-slate-500">Relationship:</span> <span className="font-medium">{brief.relationship.replace(/_/g, ' ')}</span></div>
            </div>
          </section>

          <Separator />

          {/* Why */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Why Calling Now</h4>
            <p className="text-sm bg-blue-50 rounded-lg p-3 text-blue-900 border border-blue-100">{brief.whyCallingNow}</p>
          </section>

          {/* Opening */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Opening Line</h4>
            <p className="text-sm bg-green-50 rounded-lg p-3 text-green-900 border border-green-100 italic">"{brief.openingAngle.openingLine}"</p>
            {brief.openingAngle.disarmingPhrase && (
              <p className="text-xs text-slate-500 mt-1">Disarm: "{brief.openingAngle.disarmingPhrase}"</p>
            )}
          </section>

          {/* Questions */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Question Plan (NEPQ + Voss)</h4>
            <div className="space-y-2">
              {brief.questionPlan.situationQuestions.slice(0, 2).map((q, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-blue-500 font-bold min-w-[16px]">S</span>
                  <span>{q}</span>
                </div>
              ))}
              {brief.questionPlan.problemQuestions.slice(0, 1).map((q, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-orange-500 font-bold min-w-[16px]">P</span>
                  <span>{q}</span>
                </div>
              ))}
              {brief.questionPlan.calibratedQuestions.slice(0, 2).map((q, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-purple-500 font-bold min-w-[16px]">C</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Objections */}
          {brief.objectionPredictions.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Predicted Objections</h4>
              <div className="space-y-2">
                {brief.objectionPredictions.map((obj, i) => (
                  <div key={i} className={`rounded-lg p-3 border text-sm ${obj.likelihood === 'high' ? 'bg-red-50 border-red-200' : obj.likelihood === 'medium' ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{obj.objectionType.replace(/_/g, ' ')}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${obj.likelihood === 'high' ? 'bg-red-100 text-red-700' : obj.likelihood === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{obj.likelihood}</span>
                    </div>
                    {obj.vossLabel && <p className="text-slate-600 italic text-xs mb-1">"{obj.vossLabel}"</p>}
                    <p className="text-slate-700 text-xs">{obj.suggestedFraming}</p>
                    <p className="text-slate-500 text-xs mt-1">↳ {obj.calibratedQuestion}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Close */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Close Strategy</h4>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-sm space-y-2">
              <p className="font-medium text-slate-800">{brief.closeStrategy.closeStatement}</p>
              <p className="text-slate-500 text-xs">Fallback: {brief.closeStrategy.fallbackClose}</p>
              {brief.closeStrategy.whatNotToSay.length > 0 && (
                <div>
                  <p className="text-xs text-red-600 font-medium mt-2">What not to say:</p>
                  {brief.closeStrategy.whatNotToSay.map((s, i) => (
                    <p key={i} className="text-xs text-red-600 flex items-center gap-1"><X className="w-3 h-3" /> {s}</p>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Guardrails */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Guardrails</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500 mb-1">Allowed tools:</p>
                {brief.allowedTools.map(t => <p key={t} className="text-green-700 flex items-center gap-1"><CheckCircle className="w-3 h-3" />{t}</p>)}
              </div>
              <div>
                <p className="text-slate-500 mb-1">Escalation triggers:</p>
                {brief.escalationTriggers.map((t, i) => <p key={i} className="text-orange-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{t}</p>)}
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Target selector
// ---------------------------------------------------------------------------

function TargetSelectorPanel({
  leads, clients, selectedIds, onToggle,
}: {
  leads: any[]; clients: any[];
  selectedIds: Set<string>;
  onToggle: (id: string, type: 'lead' | 'client') => void;
}) {
  const [tab, setTab] = useState<'leads' | 'clients'>('leads');
  const [search, setSearch] = useState('');

  const filteredLeads   = leads.filter(l => (l.businessName ?? l.name ?? '').toLowerCase().includes(search.toLowerCase()));
  const filteredClients = clients.filter(c => (c.businessName ?? c.name ?? '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab('leads')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'leads' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          data-testid="erica-tab-leads"
        >Leads ({filteredLeads.length})</button>
        <button
          onClick={() => setTab('clients')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'clients' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          data-testid="erica-tab-clients"
        >Clients ({filteredClients.length})</button>
      </div>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="border border-slate-200 rounded px-3 py-1.5 text-sm mb-3 w-full"
        data-testid="erica-search-input"
      />

      <ScrollArea className="flex-1">
        <div className="space-y-1.5">
          {(tab === 'leads' ? filteredLeads : filteredClients).map(entity => {
            const id       = entity.id;
            const type     = tab === 'leads' ? 'lead' : 'client';
            const selected = selectedIds.has(`${type}:${id}`);
            const name     = entity.businessName ?? entity.name ?? 'Unknown';
            const contact  = entity.contactName ?? entity.primaryContact ?? '';
            const phone    = entity.phone ?? entity.mobile ?? '';
            const stage    = entity.stage ?? entity.status ?? '';

            return (
              <div
                key={id}
                onClick={() => onToggle(id, type)}
                data-testid={`erica-target-${id}`}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                  {selected && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                  <p className="text-xs text-slate-500 truncate">{contact} {phone ? `· ${phone}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {stage && <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{stage}</span>}
                  {!phone && <span className="text-xs text-red-500">No phone</span>}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch item row
// ---------------------------------------------------------------------------

function BatchItemRow({
  item, onSkip, onRemove, onInspect,
}: {
  item: EricaCallBatchItem;
  onSkip: () => void;
  onRemove: () => void;
  onInspect: () => void;
}) {
  const validation = validateBatchItem(item);

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-slate-800 truncate">{item.target.businessName}</p>
          <StatusBadge status={item.status} map={ITEM_STATUS_COLORS} />
          {!validation.valid && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{item.target.contactName ?? '—'}</span>
          <span className="font-mono">{item.target.phone ?? <span className="text-red-500">No phone</span>}</span>
          <span className="bg-slate-100 px-1.5 py-0.5 rounded">{INTENT_LABELS[item.context?.callIntent] ?? item.context?.callIntent}</span>
        </div>
        {validation.warnings.length > 0 && (
          <p className="text-xs text-orange-600 mt-0.5">{validation.warnings[0]}</p>
        )}
        {validation.reasons.length > 0 && (
          <p className="text-xs text-red-600 mt-0.5">{validation.reasons[0]}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {item.briefStatus === 'ready' && (
          <button onClick={onInspect} className="p-1.5 hover:bg-slate-100 rounded" title="Inspect brief" data-testid={`btn-inspect-${item.itemId}`}>
            <Eye className="w-4 h-4 text-blue-600" />
          </button>
        )}
        <button onClick={onSkip} className="p-1.5 hover:bg-slate-100 rounded" title="Skip" data-testid={`btn-skip-${item.itemId}`}>
          <SkipForward className="w-4 h-4 text-slate-400" />
        </button>
        <button onClick={onRemove} className="p-1.5 hover:bg-slate-100 rounded" title="Remove" data-testid={`btn-remove-${item.itemId}`}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Workspace
// ---------------------------------------------------------------------------

export default function EricaWorkspace() {
  const qc      = useQueryClient();
  const orgId   = useSelector((s: RootState) => s.auth.orgId) ?? '';
  const leads   = useSelector((s: RootState) => s.leads?.items ?? []);
  const clients = useSelector((s: RootState) => s.clients?.items ?? []);

  const [activeTab,      setActiveTab]      = useState('batches');
  const [selectedBatch,  setSelectedBatch]  = useState<EricaCallBatch | null>(null);
  const [inspectBrief,   setInspectBrief]   = useState<EricaCallBrief | null>(null);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [batchName,      setBatchName]      = useState('');
  const [batchDesc,      setBatchDesc]      = useState('');
  const [generatingBriefs, setGeneratingBriefs] = useState(false);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: batchesData, isLoading: batchesLoading } = useQuery({
    queryKey: [`/api/erica/orgs/${orgId}/batches`],
    enabled:  !!orgId,
  });
  const batches: EricaCallBatch[] = (batchesData as any)?.batches ?? [];

  const { data: resultsData } = useQuery({
    queryKey: [`/api/erica/orgs/${orgId}/results`],
    enabled:  !!orgId,
  });
  const results = (resultsData as any)?.results ?? [];

  const { data: callsData, isLoading: callsLoading, refetch: refetchCalls } = useQuery({
    queryKey: [`/api/erica/orgs/${orgId}/calls`],
    enabled:  !!orgId,
    refetchInterval: 5000,
  });
  const liveCalls = (callsData as any)?.calls ?? [];

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: [`/api/erica/orgs/${orgId}/events`],
    enabled:  !!orgId,
  });
  const auditEvents = (eventsData as any)?.events ?? [];

  const launchItemMutation = useMutation({
    mutationFn: ({ batchId, itemId }: { batchId: string; itemId: string }) =>
      apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/items/${itemId}/launch-call`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] });
      qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/calls`] });
    },
  });

  const launchNextMutation = useMutation({
    mutationFn: (batchId: string) =>
      apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/launch-next`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] });
      qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/calls`] });
    },
  });

  const [launchingItemId, setLaunchingItemId] = useState<string | null>(null);

  async function handleLaunchItem(batchId: string, itemId: string) {
    setLaunchingItemId(itemId);
    try {
      await launchItemMutation.mutateAsync({ batchId, itemId });
      setActiveTab('execution');
    } catch {}
    setLaunchingItemId(null);
  }

  async function handleLaunchNext(batchId: string) {
    try {
      await launchNextMutation.mutateAsync(batchId);
      setActiveTab('execution');
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createBatchMut = useMutation({
    mutationFn: (body: any) => apiRequest('POST', `/api/erica/orgs/${orgId}/batches`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  const addItemsMut = useMutation({
    mutationFn: ({ batchId, targets }: any) =>
      apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/items`, { targets }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  const patchItemMut = useMutation({
    mutationFn: ({ batchId, itemId, action }: any) =>
      apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/items/${itemId}/${action}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  const removeItemMut = useMutation({
    mutationFn: ({ batchId, itemId }: any) =>
      apiRequest('DELETE', `/api/erica/orgs/${orgId}/batches/${batchId}/items/${itemId}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  const attachBriefMut = useMutation({
    mutationFn: ({ batchId, itemId, brief }: any) =>
      apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/items/${itemId}/brief`, { brief }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  const launchMut = useMutation({
    mutationFn: (batchId: string) => apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/launch`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  const pauseMut = useMutation({
    mutationFn: (batchId: string) => apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/pause`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  const cancelMut = useMutation({
    mutationFn: (batchId: string) => apiRequest('POST', `/api/erica/orgs/${orgId}/batches/${batchId}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] }),
  });

  // ---------------------------------------------------------------------------
  // Target selection toggle
  // ---------------------------------------------------------------------------

  function toggleTarget(id: string, type: 'lead' | 'client') {
    const key = `${type}:${id}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Create batch from selection
  // ---------------------------------------------------------------------------

  async function handleCreateBatch() {
    if (!batchName.trim() || selectedIds.size === 0) return;

    const result: any = await createBatchMut.mutateAsync({ name: batchName, description: batchDesc });
    const newBatch    = result.batch;
    if (!newBatch) return;

    const targets = Array.from(selectedIds).map(key => {
      const [type, id] = key.split(':') as ['lead' | 'client', string];
      const entity     = type === 'lead'
        ? leads.find(l => l.id === id)
        : clients.find(c => c.id === id);
      if (!entity) return null;

      const source: EricaCallSource = type === 'lead' ? 'leads' : 'clients';
      const dealSnap   = type === 'lead'   ? extractDealSnapshot(entity)   : undefined;
      const clientSnap = type === 'client' ? extractClientSnapshot(entity) : undefined;
      const context    = deriveCallContext(source, {
        entityType:   type,
        entityId:     id,
        entityName:   entity.contactName ?? entity.name ?? '',
        businessName: entity.businessName ?? entity.name ?? '',
        contactName:  entity.contactName ?? entity.primaryContact ?? undefined,
        phone:        entity.phone ?? entity.mobile ?? undefined,
        source,
        reason:       `Manually selected from ${SOURCE_LABELS[source]}`,
      }, dealSnap, clientSnap);

      const target: EricaCallTarget = {
        entityType:   type,
        entityId:     id,
        entityName:   entity.contactName ?? entity.name ?? '',
        businessName: entity.businessName ?? entity.name ?? '',
        contactName:  entity.contactName ?? entity.primaryContact ?? undefined,
        phone:        entity.phone ?? entity.mobile ?? undefined,
        stage:        entity.stage ?? entity.status ?? undefined,
        source,
        reason:       `Manually selected from ${SOURCE_LABELS[source]}`,
      };

      return { target, context };
    }).filter(Boolean);

    await addItemsMut.mutateAsync({ batchId: newBatch.batchId, targets });
    setBatchName('');
    setBatchDesc('');
    setSelectedIds(new Set());
    setActiveTab('batches');
  }

  // ---------------------------------------------------------------------------
  // Generate all briefs for a batch
  // ---------------------------------------------------------------------------

  async function handleGenerateBriefs(batch: EricaCallBatch) {
    setGeneratingBriefs(true);
    const items = batch.items.filter(i => i.briefStatus === 'not_generated');

    for (const item of items) {
      try {
        const type       = item.target.entityType;
        const entity     = type === 'lead'
          ? leads.find(l => l.id === item.target.entityId)
          : clients.find(c => c.id === item.target.entityId);

        const dealSnap   = entity && type === 'lead'   ? extractDealSnapshot(entity)   : undefined;
        const clientSnap = entity && type === 'client' ? extractClientSnapshot(entity) : undefined;

        const brief = generateCallBrief({ batchItemId: item.itemId, item, dealSnap, clientSnap });
        await attachBriefMut.mutateAsync({ batchId: batch.batchId, itemId: item.itemId, brief });
      } catch (err) {
        console.error('Brief generation failed for item:', item.itemId, err);
      }
    }

    // Mark batch ready if all done
    if (batch.status === 'draft') {
      await apiRequest('PATCH', `/api/erica/orgs/${orgId}/batches/${batch.batchId}`, { status: 'ready' });
      qc.invalidateQueries({ queryKey: [`/api/erica/orgs/${orgId}/batches`] });
    }

    setGeneratingBriefs(false);
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  const metrics = useMemo(() => {
    const total     = batches.reduce((s, b) => s + b.totalTargets, 0);
    const completed = batches.reduce((s, b) => s + b.completedCalls, 0);
    const booked    = batches.reduce((s, b) => s + b.bookedCalls, 0);
    const active    = batches.filter(b => b.status === 'active').length;
    const rate      = completed > 0 ? Math.round((booked / completed) * 100) : 0;
    return { total, completed, booked, active, rate };
  }, [batches]);

  // ---------------------------------------------------------------------------
  // Refresh selected batch
  // ---------------------------------------------------------------------------

  const refreshedBatch = useMemo(() => {
    if (!selectedBatch) return null;
    return batches.find(b => b.batchId === selectedBatch.batchId) ?? selectedBatch;
  }, [batches, selectedBatch]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Erica — Calling Workspace</h1>
              <p className="text-xs text-slate-500">Context-aware AI voice calling · Human-controlled · NEPQ + Voss</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setActiveTab('selection')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="btn-new-batch"
          >
            <Plus className="w-4 h-4 mr-1" /> New Batch
          </Button>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-5 gap-3 px-6 py-4 bg-white border-b border-slate-200">
        <MetricCard label="Total Targets"   value={metrics.total}     icon={Users}       />
        <MetricCard label="Calls Made"      value={metrics.completed} icon={PhoneCall}   />
        <MetricCard label="Booked"          value={metrics.booked}    icon={CheckCircle} color="text-green-700" />
        <MetricCard label="Booking Rate"    value={`${metrics.rate}%`} icon={TrendingUp} color={metrics.rate > 30 ? 'text-green-700' : 'text-orange-600'} />
        <MetricCard label="Active Batches"  value={metrics.active}    icon={Zap}         color={metrics.active > 0 ? 'text-blue-700' : 'text-slate-700'} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="px-6 bg-white border-b border-slate-200 rounded-none justify-start h-10 gap-0">
          {[
            { value: 'batches',   label: 'Batches',   icon: BookOpen },
            { value: 'selection', label: 'Selection',  icon: Target },
            { value: 'review',    label: 'Review',     icon: ShieldCheck },
            { value: 'execution', label: 'Execution',  icon: Radio },
            { value: 'results',   label: 'Results',    icon: TrendingUp },
            { value: 'inspect',   label: 'Inspect',    icon: Activity },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none h-10 px-4 text-sm data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
              data-testid={`erica-tab-${value}`}
            >
              <Icon className="w-3.5 h-3.5 mr-1.5" />{label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── BATCHES TAB ─────────────────────────────────────────────── */}
        <TabsContent value="batches" className="flex-1 overflow-y-auto p-6 mt-0">
          {batchesLoading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">Loading batches…</div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <PhoneCall className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">No call batches yet</p>
              <p className="text-sm mt-1">Select targets and create your first batch</p>
              <Button size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setActiveTab('selection')} data-testid="btn-create-first-batch">
                <Plus className="w-4 h-4 mr-1" /> Create Batch
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map(batch => (
                <div
                  key={batch.batchId}
                  data-testid={`batch-card-${batch.batchId}`}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  {/* Batch header */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => setSelectedBatch(selectedBatch?.batchId === batch.batchId ? null : batch)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-800">{batch.name}</p>
                        <StatusBadge status={batch.status} map={BATCH_STATUS_COLORS} />
                      </div>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span><span className="font-medium text-slate-700">{batch.totalTargets}</span> targets</span>
                        <span><span className="font-medium text-slate-700">{batch.completedCalls}</span> called</span>
                        <span><span className="font-medium text-green-700">{batch.bookedCalls}</span> booked</span>
                        <span>Created {new Date(batch.createdAt).toLocaleDateString('en-AU')}</span>
                      </div>
                    </div>

                    {/* Batch controls */}
                    <div className="flex items-center gap-2">
                      {batch.status === 'ready' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={e => { e.stopPropagation(); launchMut.mutate(batch.batchId); }} data-testid={`btn-launch-${batch.batchId}`}>
                          <Play className="w-3.5 h-3.5 mr-1" /> Launch
                        </Button>
                      )}
                      {batch.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); pauseMut.mutate(batch.batchId); }} data-testid={`btn-pause-${batch.batchId}`}>
                          <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                        </Button>
                      )}
                      {batch.status === 'paused' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={e => { e.stopPropagation(); launchMut.mutate(batch.batchId); }} data-testid={`btn-resume-${batch.batchId}`}>
                          <Play className="w-3.5 h-3.5 mr-1" /> Resume
                        </Button>
                      )}
                      {['draft', 'ready'].includes(batch.status) && (
                        <Button size="sm" variant="ghost" className="text-blue-600" onClick={e => { e.stopPropagation(); handleGenerateBriefs(batch); }} disabled={generatingBriefs} data-testid={`btn-briefs-${batch.batchId}`}>
                          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${generatingBriefs ? 'animate-spin' : ''}`} />
                          {generatingBriefs ? 'Generating…' : 'Generate Briefs'}
                        </Button>
                      )}
                      {['active', 'paused'].includes(batch.status) && (
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={e => { e.stopPropagation(); cancelMut.mutate(batch.batchId); }} data-testid={`btn-cancel-${batch.batchId}`}>
                          <X className="w-3.5 h-3.5 mr-1" /> Cancel
                        </Button>
                      )}
                      {selectedBatch?.batchId === batch.batchId
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded items */}
                  {selectedBatch?.batchId === batch.batchId && (
                    <div className="border-t border-slate-100 p-4 space-y-2">
                      {(batch.items ?? []).length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">No items in this batch</p>
                      ) : (
                        (batch.items ?? []).sort((a, b) => a.priority - b.priority).map(item => (
                          <BatchItemRow
                            key={item.itemId}
                            item={item}
                            onSkip={() => patchItemMut.mutate({ batchId: batch.batchId, itemId: item.itemId, action: 'skip' })}
                            onRemove={() => removeItemMut.mutate({ batchId: batch.batchId, itemId: item.itemId })}
                            onInspect={() => { setInspectBrief(item.brief ?? null); setShowBriefModal(true); }}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── SELECTION TAB ───────────────────────────────────────────── */}
        <TabsContent value="selection" className="flex-1 overflow-hidden mt-0">
          <div className="flex h-full">
            {/* Target picker */}
            <div className="w-1/2 border-r border-slate-200 p-4 flex flex-col">
              <h3 className="font-semibold text-slate-800 mb-1">Select Targets</h3>
              <p className="text-xs text-slate-500 mb-3">Choose who Erica is allowed to call. Erica will only call records you explicitly select here.</p>
              <TargetSelectorPanel
                leads={leads}
                clients={clients}
                selectedIds={selectedIds}
                onToggle={toggleTarget}
              />
            </div>

            {/* Batch config */}
            <div className="w-1/2 p-4 flex flex-col">
              <h3 className="font-semibold text-slate-800 mb-3">Create Call Batch</h3>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Batch Name *</label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={e => setBatchName(e.target.value)}
                    placeholder="e.g. Q1 Proposal Follow-Ups"
                    className="border border-slate-200 rounded px-3 py-2 text-sm w-full"
                    data-testid="input-batch-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
                  <textarea
                    value={batchDesc}
                    onChange={e => setBatchDesc(e.target.value)}
                    placeholder="Optional notes about this batch"
                    rows={2}
                    className="border border-slate-200 rounded px-3 py-2 text-sm w-full resize-none"
                    data-testid="input-batch-desc"
                  />
                </div>
              </div>

              {/* Selected summary */}
              <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-3 mb-4 overflow-y-auto">
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Selected: {selectedIds.size} target{selectedIds.size !== 1 ? 's' : ''}
                </p>
                {selectedIds.size === 0 ? (
                  <p className="text-xs text-slate-400">No targets selected yet</p>
                ) : (
                  <div className="space-y-1">
                    {Array.from(selectedIds).map(key => {
                      const [type, id] = key.split(':');
                      const entity = type === 'lead' ? leads.find(l => l.id === id) : clients.find(c => c.id === id);
                      return (
                        <div key={key} className="flex items-center justify-between text-xs bg-white rounded p-2 border border-slate-200">
                          <span className="font-medium truncate">{entity?.businessName ?? entity?.name ?? id}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{type}</span>
                            <button onClick={() => toggleTarget(id, type as 'lead' | 'client')} className="text-red-400 hover:text-red-600">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!batchName.trim() || selectedIds.size === 0 || createBatchMut.isPending}
                onClick={handleCreateBatch}
                data-testid="btn-create-batch"
              >
                {createBatchMut.isPending ? 'Creating…' : `Create Batch (${selectedIds.size} targets)`}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── REVIEW TAB ──────────────────────────────────────────────── */}
        <TabsContent value="review" className="flex-1 overflow-y-auto p-6 mt-0">
          {!refreshedBatch || !selectedBatch ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <ShieldCheck className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">Select a batch to review</p>
              <p className="text-sm">Click any batch in the Batches tab first</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Reviewing: {refreshedBatch.name}</h3>
                <StatusBadge status={refreshedBatch.status} map={BATCH_STATUS_COLORS} />
              </div>

              {/* Validation summary */}
              {(() => {
                const blocked  = (refreshedBatch.items ?? []).filter(i => !validateBatchItem(i).valid);
                const warnings = (refreshedBatch.items ?? []).filter(i => validateBatchItem(i).warnings.length > 0);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`rounded-lg p-3 border text-sm ${blocked.length === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <p className="font-medium">{blocked.length === 0 ? '✓ All items valid' : `${blocked.length} blocked`}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Validation check</p>
                    </div>
                    <div className={`rounded-lg p-3 border text-sm ${warnings.length === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                      <p className="font-medium">{warnings.length === 0 ? '✓ No warnings' : `${warnings.length} warnings`}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Warning check</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <p className="font-medium">{(refreshedBatch.items ?? []).filter(i => i.briefStatus === 'ready').length} / {refreshedBatch.totalTargets} briefs ready</p>
                      <p className="text-xs text-slate-500 mt-0.5">Call briefs</p>
                    </div>
                  </div>
                );
              })()}

              {/* Item table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <span>Company</span>
                  <span>Contact / Phone</span>
                  <span>Source</span>
                  <span>Intent</span>
                  <span>Brief</span>
                  <span></span>
                </div>
                <ScrollArea className="max-h-96">
                  {(refreshedBatch.items ?? []).map(item => {
                    const v = validateBatchItem(item);
                    return (
                      <div key={item.itemId} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 border-b border-slate-50 items-center hover:bg-slate-50 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {!v.valid && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                          <span className="font-medium truncate">{item.target.businessName}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs">{item.target.contactName ?? '—'}</p>
                          <p className="font-mono text-xs text-slate-500">{item.target.phone ?? <span className="text-red-500">No phone</span>}</p>
                        </div>
                        <span className="text-xs">{SOURCE_LABELS[item.target.source] ?? item.target.source}</span>
                        <span className="text-xs">{INTENT_LABELS[item.context?.callIntent] ?? '—'}</span>
                        <div>
                          {item.briefStatus === 'ready'
                            ? <span className="text-green-700 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" />Ready</span>
                            : item.briefStatus === 'failed'
                              ? <span className="text-red-600 text-xs">Failed</span>
                              : <span className="text-slate-400 text-xs">Pending</span>}
                        </div>
                        <div className="flex gap-1">
                          {item.briefStatus === 'ready' && (
                            <button onClick={() => { setInspectBrief(item.brief ?? null); setShowBriefModal(true); }} className="p-1 hover:bg-slate-100 rounded" data-testid={`review-inspect-${item.itemId}`}>
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </ScrollArea>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── RESULTS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="results" className="flex-1 overflow-y-auto p-6 mt-0">
          <h3 className="font-semibold text-slate-800 mb-4">Call Results</h3>
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">No call results yet</p>
              <p className="text-sm">Results will appear here after Erica completes calls</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((result: any) => (
                <div key={result.resultId} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${result.booked ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                        {result.booked ? '✓ Booked' : result.outcome?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(result.recordedAt).toLocaleDateString('en-AU')}</span>
                  </div>
                  {result.summaryNotes && <p className="text-sm text-slate-700">{result.summaryNotes}</p>}
                  {result.nextStep && <p className="text-xs text-slate-500 mt-1">Next step: {result.nextStep}</p>}
                  {result.followUpRequired && (
                    <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Follow-up required {result.followUpDate ? `by ${new Date(result.followUpDate).toLocaleDateString('en-AU')}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── EXECUTION TAB ────────────────────────────────────────────── */}
        <TabsContent value="execution" className="flex-1 overflow-y-auto p-6 mt-0 space-y-6">

          {/* Batch launch controls */}
          {batches.filter(b => b.status === 'ready' || b.status === 'active').length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Radio className="w-4 h-4 text-blue-600" /> Ready to Launch</h3>
              {batches.filter(b => b.status === 'ready' || b.status === 'active').map(batch => (
                <Card key={batch.batchId} className="border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium text-slate-800">{batch.name}</p>
                        <p className="text-xs text-slate-500">{batch.totalTargets} targets · {batch.completedCalls} completed · {batch.bookedCalls} booked</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          disabled={launchNextMutation.isPending}
                          onClick={() => handleLaunchNext(batch.batchId)}
                          data-testid={`btn-launch-next-${batch.batchId}`}
                        >
                          {launchNextMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <SkipForward className="w-3.5 h-3.5 mr-1.5" />}
                          Launch Next
                        </Button>
                      </div>
                    </div>
                    {/* Item-level list */}
                    <div className="space-y-1.5">
                      {batch.items?.filter(i => i.status === 'pending' || i.status === 'brief_ready').slice(0, 5).map(item => (
                        <div key={item.itemId} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
                          <div className="flex items-center gap-2">
                            {item.sourceType === 'lead' ? <User className="w-3.5 h-3.5 text-slate-400" /> : <Building2 className="w-3.5 h-3.5 text-slate-400" />}
                            <span className="text-sm text-slate-700">{item.targetName}</span>
                            <Badge variant="outline" className="text-xs capitalize">{item.status.replace('_', ' ')}</Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-green-700 hover:bg-green-50 hover:text-green-800"
                            disabled={launchingItemId === item.itemId || item.status !== 'brief_ready'}
                            onClick={() => handleLaunchItem(batch.batchId, item.itemId)}
                            data-testid={`btn-launch-item-${item.itemId}`}
                          >
                            {launchingItemId === item.itemId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3 mr-1" />}
                            Call
                          </Button>
                        </div>
                      ))}
                      {(batch.items?.filter(i => i.status === 'pending' || i.status === 'brief_ready').length ?? 0) > 5 && (
                        <p className="text-xs text-slate-400 text-center pt-1">
                          +{(batch.items?.filter(i => i.status === 'pending' || i.status === 'brief_ready').length ?? 0) - 5} more pending items
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Live calls stream */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-600" /> Live Call Feed
                <span className="text-xs font-normal text-slate-400">(auto-refreshes every 5s)</span>
              </h3>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500" onClick={() => refetchCalls()} data-testid="btn-refresh-calls">
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </div>

            {callsLoading ? (
              <div className="flex items-center justify-center h-20 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading calls…</div>
            ) : liveCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-slate-400">
                <PhoneMissed className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No calls recorded yet</p>
                <p className="text-xs mt-0.5">Launch a call from a ready batch to see it here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {liveCalls.map((call: any) => {
                  const isActive = call.phase && !['completed', 'failed', 'no_answer'].includes(call.phase);
                  return (
                    <Card key={call.id} className={`border ${isActive ? 'border-green-300 bg-green-50/30' : 'border-slate-200'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {isActive
                              ? <Radio className="w-4 h-4 text-green-600 animate-pulse" />
                              : call.phase === 'failed' || call.phase === 'no_answer'
                                ? <PhoneMissed className="w-4 h-4 text-red-400" />
                                : <CheckCircle className="w-4 h-4 text-slate-400" />
                            }
                            <span className="font-medium text-sm text-slate-800">{call.targetName ?? call.id}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${
                                isActive ? 'border-green-400 text-green-700' :
                                call.phase === 'failed' ? 'border-red-300 text-red-600' :
                                'border-slate-300 text-slate-500'
                              }`}
                            >
                              {call.phase?.replace(/_/g, ' ') ?? 'unknown'}
                            </Badge>
                            {call.launchedAt && (
                              <span className="text-xs text-slate-400">
                                {new Date(call.launchedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Transcript excerpt */}
                        {call.transcriptExcerpt && (
                          <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded px-2 py-1.5 italic mt-1">
                            "{call.transcriptExcerpt}"
                          </p>
                        )}

                        {/* Outcome */}
                        {call.outcome && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-slate-500">Outcome:</span>
                            <Badge variant="outline" className={`text-xs ${call.booked ? 'border-green-400 text-green-700' : 'border-slate-300 text-slate-500'}`}>
                              {call.booked ? '✓ Booked' : call.outcome?.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                          {call.vapiCallId && <span>Vapi: {call.vapiCallId.slice(0, 12)}…</span>}
                          {call.batchId && <span>Batch: {call.batchId.slice(0, 8)}…</span>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── INSPECT TAB ─────────────────────────────────────────────── */}
        <TabsContent value="inspect" className="flex-1 overflow-y-auto p-6 mt-0 space-y-6">

          {/* Event audit log */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-purple-600" /> Event Audit Log
              </h3>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500" onClick={() => refetchEvents()} data-testid="btn-refresh-events">
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </div>

            {eventsLoading ? (
              <div className="flex items-center justify-center h-20 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading events…</div>
            ) : auditEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-slate-400">
                <Activity className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No webhook events recorded yet</p>
                <p className="text-xs mt-0.5">Erica call events will appear here after calls begin</p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditEvents.map((ev: any) => (
                  <div key={ev.id} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono border-purple-200 text-purple-700">
                          {ev.eventType ?? ev.messageType ?? 'unknown'}
                        </Badge>
                        {ev.batchId && (
                          <span className="text-xs text-slate-500">batch: {ev.batchId.slice(0, 8)}…</span>
                        )}
                        {ev.itemId && (
                          <span className="text-xs text-slate-500">item: {ev.itemId.slice(0, 8)}…</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {ev.receivedAt ? new Date(ev.receivedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                      </span>
                    </div>
                    {ev.notes && <p className="text-xs text-slate-500 mt-1">{ev.notes}</p>}
                    {ev.error && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{ev.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System configuration summary */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-blue-600" /> Execution Configuration
            </h3>
            <Card className="border border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <p className="text-slate-500 mb-0.5">Webhook endpoint</p>
                    <p className="font-mono text-slate-700">/api/vapi/webhook</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Auth header</p>
                    <p className="font-mono text-slate-700">Authorization: Bearer {'{'}secret{'}'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Launch endpoint</p>
                    <p className="font-mono text-slate-700">/api/erica/orgs/:orgId/batches/:batchId/items/:itemId/launch-call</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Reconciler</p>
                    <p className="font-mono text-slate-700">isEricaCall() → batchId + itemId in metadata</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Call routing</p>
                    <p className="font-mono text-slate-700">Erica calls → ericaWebhookReconciler</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Non-Erica calls</p>
                    <p className="font-mono text-slate-700">→ generic Vapi handlers</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-slate-600">Erica calls require explicit human selection + brief generation before launch</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-slate-600">No autonomous bulk dialling — every call is human-approved</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-slate-600">All webhook events are reconciled and written to Firestore</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      {/* Brief inspector modal */}
      <BriefInspectorDialog
        brief={inspectBrief}
        open={showBriefModal}
        onClose={() => { setShowBriefModal(false); setInspectBrief(null); }}
      />
    </div>
  );
}

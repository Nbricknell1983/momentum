import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, Copy, ChevronDown,
  ChevronRight, RefreshCw, Zap, Shield, Globe, Link2, User,
  Clock, Settings2, ArrowLeft, ExternalLink, Eye, EyeOff, Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Skill {
  id: string; name: string; description: string;
  method: string; path: string; risk: string;
  headers: Record<string, string>;
  body?: Record<string, string>;
  params?: { name: string; type: string; required: boolean }[];
}

interface Agent {
  id: string; name: string; description: string;
  skills: string[]; tier: string;
}

interface CronJob {
  id: string; name: string; description: string;
  agentId: string; schedule: string; risk: string;
}

interface Manifest {
  appUrl: string;
  keyConfigured: boolean;
  skills: Skill[];
  agents: Agent[];
  cronJobs: CronJob[];
}

interface ProvisionResult {
  report: { type: string; id: string; status: 'created' | 'exists' | 'failed'; message?: string }[];
  created: number;
  failed: number;
  exists: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const RISK_BADGE: Record<string, string> = {
  low:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  high:   'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
};

const TIER_BADGE: Record<string, string> = {
  leadership: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
  execution:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  control:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function StatusIcon({ ok, warning, loading }: { ok?: boolean; warning?: boolean; loading?: boolean }) {
  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (warning) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (ok) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: 'Copied to clipboard' });
  };
  return (
    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} data-testid="button-copy">
      <Copy className={`h-3 w-3 ${copied ? 'text-emerald-500' : 'text-muted-foreground'}`} />
    </Button>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors[method] || 'bg-muted text-muted-foreground'}`}>
      {method}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function OpenClawSetupPage() {
  const { isManager, orgId } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [baseUrl, setBaseUrl] = useState('');
  const [savedBaseUrl, setSavedBaseUrl] = useState('');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'ok' | 'failed'>('unknown');
  const [testingConn, setTestingConn] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);

  if (!isManager) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Manager access required</p>
      </div>
    );
  }

  // Fetch manifest
  const { data: manifest, isLoading: loadingManifest } = useQuery<Manifest>({
    queryKey: ['/api/openclaw/manifest'],
  });

  // Fetch saved config
  const { data: savedConfig } = useQuery({
    queryKey: ['/api/openclaw/config', orgId],
    queryFn: async () => {
      if (!orgId) return { baseUrl: '' };
      const r = await fetch(`/api/openclaw/config?orgId=${orgId}`);
      return r.json();
    },
    enabled: !!orgId,
  });

  useEffect(() => {
    if (savedConfig?.baseUrl) {
      setBaseUrl(savedConfig.baseUrl);
      setSavedBaseUrl(savedConfig.baseUrl);
    }
  }, [savedConfig]);

  // Save config
  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!orgId || !baseUrl.trim()) return;
      await apiRequest('POST', '/api/openclaw/config', { orgId, baseUrl: baseUrl.trim() });
    },
    onSuccess: () => {
      setSavedBaseUrl(baseUrl.trim());
      qc.invalidateQueries({ queryKey: ['/api/openclaw/config', orgId] });
      toast({ title: 'Base URL saved' });
    },
    onError: (err: any) => toast({ title: 'Save failed', description: err.message, variant: 'destructive' }),
  });

  // Test connection
  const testConnection = async () => {
    if (!baseUrl.trim()) return;
    setTestingConn(true);
    setConnectionStatus('unknown');
    try {
      const r = await fetch('/api/openclaw/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: baseUrl.trim() }),
      });
      const data = await r.json();
      setConnectionStatus(data.connected ? 'ok' : 'failed');
    } catch {
      setConnectionStatus('failed');
    } finally {
      setTestingConn(false);
    }
  };

  // Provision
  const provision = useMutation({
    mutationFn: async () => {
      if (!orgId || !savedBaseUrl) throw new Error('Save a base URL first');
      const r = await fetch('/api/openclaw/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, baseUrl: savedBaseUrl }),
      });
      return r.json() as Promise<ProvisionResult>;
    },
    onSuccess: (data) => {
      setProvisionResult(data);
      const { created, failed, exists } = data;
      toast({
        title: `Provisioning complete`,
        description: `${created} created, ${exists} already existed, ${failed} failed`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
    },
    onError: (err: any) => toast({ title: 'Provision failed', description: err.message, variant: 'destructive' }),
  });

  // Copy full JSON export
  const exportJson = () => {
    if (!manifest) return;
    const out = {
      _note: 'Momentum OpenClaw Configuration Export',
      appBaseUrl: manifest.appUrl,
      skills: manifest.skills.map(s => ({
        name: s.name,
        method: s.method,
        url: `${manifest.appUrl}${s.path}`,
        headers: { 'x-openclaw-key': '<<YOUR_OPENCLAW_API_KEY>>', 'Content-Type': 'application/json' },
        risk: s.risk,
        description: s.description,
      })),
      agents: manifest.agents.map(a => ({
        name: a.name,
        description: a.description,
        skills: a.skills,
        tier: a.tier,
      })),
      cronJobs: manifest.cronJobs,
    };
    navigator.clipboard.writeText(JSON.stringify(out, null, 2));
    toast({ title: 'Full config JSON copied to clipboard' });
  };

  if (loadingManifest) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading manifest...
      </div>
    );
  }

  const baseUrlSaved = savedBaseUrl.length > 0;
  const urlChanged = baseUrl.trim() !== savedBaseUrl;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/bullpen">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back-bullpen">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold">OpenClaw Setup</h1>
            <p className="text-xs text-muted-foreground">Momentum is the control plane. OpenClaw is the execution runtime.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportJson} data-testid="button-export-json">
          <Copy className="h-3 w-3" /> Export Full Config JSON
        </Button>
      </div>

      {/* ── Connection Status ── */}
      <Card className="border" data-testid="card-connection-status">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" /> Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* API Key */}
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <StatusIcon ok={manifest?.keyConfigured} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">API Key</p>
                <p className="text-[11px] text-muted-foreground">
                  {manifest?.keyConfigured ? 'OPENCLAW_API_KEY is configured' : 'OPENCLAW_API_KEY not set — add it to your Replit secrets'}
                </p>
              </div>
            </div>
            {/* Base URL */}
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <StatusIcon ok={baseUrlSaved} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">Base URL</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {savedBaseUrl || 'Not configured — enter below'}
                </p>
              </div>
            </div>
            {/* Connection Test */}
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <StatusIcon
                loading={testingConn}
                ok={connectionStatus === 'ok'}
                warning={connectionStatus === 'unknown' && !testingConn}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">Live Connection</p>
                <p className="text-[11px] text-muted-foreground">
                  {testingConn ? 'Testing...' : connectionStatus === 'ok' ? 'Reachable' : connectionStatus === 'failed' ? 'Cannot reach OpenClaw' : 'Not tested yet'}
                </p>
              </div>
            </div>
          </div>

          {/* Base URL Input */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">OpenClaw Base URL</p>
            <div className="flex gap-2">
              <Input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:18789  or  https://your-openclaw.example.com"
                className="text-xs font-mono flex-1"
                data-testid="input-openclaw-base-url"
              />
              {urlChanged && (
                <Button size="sm" className="text-xs" onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending} data-testid="button-save-base-url">
                  {saveConfig.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                </Button>
              )}
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={testConnection} disabled={!baseUrl.trim() || testingConn} data-testid="button-test-connection">
                {testingConn ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Test
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              This URL is stored per-organisation and only used to provision OpenClaw. It is never sent to clients.
            </p>
          </div>

          {/* App URL */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Momentum App URL (sent to OpenClaw as endpoint base)</p>
              <CopyButton text={manifest?.appUrl || ''} />
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-1">{manifest?.appUrl}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Provision Action ── */}
      <Card className={`border-2 ${provisionResult ? 'border-emerald-200 dark:border-emerald-800' : 'border-dashed'}`} data-testid="card-provision">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold">Auto-Provision OpenClaw</p>
                <Badge variant="outline" className="text-[10px]">Safe defaults only</Badge>
              </div>
              <p className="text-xs text-muted-foreground max-w-lg">
                Momentum will attempt to create all required skills and agents in OpenClaw via its REST API. 
                High-risk communication capabilities (SMS, email) are <strong>never auto-enabled</strong> — they must be manually activated after your guardrails are live.
              </p>
              {provisionResult && (
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> {provisionResult.created} created</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><Info className="h-3 w-3" /> {provisionResult.exists} already existed</span>
                  {provisionResult.failed > 0 && <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><XCircle className="h-3 w-3" /> {provisionResult.failed} failed</span>}
                </div>
              )}
            </div>
            <Button
              size="sm"
              className="gap-1.5 text-xs shrink-0"
              onClick={() => provision.mutate()}
              disabled={!baseUrlSaved || provision.isPending}
              data-testid="button-provision"
            >
              {provision.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {provision.isPending ? 'Provisioning...' : 'Provision OpenClaw'}
            </Button>
          </div>

          {/* Provision report */}
          {provisionResult && provisionResult.report.length > 0 && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_1fr] text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/50 px-3 py-2 border-b">
                <span>Item</span><span>Type</span><span>Result</span>
              </div>
              {provisionResult.report.map((r, i) => (
                <div key={i} className={`grid grid-cols-[1fr_80px_1fr] items-center px-3 py-2 text-xs border-b last:border-0 ${r.status === 'failed' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                  <span className="font-mono text-[11px]">{r.id}</span>
                  <span className="text-muted-foreground">{r.type}</span>
                  <span className={`flex items-center gap-1 ${r.status === 'created' ? 'text-emerald-600 dark:text-emerald-400' : r.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    {r.status === 'created' ? <CheckCircle2 className="h-3 w-3" /> : r.status === 'exists' ? <Info className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {r.status === 'created' ? 'Created' : r.status === 'exists' ? 'Already exists' : r.message || 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!baseUrlSaved && (
            <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" /> Save a base URL above before provisioning
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Manual Steps ── */}
      <Card className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-manual-steps">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Manual Admin Steps Required</p>
          </div>
          <ul className="space-y-2">
            {[
              { step: 'Confirm the OPENCLAW_API_KEY secret matches what you\'ve set in OpenClaw\'s Authentication settings', done: manifest?.keyConfigured },
              { step: 'Verify at least one Node is registered and running in OpenClaw → Agent → Nodes', done: false },
              { step: 'Enable high-risk skills (send-approved-sms, send-approved-email) only after approval guardrails + work-hour rules are live', done: false },
              { step: 'Set the production base URL above and confirm it before running cron jobs against it', done: baseUrlSaved },
              { step: 'Register any Cron Jobs via OpenClaw → Cron Jobs (see definitions below)', done: false },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <StatusIcon ok={item.done} warning={!item.done} />
                <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.step}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── Skills Manifest ── */}
      <div data-testid="section-skills">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" /> Skills — {manifest?.skills.length ?? 0} defined
          </h2>
          <p className="text-[11px] text-muted-foreground">Click a skill to see the full endpoint spec</p>
        </div>
        <div className="space-y-2">
          {manifest?.skills.map(skill => (
            <Card key={skill.id} className={`border ${skill.risk === 'high' ? 'border-red-200 dark:border-red-800' : ''}`} data-testid={`card-skill-${skill.id}`}>
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left"
                  onClick={() => setExpandedSkill(expandedSkill === skill.id ? null : skill.id)}
                  data-testid={`button-expand-skill-${skill.id}`}
                >
                  <MethodBadge method={skill.method} />
                  <span className="flex-1 text-xs font-mono font-semibold">{skill.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${RISK_BADGE[skill.risk]}`}>
                    {skill.risk} risk
                  </span>
                  {skill.risk === 'high' && <Shield className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                  {expandedSkill === skill.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>

                {expandedSkill === skill.id && (
                  <div className="border-t px-3 pb-3 pt-2 space-y-3">
                    <p className="text-xs text-muted-foreground">{skill.description}</p>

                    {skill.risk === 'high' && (
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                        <Shield className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-red-700 dark:text-red-400 font-medium">
                          HIGH RISK — Do not enable in OpenClaw until comms guardrails (work-hour rules + approval requirements) are fully live. Auto-provisioning skips this skill intentionally.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Endpoint</p>
                        <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50 border font-mono">
                          <span className="text-[11px] text-foreground break-all">{manifest.appUrl}{skill.path}</span>
                          <CopyButton text={`${manifest.appUrl}${skill.path}`} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Required Header</p>
                        <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50 border font-mono">
                          <span className="text-[11px] text-foreground break-all">x-openclaw-key: [your key]</span>
                          <CopyButton text="x-openclaw-key" />
                        </div>
                      </div>
                    </div>

                    {skill.body && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Request Body Schema</p>
                        <div className="relative p-2 rounded bg-muted/50 border">
                          <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80">{JSON.stringify(skill.body, null, 2)}</pre>
                          <div className="absolute top-1.5 right-1.5">
                            <CopyButton text={JSON.stringify(skill.body, null, 2)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Agents Manifest ── */}
      <div data-testid="section-agents">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <User className="h-3.5 w-3.5" /> Agents — {manifest?.agents.length ?? 0} Bullpen roles
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {manifest?.agents.map(agent => (
            <Card key={agent.id} className="border" data-testid={`card-agent-${agent.id}`}>
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left"
                  onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                  data-testid={`button-expand-agent-${agent.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold truncate">{agent.name}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${TIER_BADGE[agent.tier] || ''}`}>{agent.tier}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{agent.skills.length} skills assigned</p>
                  </div>
                  {expandedAgent === agent.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </button>

                {expandedAgent === agent.id && (
                  <div className="border-t px-3 pb-3 pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">{agent.description}</p>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Assigned Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.skills.map(s => {
                          const skill = manifest.skills.find(sk => sk.id === s);
                          return (
                            <span key={s} className={`text-[11px] px-2 py-0.5 rounded border font-mono ${skill?.risk === 'high' ? 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20' : 'bg-muted text-muted-foreground'}`}>
                              {s}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Cron Jobs ── */}
      <div data-testid="section-cron-jobs">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" /> Cron Jobs — manual registration in OpenClaw
        </h2>
        <div className="space-y-2">
          {manifest?.cronJobs.map(cron => (
            <Card key={cron.id} className="border" data-testid={`card-cron-${cron.id}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold">{cron.name}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${RISK_BADGE[cron.risk]}`}>{cron.risk}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{cron.description}</p>
                    <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {cron.schedule}</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> Agent: {cron.agentId}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground shrink-0 text-right">
                    <p className="font-medium">Manual step</p>
                    <p>OpenClaw → Cron Jobs → New Job</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="p-4 rounded-xl border bg-muted/30 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold">Tenant isolation reminder</p>
        <p>This setup page is internal-only. Clients never see OpenClaw configuration. Business logic stays in Momentum — OpenClaw is only the execution runtime for AI-approved actions. All inbound OpenClaw calls are validated against the <code className="font-mono bg-muted px-1 rounded">OPENCLAW_API_KEY</code> secret before any action is taken.</p>
      </div>

    </div>
  );
}

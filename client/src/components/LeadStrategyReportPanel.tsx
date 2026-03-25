/**
 * LeadStrategyReportPanel
 *
 * Internal admin panel for generating and managing a client-facing strategy
 * report from a lead's existing intelligence data.
 *
 * Actions: generate/refresh, share link copy, revoke, lock for proposal, view version history.
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  FileText, Share2, RefreshCw, Lock, XCircle, Eye, Clock, CheckCircle2,
  Copy, Check, ExternalLink, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Sparkles, Shield, History, ArrowUpRight, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { Lead } from '@/lib/types';

interface StrategyReportMeta {
  id: string;
  publicSlug: string;
  status: 'draft' | 'active' | 'locked' | 'revoked';
  lockedForProposal?: boolean;
  lockedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt?: string;
  url: string;
}

interface Snapshot {
  id: string;
  label: string;
  takenAt: string;
  locked: boolean;
}

interface LeadStrategyReportPanelProps {
  lead: Lead;
  orgId: string;
  preparedBy?: string;
  preparedByEmail?: string;
  phone?: string;
}

function useCopy(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), timeout);
  };
  return { copied, copy };
}

function statusBadge(status: string) {
  switch (status) {
    case 'active': return { label: 'Active', classes: 'bg-green-500/15 text-green-400 border-green-500/30' };
    case 'locked': return { label: 'Locked', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    case 'revoked': return { label: 'Revoked', classes: 'bg-red-500/15 text-red-400 border-red-500/30' };
    default: return { label: 'Draft', classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
  }
}

export default function LeadStrategyReportPanel({ lead, orgId, preparedBy, preparedByEmail, phone }: LeadStrategyReportPanelProps) {
  const { toast } = useToast();
  const { copied, copy } = useCopy();

  const [report, setReport] = useState<StrategyReportMeta | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [locking, setLocking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const shareUrl = report ? `${window.location.origin}/strategy/${report.id}` : null;

  // On mount: check if this lead already has a report
  useEffect(() => {
    if (!lead?.id) return;
    setLoading(true);

    const checkExisting = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) { setLoading(false); return; }

        // Check via strategyReportId on lead (if set)
        const reportId = (lead as any).strategyReportId;
        if (reportId) {
          const res = await fetch(`/api/strategy-reports/${reportId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.error) {
              setReport({
                id: data.id,
                publicSlug: data.publicSlug,
                status: data.status || 'active',
                lockedForProposal: data.lockedForProposal,
                lockedAt: data.lockedAt,
                revokedAt: data.revokedAt,
                createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || '',
                updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || '',
                url: `/strategy/${data.id}`,
              });
              setLoading(false);
              return;
            }
          }
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    checkExisting();
  }, [lead?.id]);

  const loadHistory = async () => {
    if (!report) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/strategy-reports/${report.id}/snapshots`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data);
        setHistoryLoaded(true);
      }
    } catch {
      // silent
    }
  };

  const handleGenerate = async (lockVersion = false) => {
    setGenerating(true);
    setErrorMsg(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/strategy-reports/from-lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leadId: lead.id,
          orgId,
          preparedBy: preparedBy || '',
          preparedByEmail: preparedByEmail || '',
          phone: phone || '',
          lockVersion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setReport({
        id: data.id,
        publicSlug: data.publicSlug,
        status: lockVersion ? 'locked' : 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: data.url,
      });
      toast({
        title: lockVersion ? 'Strategy locked for proposal' : 'Strategy report generated',
        description: lockVersion
          ? 'This version is now locked. Regenerating will create a new version.'
          : 'Share the link with your prospect to present this strategy.',
      });
      // Reload history after generating
      setHistoryLoaded(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
      toast({ title: 'Error', description: err.message || 'Failed to generate strategy report', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async () => {
    if (!report) return;
    if (!confirm('Revoke this strategy report? The share link will stop working immediately.')) return;
    setRevoking(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`/api/strategy-reports/${report.id}/revoke`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to revoke');
      setReport(prev => prev ? { ...prev, status: 'revoked', revokedAt: new Date().toISOString() } : prev);
      toast({ title: 'Report revoked', description: 'The share link is now inactive.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRevoking(false);
    }
  };

  const handleLock = async () => {
    if (!report) return;
    setLocking(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`/api/strategy-reports/${report.id}/lock`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to lock');
      setReport(prev => prev ? { ...prev, status: 'locked', lockedForProposal: true, lockedAt: new Date().toISOString() } : prev);
      toast({ title: 'Report locked', description: 'This version is preserved. Use Refresh to generate a new version.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLocking(false);
    }
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      return format(new Date(iso), 'dd/MM/yyyy HH:mm');
    } catch { return iso; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  const badge = report ? statusBadge(report.status) : null;

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <FileText className="h-4 w-4 text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">Client Strategy Report</h3>
          <p className="text-xs text-slate-500">Generate a shareable presentation from this lead's intelligence data</p>
        </div>
        {badge && (
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.classes}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* ── What will be generated ── */}
      {!report && (
        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-300">What this generates</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Globe, label: 'Visibility diagnosis', desc: 'Score ring + subscores' },
              { icon: ArrowUpRight, label: 'Market opportunity', desc: 'Search demand + keywords' },
              { icon: Sparkles, label: 'Growth roadmap', desc: 'Phases + quick wins' },
              { icon: Shield, label: 'Confidence block', desc: 'Observed vs estimated' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-white">{label}</p>
                  <p className="text-[10px] text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Powered by existing intelligence — no additional AI calls required. Data quality reflects how much intelligence has been gathered for this lead.
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{errorMsg}</p>
        </div>
      )}

      {/* ── No report yet ── */}
      {!report && (
        <Button
          onClick={() => handleGenerate(false)}
          disabled={generating}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white"
          data-testid="button-generate-strategy-report"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating strategy…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />Generate Strategy Report</>
          )}
        </Button>
      )}

      {/* ── Existing report panel ── */}
      {report && (
        <div className="space-y-3">

          {/* Share link */}
          {report.status !== 'revoked' && shareUrl && (
            <div className="bg-white/4 border border-white/10 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Share Link</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-300 font-mono truncate">{shareUrl}</p>
                </div>
                <button
                  onClick={() => copy(shareUrl)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  data-testid="button-copy-share-link"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  data-testid="link-open-strategy-report"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              </div>
              {report.lockedForProposal && (
                <div className="flex items-center gap-1.5 text-[10px] text-blue-400">
                  <Lock className="h-3 w-3" />
                  <span>Locked for proposal — this version is preserved</span>
                </div>
              )}
            </div>
          )}

          {/* Revoked state */}
          {report.status === 'revoked' && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">This report has been revoked. The share link is no longer active.</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-500">
            <div>
              <p className="font-semibold text-slate-400 mb-0.5">Generated</p>
              <p>{fmtDate(report.createdAt)}</p>
            </div>
            {report.updatedAt && report.updatedAt !== report.createdAt && (
              <div>
                <p className="font-semibold text-slate-400 mb-0.5">Last updated</p>
                <p>{fmtDate(report.updatedAt)}</p>
              </div>
            )}
            {report.lockedAt && (
              <div>
                <p className="font-semibold text-slate-400 mb-0.5">Locked at</p>
                <p>{fmtDate(report.lockedAt)}</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Refresh (regenerate) */}
            {report.status !== 'revoked' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="text-xs border-white/15 text-slate-300 hover:text-white hover:bg-white/5"
                data-testid="button-refresh-strategy-report"
              >
                {generating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Refresh
              </Button>
            )}

            {/* Lock for proposal */}
            {report.status === 'active' && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLock}
                disabled={locking}
                className="text-xs border-blue-500/30 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                data-testid="button-lock-strategy-report"
              >
                {locking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
                Lock for Proposal
              </Button>
            )}

            {/* Regenerate locked */}
            {report.status === 'locked' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="text-xs border-white/15 text-slate-300 hover:text-white hover:bg-white/5"
                data-testid="button-new-version-strategy-report"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                New Version
              </Button>
            )}

            {/* Preview */}
            {report.status !== 'revoked' && shareUrl && (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-white/15 text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                data-testid="link-preview-strategy-report"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview as client
              </a>
            )}

            {/* Revoke */}
            {report.status === 'active' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRevoke}
                disabled={revoking}
                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                data-testid="button-revoke-strategy-report"
              >
                {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                Revoke
              </Button>
            )}

            {/* Re-generate from revoked */}
            {report.status === 'revoked' && (
              <Button
                size="sm"
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white"
                data-testid="button-regenerate-strategy-report"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                Generate New Report
              </Button>
            )}
          </div>

          {/* Version history */}
          <div className="border-t border-white/8 pt-3">
            <button
              onClick={() => {
                const next = !showHistory;
                setShowHistory(next);
                if (next && !historyLoaded) loadHistory();
              }}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors"
              data-testid="button-toggle-strategy-history"
            >
              <History className="h-3.5 w-3.5" />
              <span>Version history</span>
              {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2">
                {!historyLoaded ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                    <span className="text-xs text-slate-500">Loading…</span>
                  </div>
                ) : snapshots.length === 0 ? (
                  <p className="text-xs text-slate-600 italic">No version history yet.</p>
                ) : (
                  snapshots.map((snap) => (
                    <div key={snap.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                        {snap.locked
                          ? <Lock className="h-3 w-3 text-blue-400" />
                          : <Clock className="h-3 w-3 text-slate-500" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-white font-medium">{snap.label}</p>
                        <p className="text-[10px] text-slate-500">{fmtDate(snap.takenAt)}</p>
                      </div>
                      {snap.locked && (
                        <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-full">Locked</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Generate locked version ── */}
      {report && report.status === 'active' && (
        <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 flex items-start gap-3">
          <Shield className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-xs font-semibold text-blue-300">Send to proposal?</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Lock this version to preserve it for the proposal conversation. Refreshing will create a new version without overwriting the locked one.
            </p>
            <Button
              size="sm"
              onClick={() => handleGenerate(true)}
              disabled={generating}
              className="text-xs bg-blue-600/40 hover:bg-blue-600/60 border border-blue-500/30 text-blue-300"
              data-testid="button-lock-and-generate-strategy"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
              Lock & preserve this version
            </Button>
          </div>
        </div>
      )}

      {/* ── Intelligence quality indicator ── */}
      <div className="border-t border-white/8 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Data quality for this report</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Growth Prescription', present: !!(lead as any).growthPrescription },
            { label: 'Strategy Diagnosis', present: !!(lead as any).strategyDiagnosis },
            { label: 'Call Prep Pack', present: !!(lead as any).aiCallPrepOutput || !!(lead as any).prepCallPack },
            { label: 'Ahrefs Keywords', present: !!(lead as any).ahrefsData?.keywords?.length },
            { label: 'Competitor Data', present: !!(lead as any).competitorData?.competitors?.length },
            { label: 'Website Crawl', present: !!(lead as any).crawledPages?.length || !!(lead as any).sitemapPages?.length },
          ].map(({ label, present }) => (
            <div key={label} className="flex items-center gap-1.5">
              {present
                ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                : <div className="h-3 w-3 rounded-full border border-white/20 shrink-0" />}
              <span className={`text-[10px] ${present ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-2">
          {['growthPrescription', 'strategyDiagnosis', 'aiCallPrepOutput', 'prepCallPack', 'ahrefsData', 'competitorData', 'crawledPages', 'sitemapPages'].filter(f => !!(lead as any)[f]).length < 3
            ? 'Limited intelligence gathered — report will use category benchmarks. Run the AI engines to enrich this lead first.'
            : 'Sufficient intelligence to generate a meaningful strategy report.'}
        </p>
      </div>
    </div>
  );
}

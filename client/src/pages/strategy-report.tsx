import { useEffect, useState, useRef } from 'react';
import { useParams } from 'wouter';
import {
  CheckCircle2, TrendingUp, AlertCircle, ChevronRight, Target, Zap, MapPin,
  BarChart3, Globe, Star, ArrowUpRight, Phone, Mail, XCircle, AlertTriangle,
  Minus, Eye, Shield, Users, Search, Brain, Layers, Flame, Clock, Copy, Check,
  ChevronDown, ChevronUp, Loader2, Sparkles, Package,
} from 'lucide-react';

interface StrategyReport {
  id: string; businessName: string; industry?: string; location?: string;
  websiteUrl?: string; preparedBy?: string; preparedByEmail?: string; phone?: string;
  strategyDiagnosis?: any;
  strategy?: any;
  createdAt?: any;
  orgId?: string;
  acceptedScope?: {
    acceptedServices: string[];
    contactName: string;
    contactEmail: string;
    notes: string;
    acceptedAt: string;
  };
}

const STANDARD_SERVICES = [
  { key: 'Website', label: 'Website', icon: '🌐', description: 'New site or rebuild' },
  { key: 'SEO', label: 'SEO', icon: '🔍', description: 'Search engine ranking' },
  { key: 'Google Business Profile', label: 'Google Business Profile', icon: '📍', description: 'GBP optimisation' },
  { key: 'Google Ads', label: 'Google Ads', icon: '📢', description: 'Paid search campaigns' },
  { key: 'Social Media', label: 'Social Media', icon: '📱', description: 'Social presence & content' },
  { key: 'CRM & Automation', label: 'CRM & Automation', icon: '⚙️', description: 'Leads & follow-up systems' },
  { key: 'Content', label: 'Content', icon: '✍️', description: 'Content strategy & creation' },
];

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = 40; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? '#16a34a' : score >= 45 ? '#d97706' : '#dc2626';
  const label = score >= 70 ? 'Strong' : score >= 45 ? 'Growing' : 'Early Stage';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x="50" y="46" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">{score}</text>
        <text x="50" y="60" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8">/ 100</text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-bold text-white">{score}/100</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function TriangleScoreCard({ label, icon: Icon, score, evidence, interpretation, color }: {
  label: string; icon: any; score: number; evidence: string; interpretation: string; color: string;
}) {
  const barColor = score >= 70 ? '#16a34a' : score >= 45 ? '#d97706' : '#dc2626';
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
            <p className="text-lg font-black text-white mt-0.5">{score}/100</p>
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl border-2 flex items-center justify-center text-sm font-black"
          style={{ borderColor: barColor, color: barColor }}>
          {score}
        </div>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${score}%`, backgroundColor: barColor }} />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-slate-400 leading-relaxed">{evidence}</p>
        <p className="text-xs text-slate-300 font-medium leading-relaxed border-l-2 border-blue-500/50 pl-3">{interpretation}</p>
      </div>
    </div>
  );
}

function DiscoveryPathStage({ stage, strength, issue, impact, index, total }: {
  stage: string; strength: string; issue: string; impact: string; index: number; total: number;
}) {
  const isStrong = strength === 'strong';
  const isPartial = strength === 'partial';
  const isWeak = strength === 'weak';
  const bg = isStrong ? 'bg-green-500/15 border-green-500/30' : isPartial ? 'bg-amber-500/15 border-amber-500/30' : 'bg-red-500/15 border-red-500/30';
  const dot = isStrong ? 'bg-green-500' : isPartial ? 'bg-amber-500' : 'bg-red-500';
  const text = isStrong ? 'text-green-400' : isPartial ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-stretch gap-4">
      <div className="flex flex-col items-center gap-0">
        <div className={`w-8 h-8 rounded-full ${dot} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-lg`}>{index + 1}</div>
        {index < total - 1 && <div className="w-0.5 flex-1 mt-1" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.05))' }} />}
      </div>
      <div className={`flex-1 mb-4 border rounded-xl p-4 space-y-2 ${bg}`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-white">{stage}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${text} bg-white/5`}>{strength}</span>
        </div>
        {issue && <p className="text-xs text-slate-300 leading-relaxed">{issue}</p>}
        {impact && <p className="text-[11px] text-slate-400 leading-relaxed italic">{impact}</p>}
      </div>
    </div>
  );
}

function IntentCoverageRow({ category, coverage, evidence, suggestedMove }: {
  category: string; coverage: string; evidence: string; suggestedMove: string;
}) {
  const [open, setOpen] = useState(false);
  const isStrong = coverage === 'strong';
  const isMissing = coverage === 'missing';
  const badge = isStrong ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : isMissing ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  const icon = isStrong ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : isMissing ? <XCircle className="h-4 w-4 text-red-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/5 transition-colors" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-semibold text-white">{category}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge}`}>{coverage}</span>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs text-slate-400 leading-relaxed">{evidence}</p>
          {suggestedMove && (
            <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <ArrowUpRight className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300 leading-relaxed">{suggestedMove}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveSimulator({ totalMonthlySearches, mrr }: { totalMonthlySearches: number; mrr?: number }) {
  const defaultJobValue = mrr || 5000;
  const [demand, setDemand] = useState(Math.max(100, Math.min(totalMonthlySearches, 10000)));
  const [visShare, setVisShare] = useState(3);
  const [enquiryRate, setEnquiryRate] = useState(20);
  const [convRate, setConvRate] = useState(25);
  const [jobValue, setJobValue] = useState(defaultJobValue);
  const visitors = Math.round(demand * visShare / 100);
  const enquiries = Math.round(visitors * enquiryRate / 100);
  const customers = Math.round(enquiries * convRate / 100);
  const revenue = customers * jobValue;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-5">
          <p className="text-sm font-bold text-white uppercase tracking-wider">Adjust these assumptions</p>
          {[
            { label: 'Monthly Market Demand (searches)', value: demand, min: 100, max: 50000, step: 100, set: setDemand, format: (v: number) => v.toLocaleString() },
            { label: 'Visibility Share (%)', value: visShare, min: 0.5, max: 30, step: 0.5, set: setVisShare, format: (v: number) => v + '%' },
            { label: 'Enquiry Rate (% of visitors)', value: enquiryRate, min: 1, max: 50, step: 1, set: setEnquiryRate, format: (v: number) => v + '%' },
            { label: 'Conversion Rate (% of enquiries)', value: convRate, min: 1, max: 80, step: 1, set: setConvRate, format: (v: number) => v + '%' },
            { label: 'Average Job / Project Value ($)', value: jobValue, min: 500, max: 100000, step: 500, set: setJobValue, format: (v: number) => '$' + v.toLocaleString() },
          ].map(({ label, value, min, max, step, set, format }) => (
            <div key={label} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-sm font-bold text-white">{format(value)}</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => set(Number(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <p className="text-sm font-bold text-white uppercase tracking-wider">Estimated monthly outcomes</p>
          {[
            { label: 'Estimated Monthly Visitors', value: visitors.toLocaleString(), icon: Eye, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'Estimated Monthly Enquiries', value: enquiries.toLocaleString(), icon: Phone, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
            { label: 'Estimated New Customers', value: customers.toLocaleString(), icon: Users, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
            { label: 'Estimated Monthly Revenue', value: '$' + revenue.toLocaleString(), icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`flex items-center gap-4 border rounded-xl p-4 ${bg}`}>
              <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-xl font-black mt-0.5 ${color}`}>{value}</p>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-slate-500 leading-relaxed pt-2 border-t border-white/10">
            These are directional estimates for scenario exploration. Actual results depend on competition, implementation quality, and market conditions.
          </p>
        </div>
      </div>
    </div>
  );
}

function InsightSnapshotCard({ headline, metric, explanation, index }: {
  headline: string; metric: string; explanation: string; index: number;
}) {
  const [copied, setCopied] = useState(false);
  const colors = [
    'from-blue-600 to-blue-800',
    'from-violet-600 to-violet-800',
    'from-emerald-600 to-emerald-800',
    'from-amber-600 to-amber-800',
  ];
  const handleCopy = () => {
    navigator.clipboard.writeText(`${headline}\n\n${metric}\n\n${explanation}`).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={`relative rounded-2xl bg-gradient-to-br ${colors[index % colors.length]} p-6 text-white overflow-hidden`}>
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
      <div className="relative space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest opacity-70">Insight {index + 1}</p>
        <h3 className="text-base font-bold leading-snug">{headline}</h3>
        <div className="text-2xl font-black">{metric}</div>
        <p className="text-sm opacity-80 leading-relaxed">{explanation}</p>
        <button onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 transition-colors px-3 py-1.5 rounded-full mt-2">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy insight'}
        </button>
      </div>
    </div>
  );
}

export default function StrategyReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const [acceptedServices, setAcceptedServices] = useState<string[]>([]);
  const [acceptContactName, setAcceptContactName] = useState('');
  const [acceptContactEmail, setAcceptContactEmail] = useState('');
  const [acceptNotes, setAcceptNotes] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptanceResult, setAcceptanceResult] = useState<{ workItemIds: string[] } | null>(null);

  const toggleService = (key: string) => setAcceptedServices(prev =>
    prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
  );

  const handleAccept = async () => {
    if (!acceptedServices.length || !reportId) return;
    setIsAccepting(true);
    try {
      const res = await fetch(`/api/strategy-reports/${reportId}/accept`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedServices, contactName: acceptContactName, contactEmail: acceptContactEmail, notes: acceptNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      setAcceptanceResult(data);
      setReport(prev => prev ? { ...prev, acceptedScope: data.acceptedScope } : prev);
    } catch {
      alert('Something went wrong. Please try again or contact us directly.');
    } finally {
      setIsAccepting(false);
    }
  };

  useEffect(() => {
    if (!reportId) return;
    const load = async () => {
      try {
        const r1 = await fetch(`/api/strategy-reports/${reportId}`);
        if (r1.ok) { const data = await r1.json(); if (!data.error) { setReport(data); setLoading(false); return; } }
        const r2 = await fetch(`/api/strategy-reports/by-slug/${encodeURIComponent(reportId)}`);
        const data2 = await r2.json();
        if (!r2.ok || data2.error) setError(data2.error || 'Report not found');
        else setReport(data2);
      } catch { setError('Failed to load report'); }
      finally { setLoading(false); }
    };
    load();
  }, [reportId]);

  if (loading) return (
    <div className="min-h-screen bg-[#0d1123] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">Loading your Digital Visibility Strategy…</p>
      </div>
    </div>
  );

  if (error || !report) return (
    <div className="min-h-screen bg-[#0d1123] flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm px-6">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
        <h1 className="text-xl font-semibold text-white">Strategy not found</h1>
        <p className="text-slate-400 text-sm">{error || 'This link is invalid or no longer available.'}</p>
      </div>
    </div>
  );

  const s = report.strategy || {};
  const diagnosis = report.strategyDiagnosis;
  const es = s.executiveSummary || {};
  const mo = s.marketOpportunity || {};
  const da = s.digitalAudit || {};
  const pillars: any[] = s.growthPillars || [];
  const outcomes: any[] = s.projectedOutcomes || [];
  const kpis: any[] = s.kpis || [];
  const dvt = s.digitalVisibilityTriangle || null;
  const discoveryPath: any[] = s.discoveryPath || [];
  const brg = s.buyerRealityGap || null;
  const intentGaps: any[] = s.intentGaps || [];
  const mm = s.momentumMoment || null;
  const growthPhases: any[] = s.growthPhases || [];
  const coi = s.costOfInaction || null;
  const snapshots: any[] = s.insightSnapshots || [];
  const sev = s.searchEngineView || null;
  const mcm = s.marketCaptureMap || null;
  const confidence = s.strategyConfidence || null;
  const oneSentence = s.oneSentenceStrategy || null;
  const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });

  const confidenceColor = confidence?.level === 'High' ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : confidence?.level === 'Low' ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-amber-500/20 text-amber-400 border-amber-500/30';

  const PHASE_ICONS = [Layers, Eye, Flame];
  const PHASE_COLORS = [
    { bg: 'bg-blue-600', border: 'border-blue-500/30', glow: 'shadow-blue-900/30', badge: 'bg-blue-500/20 text-blue-300' },
    { bg: 'bg-violet-600', border: 'border-violet-500/30', glow: 'shadow-violet-900/30', badge: 'bg-violet-500/20 text-violet-300' },
    { bg: 'bg-emerald-600', border: 'border-emerald-500/30', glow: 'shadow-emerald-900/30', badge: 'bg-emerald-500/20 text-emerald-300' },
  ];

  const PILLAR_ICONS = [Target, Zap, MapPin, BarChart3];
  const PILLAR_COLORS = [
    { bg: 'bg-blue-600', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    { bg: 'bg-violet-600', light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    { bg: 'bg-emerald-600', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { bg: 'bg-amber-600', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  ];

  return (
    <div className="min-h-screen bg-[#0d1123] font-sans text-white">

      {/* ── STICKY NAV */}
      <div className="sticky top-0 z-50 backdrop-blur bg-[#0d1123]/90 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-bold text-white truncate max-w-[200px]">{report.businessName}</span>
            {confidence && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border hidden sm:block ${confidenceColor}`}>{confidence.level} confidence</span>}
          </div>
          <a href={`tel:${report.phone || ''}`}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors"
            data-testid="link-book-call">
            <Phone className="h-3.5 w-3.5" /> Book a Call
          </a>
        </div>
      </div>

      {/* ── HERO */}
      <section className="relative overflow-hidden" ref={heroRef}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1123] via-[#131a3a] to-[#0d1123]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #2563eb 0%, transparent 60%), radial-gradient(circle at 80% 20%, #7c3aed 0%, transparent 50%)' }} />
        <div className="relative max-w-5xl mx-auto px-6 py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-start">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Digital Visibility Strategy</span>
                </div>
                {confidence && (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${confidenceColor}`}>
                    {confidence.level} opportunity confidence
                  </span>
                )}
              </div>
              <h1 className="text-4xl md:text-5xl font-black leading-tight">{report.businessName}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-slate-400">
                {report.industry && <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-slate-500" />{report.industry}</span>}
                {report.location && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-500" />{report.location}</span>}
                {report.websiteUrl && (
                  <a href={report.websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors">
                    <Globe className="h-3.5 w-3.5" />{report.websiteUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>

              {/* One sentence strategy */}
              {oneSentence && (
                <div className="bg-white/8 border border-white/15 rounded-2xl p-5">
                  <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-2">Strategy Direction</p>
                  <p className="text-base md:text-lg leading-relaxed text-white font-medium">{oneSentence}</p>
                </div>
              )}

              {/* Confidence explanation */}
              {confidence?.explanation && (
                <p className="text-sm text-slate-400 leading-relaxed">{confidence.explanation}</p>
              )}

              {/* Hero stats */}
              {diagnosis?.growthPotential?.forecastBand && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Add. Monthly Impressions', value: diagnosis.growthPotential.forecastBand.additionalImpressions },
                    { label: 'Add. Monthly Visitors', value: diagnosis.growthPotential.forecastBand.additionalVisitors },
                    { label: 'Add. Monthly Enquiries', value: diagnosis.growthPotential.forecastBand.additionalEnquiries },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                      <div className="text-xl font-black text-blue-400">{stat.value}</div>
                      <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Score ring */}
            {diagnosis && (
              <div className="flex flex-col items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-6 shrink-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Growth Readiness</p>
                <ScoreRing score={diagnosis.readinessScore} size={130} />
                {diagnosis.insightSentence && (
                  <p className="text-xs text-slate-400 text-center leading-relaxed max-w-[180px] italic">"{diagnosis.insightSentence}"</p>
                )}
                <div className="w-full space-y-2 mt-2">
                  {diagnosis.subscores && Object.entries({
                    'Service Clarity': diagnosis.subscores.serviceClarityScore,
                    'Location Signals': diagnosis.subscores.locationRelevanceScore,
                    'Content Coverage': diagnosis.subscores.contentCoverageScore,
                    'GBP Alignment': diagnosis.subscores.gbpAlignmentScore,
                    'Authority': diagnosis.subscores.authorityScore,
                  }).map(([label, score]) => (
                    <ScoreBar key={label} label={label} score={score as number} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-10 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
            <span>Prepared {dateStr}{report.preparedBy ? ` by ${report.preparedBy}` : ''}</span>
            <span className="text-xs">Confidential · For {report.businessName} only</span>
          </div>
        </div>
      </section>

      {/* ── DIGITAL VISIBILITY TRIANGLE */}
      {dvt && (dvt.relevance || dvt.authority || dvt.trust) && (
        <section className="bg-[#080c1a] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Digital Visibility Triangle</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">The three forces driving your visibility</h2>
            <p className="text-slate-400 text-sm mb-10 max-w-2xl">How easily a business is discovered and trusted online is determined by three signals. Here is how {report.businessName} currently performs across each.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {dvt.relevance && <TriangleScoreCard label="Relevance" icon={Brain} score={dvt.relevance.score || 0} evidence={dvt.relevance.evidence || ''} interpretation={dvt.relevance.interpretation || ''} color="bg-blue-600/80" />}
              {dvt.authority && <TriangleScoreCard label="Authority" icon={Shield} score={dvt.authority.score || 0} evidence={dvt.authority.evidence || ''} interpretation={dvt.authority.interpretation || ''} color="bg-violet-600/80" />}
              {dvt.trust && <TriangleScoreCard label="Trust" icon={Star} score={dvt.trust.score || 0} evidence={dvt.trust.evidence || ''} interpretation={dvt.trust.interpretation || ''} color="bg-emerald-600/80" />}
            </div>
          </div>
        </section>
      )}

      {/* ── SEARCH ENGINE VIEW */}
      {sev && sev.totalPages > 0 && (
        <section className="bg-[#0d1123]">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Search Engine View</span>
            <h2 className="text-2xl md:text-3xl font-black mt-2 mb-3">How search engines interpret this website</h2>
            <p className="text-slate-400 text-sm mb-8">Out of {sev.totalPages} pages indexed, here is how the site distributes its search signals.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Service Pages', count: sev.servicePages, total: sev.totalPages, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: Globe },
                { label: 'Location Pages', count: sev.locationPages, total: sev.totalPages, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', icon: MapPin },
                { label: 'Portfolio Pages', count: sev.portfolioPages, total: sev.totalPages, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: BarChart3 },
                { label: 'Other Pages', count: sev.otherPages, total: sev.totalPages, color: 'text-slate-400', bg: 'bg-white/5 border-white/10', icon: Layers },
              ].map(({ label, count, total, color, bg, icon: Icon }) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={label} className={`border rounded-xl p-4 space-y-3 ${bg}`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <p className="text-xs text-slate-400 font-medium">{label}</p>
                    </div>
                    <div className={`text-3xl font-black ${color}`}>{count}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>{pct}% of site</span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-current transition-all duration-700" style={{ width: `${pct}%`, color: color.replace('text-', '') }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {sev.servicePages < 3 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-200">
                  <strong>Signal gap:</strong> With only {sev.servicePages} service {sev.servicePages === 1 ? 'page' : 'pages'}, search engines receive limited service-intent signals. Buyers searching for specific services may not find relevant pages.
                </p>
              </div>
            )}
            {sev.locationPages < 2 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 mt-3">
                <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-200">
                  <strong>Location gap:</strong> {sev.locationPages === 0 ? 'No location-specific pages detected.' : `Only ${sev.locationPages} location page detected.`} Local buyers searching in specific suburbs will find limited geographic relevance signals.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── MARKET OPPORTUNITY */}
      {(mo.keywords?.length > 0 || mo.totalMonthlySearches) && (
        <section className="bg-white text-gray-900">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Market Opportunity</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">The demand sitting in this market</h2>
            {mo.keyInsight && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4 mb-8">
                <Star className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">{mo.keyInsight}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 mb-10">
              {[
                { label: 'Est. Monthly Searches', value: mo.totalMonthlySearches != null ? Number(mo.totalMonthlySearches).toLocaleString() : '—' },
                { label: 'Current Capture', value: mo.currentCapture || '—' },
                { label: 'Potential Capture', value: mo.potentialCapture || '—' },
              ].map((stat, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center">
                  <div className="text-2xl md:text-3xl font-black text-blue-600">{stat.value}</div>
                  <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
            {mo.keywords?.length > 0 && (
              <>
                <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] bg-[#0d1123] text-white text-xs font-bold uppercase tracking-wider">
                    <div className="px-4 py-3">Keyword</div>
                    <div className="px-4 py-3 text-center">Monthly Searches</div>
                    <div className="px-4 py-3 text-center">Current Rank</div>
                    <div className="px-4 py-3 text-center">KD</div>
                    <div className="px-4 py-3 text-center">Opportunity</div>
                  </div>
                  {mo.keywords.map((kw: any, i: number) => {
                    const oppColor = kw.opportunity === 'high' ? 'bg-green-100 text-green-700' : kw.opportunity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
                    const kd = kw.difficulty != null ? Number(kw.difficulty) : null;
                    const kdColor = kd != null ? (kd < 30 ? 'text-green-600' : kd < 60 ? 'text-amber-600' : 'text-red-500') : 'text-gray-400';
                    return (
                      <div key={i} className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] text-sm border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <div className="px-4 py-3 font-medium text-gray-900">{kw.keyword}</div>
                        <div className="px-4 py-3 text-center font-semibold text-blue-600">{Number(kw.monthlySearches).toLocaleString()}</div>
                        <div className="px-4 py-3 text-center text-gray-500">{kw.currentRank}</div>
                        <div className={`px-4 py-3 text-center font-semibold ${kdColor}`}>{kd != null ? kd : '—'}</div>
                        <div className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${oppColor}`}>{kw.opportunity}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {mo.keywords.length > 10 && <p className="text-xs text-gray-400 text-right mt-2">{mo.keywords.length} keywords shown</p>}
              </>
            )}
          </div>
        </section>
      )}

      {/* ── MARKET CAPTURE MAP */}
      {mcm && mcm.clusters?.length > 0 && (
        <section className="bg-gray-50 text-gray-900">
          <div className="max-w-5xl mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Market Capture Map</span>
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 mt-2 mb-8">Where demand is clustered</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mcm.clusters.map((cluster: any, i: number) => {
                const pct = mcm.totalMonthlyDemand > 0 ? Math.round((cluster.volume / mcm.totalMonthlyDemand) * 100) : 0;
                return (
                  <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-sm font-bold text-gray-900">{cluster.name}</p>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{pct}%</span>
                    </div>
                    <div className="text-2xl font-black text-blue-600 mb-1">{cluster.volume.toLocaleString()}</div>
                    <p className="text-xs text-gray-500 mb-3">monthly searches · {cluster.keywordCount} keywords</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    {cluster.topKeywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {cluster.topKeywords.map((kw: string, j: number) => (
                          <span key={j} className="text-[10px] bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── DISCOVERY PATH SIMULATOR */}
      {discoveryPath.length > 0 && (
        <section className="bg-[#0d1123]">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Discovery Path</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">Where the buyer journey breaks down</h2>
            <p className="text-slate-400 text-sm mb-10 max-w-2xl">A buyer moves through five stages to find and choose a business. Here is where {report.businessName}'s current digital presence creates friction.</p>
            <div className="max-w-2xl">
              {discoveryPath.map((stage: any, i: number) => (
                <DiscoveryPathStage key={i} stage={stage.stage} strength={stage.strength} issue={stage.issue} impact={stage.impact} index={i} total={discoveryPath.length} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── BUYER REALITY GAP */}
      {brg && (brg.buyerExpects?.length > 0 || brg.currentReality?.length > 0) && (
        <section className="bg-[#080c1a] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Buyer Reality Gap</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">What buyers expect vs what they find</h2>
            {brg.topGap && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-8 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-300 mb-1">Critical gap</p>
                  <p className="text-sm text-red-200">{brg.topGap}</p>
                  {brg.implication && <p className="text-xs text-red-300/70 mt-2 leading-relaxed">{brg.implication}</p>}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center"><Users className="h-4 w-4 text-blue-400" /></div>
                  <p className="text-sm font-bold text-blue-400">What buyers expect</p>
                </div>
                <div className="space-y-3">
                  {brg.buyerExpects?.map((item: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-slate-300 leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center"><Globe className="h-4 w-4 text-amber-400" /></div>
                  <p className="text-sm font-bold text-amber-400">What the current presence signals</p>
                </div>
                <div className="space-y-3">
                  {brg.currentReality?.map((item: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <Minus className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-slate-300 leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── INTENT GAP ENGINE */}
      {intentGaps.length > 0 && (
        <section className="bg-[#0d1123]">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Intent Coverage</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">What buyers are searching for — and what the site answers</h2>
            <p className="text-slate-400 text-sm mb-8 max-w-2xl">Buyers search with different intent. This analysis shows how well the current digital presence answers each type of search intent.</p>
            <div className="space-y-3">
              {intentGaps.map((gap: any, i: number) => (
                <IntentCoverageRow key={i} category={gap.category} coverage={gap.coverage} evidence={gap.evidence} suggestedMove={gap.suggestedMove} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── DIGITAL AUDIT (existing) */}
      {(da.website || da.gbp || da.authority) && (
        <section className="bg-[#080c1a] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Digital Presence Audit</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-10">Where the presence stands today</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { key: 'website', label: 'Website', data: da.website, icon: Globe },
                { key: 'gbp', label: 'Google Business Profile', data: da.gbp, icon: MapPin },
                { key: 'authority', label: 'Authority & Trust', data: da.authority, icon: Star },
              ].map(({ label, data, icon: Icon }) => {
                if (!data) return null;
                const score = data.score || 0;
                const scoreColor = score >= 70 ? 'text-green-400 border-green-400/30' : score >= 45 ? 'text-amber-400 border-amber-400/30' : 'text-red-400 border-red-400/30';
                const scoreBg = score >= 70 ? 'bg-green-400/10' : score >= 45 ? 'bg-amber-400/10' : 'bg-red-400/10';
                return (
                  <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center"><Icon className="h-4 w-4 text-blue-400" /></div>
                        <span className="text-sm font-bold text-white">{label}</span>
                      </div>
                      <div className={`flex items-center justify-center w-12 h-12 rounded-xl border text-lg font-black ${scoreColor} ${scoreBg}`}>{score}</div>
                    </div>
                    {data.reviews != null && <p className="text-xs text-slate-400">{data.reviews} reviews · {data.rating}★</p>}
                    {data.strengths?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-green-400 mb-1.5 uppercase tracking-wider">Strengths</p>
                        {data.strengths.slice(0, 3).map((str: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-300 mb-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" /><span>{str}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {data.gaps?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-red-400 mb-1.5 uppercase tracking-wider">Gaps</p>
                        {data.gaps.slice(0, 3).map((g: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-400 mb-1">
                            <ChevronRight className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" /><span>{g}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── MOMENTUM MOMENT */}
      {mm && (mm.summary || mm.clientQuestion) && (
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0a0f1e] via-[#0d1a3a] to-[#0a0f1e]">
          <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(circle at 40% 50%, #3b82f6 0%, transparent 60%), radial-gradient(circle at 70% 30%, #8b5cf6 0%, transparent 50%)' }} />
          <div className="relative max-w-4xl mx-auto px-6 py-20 md:py-28 text-center">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 rounded-full px-4 py-1.5 mb-8">
              <Flame className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Momentum Moment</span>
            </div>
            {mm.summary && <p className="text-lg md:text-xl text-slate-300 leading-relaxed mb-10 max-w-3xl mx-auto">{mm.summary}</p>}
            {mm.clientQuestion && (
              <div className="bg-white/8 border border-white/15 rounded-2xl p-8 max-w-2xl mx-auto">
                <p className="text-xl md:text-2xl font-black text-white leading-relaxed italic">"{mm.clientQuestion}"</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── GROWTH PHASES */}
      {growthPhases.length > 0 && (
        <section className="bg-[#0d1123]">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Growth Roadmap</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">Three phases to market capture</h2>
            <p className="text-slate-400 text-sm mb-10 max-w-2xl">A structured 12-month strategy built around closing the visibility gap, expanding into uncaptured demand, and securing market position.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {growthPhases.map((phase: any, i: number) => {
                const palette = PHASE_COLORS[i % PHASE_COLORS.length];
                const PhaseIcon = PHASE_ICONS[i % PHASE_ICONS.length];
                return (
                  <div key={i} className={`bg-white/5 border rounded-2xl p-6 space-y-4 ${palette.border}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${palette.bg} flex items-center justify-center shrink-0 shadow-lg ${palette.glow}`}>
                        <PhaseIcon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${palette.badge}`}>{phase.months || `Phase ${i + 1}`}</span>
                        <h3 className="text-base font-bold text-white mt-1">{phase.phase?.replace(/Phase \d — /, '') || phase.phase}</h3>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {phase.objective && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Objective</p>
                          <p className="text-xs text-slate-300 leading-relaxed">{phase.objective}</p>
                        </div>
                      )}
                      {phase.whyMatters && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Why it matters</p>
                          <p className="text-xs text-slate-400 leading-relaxed">{phase.whyMatters}</p>
                        </div>
                      )}
                      {phase.whatShifts && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">What shifts</p>
                          <p className="text-xs text-slate-400 leading-relaxed">{phase.whatShifts}</p>
                        </div>
                      )}
                      {phase.expectedImpact && (
                        <div className={`rounded-lg p-3 ${palette.badge.replace('text-', 'bg-').replace('-300', '-500/10')} border ${palette.border}`}>
                          <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ opacity: 0.7 }}>Expected impact</p>
                          <p className="text-xs font-medium leading-relaxed text-white">{phase.expectedImpact}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── GROWTH PILLARS */}
      {pillars.length > 0 && (
        <section className="bg-gray-50 text-gray-900">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Strategic Priorities</span>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mt-2 mb-3">The four growth pillars</h2>
            <p className="text-gray-500 mb-10">Every action sits under one of these pillars. Together they close the visibility gap.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pillars.slice(0, 4).map((pillar: any, i: number) => {
                const palette = PILLAR_COLORS[i % PILLAR_COLORS.length];
                const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
                return (
                  <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-12 h-12 ${palette.bg} rounded-xl flex items-center justify-center shrink-0`}><Icon className="h-6 w-6 text-white" /></div>
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Pillar {pillar.number || i + 1}</div>
                        <h3 className="text-lg font-bold text-gray-900">{pillar.title}</h3>
                      </div>
                    </div>
                    {pillar.goal && <p className="text-sm text-gray-600 mb-4 leading-relaxed">{pillar.goal}</p>}
                    {pillar.timeframe && <div className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${palette.light} ${palette.text} mb-4`}>{pillar.timeframe}</div>}
                    {pillar.actions?.length > 0 && (
                      <div className="space-y-2">
                        {pillar.actions.slice(0, 3).map((act: any, j: number) => (
                          <div key={j} className={`flex items-start gap-2 p-3 rounded-xl ${palette.light} border ${palette.border}`}>
                            <ChevronRight className={`h-4 w-4 mt-0.5 shrink-0 ${palette.text}`} />
                            <div>
                              <p className="text-xs font-semibold text-gray-900">{act.action}</p>
                              {act.examples?.length > 0 && <p className="text-[10px] text-gray-500 mt-0.5">e.g. {act.examples.slice(0, 2).join(', ')}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── LIVE STRATEGY SIMULATOR */}
      <section className="bg-[#0d1123]">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Live Strategy Simulator</span>
          <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">What improved visibility could mean</h2>
          <p className="text-slate-400 text-sm mb-10 max-w-2xl">Adjust the assumptions to explore what different visibility scenarios could mean for this business. These are directional estimates for planning purposes.</p>
          <LiveSimulator totalMonthlySearches={mo.totalMonthlySearches || 1000} />
        </div>
      </section>

      {/* ── COST OF INACTION */}
      {coi && (
        <section className="bg-[#080c1a] border-y border-white/5">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Cost of Inaction</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">What happens if nothing changes</h2>
            <p className="text-slate-400 text-sm mb-10 max-w-2xl">This is not about fear — it's about understanding the ongoing cost of the current visibility gap, in business terms.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              {coi.missedMonthlySearches > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
                  <div className="text-3xl font-black text-red-400 mb-1">{Number(coi.missedMonthlySearches).toLocaleString()}</div>
                  <p className="text-xs text-red-300/70 uppercase tracking-wider font-semibold">Monthly searches not captured</p>
                </div>
              )}
              {coi.businessImpact && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center md:col-span-2">
                  <p className="text-xs text-amber-400 uppercase tracking-wider font-bold mb-2">Annual opportunity cost</p>
                  <p className="text-base text-white font-semibold leading-relaxed">{coi.businessImpact}</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {coi.missedEnquiriesNote && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                  <Clock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-300 leading-relaxed">{coi.missedEnquiriesNote}</p>
                </div>
              )}
              {coi.competitorNote && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                  <TrendingUp className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-300 leading-relaxed">{coi.competitorNote}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── PROJECTED OUTCOMES */}
      {outcomes.length > 0 && (
        <section className="bg-white text-gray-900">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Projections</span>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mt-2 mb-3">What to expect over 12 months</h2>
            <p className="text-gray-500 mb-10 max-w-2xl">Directional estimates based on market opportunity and current baseline. Actual results vary based on competition and execution pace.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {outcomes.map((outcome: any, i: number) => {
                const confColor = outcome.confidence === 'high' ? 'text-green-600 bg-green-50 border-green-200' : outcome.confidence === 'medium' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-gray-500 bg-gray-50 border-gray-200';
                return (
                  <div key={i} className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{outcome.month}</p>
                    <div className="text-3xl font-black text-blue-600 mb-1">{outcome.estimatedLeads}</div>
                    <p className="text-xs text-gray-500 mb-3">leads/month</p>
                    {outcome.rankingKeywords && <p className="text-xs text-gray-400 mb-2">~{outcome.rankingKeywords} ranking keywords</p>}
                    <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${confColor}`}>{outcome.confidence} confidence</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── KPI TABLE */}
      {kpis.length > 0 && (
        <section className="bg-gray-50 text-gray-900">
          <div className="max-w-5xl mx-auto px-6 py-12">
            <h2 className="text-xl font-black text-gray-900 mb-6">Key Performance Indicators</h2>
            <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              <div className="grid grid-cols-3 bg-[#0d1123] text-white text-xs font-bold uppercase tracking-wider">
                <div className="px-5 py-3">Metric</div>
                <div className="px-5 py-3 text-center">Baseline</div>
                <div className="px-5 py-3 text-center">12-Month Target</div>
              </div>
              {kpis.map((kpi: any, i: number) => (
                <div key={i} className={`grid grid-cols-3 text-sm border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <div className="px-5 py-3.5 font-medium text-gray-900">{kpi.metric}</div>
                  <div className="px-5 py-3.5 text-center text-gray-500">{kpi.baseline}</div>
                  <div className="px-5 py-3.5 text-center font-bold text-green-600">{kpi.target12Month}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── INSIGHT SNAPSHOTS */}
      {snapshots.length > 0 && (
        <section className="bg-[#0d1123]">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Key Insights</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-10">The most important things to know</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {snapshots.map((snap: any, i: number) => (
                <InsightSnapshotCard key={i} headline={snap.headline} metric={snap.metric} explanation={snap.explanation} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── ACCEPTANCE / SCOPE SELECTION */}
      <section className="bg-[#080c1a] border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-20">
          {(report.acceptedScope || acceptanceResult) ? (
            /* ── Already accepted ── */
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-white mb-2">Strategy Accepted</h2>
                <p className="text-slate-400 max-w-xl mx-auto">
                  {report.preparedBy || 'Your account manager'} has been notified and will be in touch shortly to begin delivery.
                </p>
              </div>
              {(report.acceptedScope?.acceptedServices || []).length > 0 && (
                <div className="inline-flex flex-wrap gap-2 justify-center">
                  {(report.acceptedScope?.acceptedServices || []).map((svc: string, i: number) => (
                    <span key={i} className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 text-green-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> {svc}
                    </span>
                  ))}
                </div>
              )}
              {report.acceptedScope?.acceptedAt && (
                <p className="text-xs text-slate-500">
                  Accepted {new Date(report.acceptedScope.acceptedAt).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  {report.acceptedScope.contactName && ` by ${report.acceptedScope.contactName}`}
                </p>
              )}
            </div>
          ) : (
            /* ── Acceptance form ── */
            <div className="space-y-8">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-5">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Ready to move forward?</span>
                </div>
                <h2 className="text-2xl md:text-4xl font-black text-white mb-3">Choose your starting point</h2>
                <p className="text-slate-400 max-w-xl mx-auto text-sm">Select the services you want to proceed with. Your account manager will be notified immediately and will activate the right specialists for each one.</p>
              </div>

              {/* Service selection */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Select services to accept</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {(() => {
                    // Use growthPillars from strategy if available, otherwise fall back to standard services
                    const pillarServices = pillars.map((p: any) => ({ key: p.pillar || p.title, label: p.pillar || p.title, icon: '🎯', description: p.focus || p.description || '' }));
                    const pillarKeys = new Set(pillarServices.map((s: any) => s.key?.toLowerCase()));
                    const fallbacks = STANDARD_SERVICES.filter(s => !pillarKeys.has(s.key.toLowerCase()));
                    const services = pillarServices.length > 0 ? [...pillarServices, ...fallbacks.slice(0, Math.max(0, 7 - pillarServices.length))] : STANDARD_SERVICES;
                    return services.map((svc: any) => {
                      const isSelected = acceptedServices.includes(svc.key);
                      return (
                        <button
                          key={svc.key}
                          onClick={() => toggleService(svc.key)}
                          data-testid={`button-accept-service-${svc.key.toLowerCase().replace(/\s+/g, '-')}`}
                          className={`relative text-left p-4 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-blue-600/20 border-blue-500/60 shadow-lg shadow-blue-900/20'
                              : 'bg-white/3 border-white/10 hover:border-white/25 hover:bg-white/5'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                          <div className="text-xl mb-2">{svc.icon}</div>
                          <p className={`text-sm font-bold leading-tight mb-0.5 ${isSelected ? 'text-blue-200' : 'text-white'}`}>{svc.label}</p>
                          <p className="text-[10px] text-slate-500 leading-tight">{svc.description}</p>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Contact details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto w-full">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Your name</label>
                  <input
                    type="text"
                    value={acceptContactName}
                    onChange={e => setAcceptContactName(e.target.value)}
                    placeholder="First name"
                    className="w-full bg-white/5 border border-white/15 text-white placeholder-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
                    data-testid="input-accept-name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={acceptContactEmail}
                    onChange={e => setAcceptContactEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-white/5 border border-white/15 text-white placeholder-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
                    data-testid="input-accept-email"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Notes or questions (optional)</label>
                  <textarea
                    value={acceptNotes}
                    onChange={e => setAcceptNotes(e.target.value)}
                    placeholder="Anything specific you'd like us to know before we start…"
                    rows={3}
                    className="w-full bg-white/5 border border-white/15 text-white placeholder-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 transition-colors resize-none"
                    data-testid="textarea-accept-notes"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleAccept}
                  disabled={isAccepting || acceptedServices.length === 0}
                  className={`flex items-center gap-2.5 font-bold px-10 py-4 rounded-full text-base transition-all shadow-xl ${
                    acceptedServices.length > 0 && !isAccepting
                      ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                      : 'bg-white/10 text-white/40 cursor-not-allowed'
                  }`}
                  data-testid="button-accept-strategy"
                >
                  {isAccepting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Package className="h-4.5 w-4.5" />}
                  {isAccepting ? 'Submitting…' : `Accept ${acceptedServices.length > 0 ? acceptedServices.length + ' service' + (acceptedServices.length > 1 ? 's' : '') : 'services'}`}
                </button>
                {acceptedServices.length === 0 && (
                  <p className="text-xs text-slate-600">Select at least one service above to proceed</p>
                )}
                <p className="text-xs text-slate-600 max-w-sm text-center">No commitment required right now — this lets your account manager know what to prepare for the next conversation.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── CTA */}
      <section className="bg-gradient-to-br from-blue-700 via-blue-600 to-violet-700">
        <div className="max-w-4xl mx-auto px-6 py-20 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm text-white/90 mb-6">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Ready to start?</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-4">
            Ready to close the gap{report.location ? ` in ${report.location}` : ''}?
          </h2>
          <p className="text-lg text-blue-100 mb-10 max-w-xl mx-auto leading-relaxed">
            This strategy is built specifically for {report.businessName}. Let's talk through what it means and how we make it happen.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href={`tel:${report.phone || ''}`}
              className="flex items-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-full text-base hover:bg-blue-50 transition-colors shadow-xl"
              data-testid="link-cta-call">
              <Phone className="h-5 w-5" /> Call Now
            </a>
            {report.preparedByEmail && (
              <a href={`mailto:${report.preparedByEmail}?subject=Digital Visibility Strategy — ${report.businessName}`}
                className="flex items-center gap-2 bg-white/20 border border-white/30 text-white font-semibold px-8 py-4 rounded-full text-base hover:bg-white/30 transition-colors"
                data-testid="link-cta-email">
                <Mail className="h-5 w-5" /> Send an Email
              </a>
            )}
          </div>
          {report.preparedBy && (
            <p className="text-blue-200 text-sm mt-8">
              Prepared by <strong className="text-white">{report.preparedBy}</strong>
              {report.preparedByEmail && ` · ${report.preparedByEmail}`}
            </p>
          )}
        </div>
      </section>

      {/* ── FOOTER */}
      <footer className="bg-[#080c1a] border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <span>© {new Date().getFullYear()} {report.preparedBy || 'Momentum Agent'}. All rights reserved.</span>
          <span>Prepared {dateStr} · Confidential</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Powered by <strong className="text-slate-400 ml-0.5">Momentum</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}

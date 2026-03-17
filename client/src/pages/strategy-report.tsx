import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { CheckCircle2, TrendingUp, AlertCircle, ChevronRight, Target, Zap, MapPin, BarChart3, Globe, Star, ArrowUpRight, Phone, Mail, Calendar } from 'lucide-react';

interface StrategyReport {
  id: string;
  businessName: string;
  industry?: string;
  location?: string;
  websiteUrl?: string;
  preparedBy?: string;
  preparedByEmail?: string;
  phone?: string;
  strategyDiagnosis?: any;
  strategy?: {
    executiveSummary?: any;
    marketOpportunity?: any;
    digitalAudit?: any;
    growthPillars?: any[];
    monthlyRoadmap?: any[];
    projectedOutcomes?: any[];
    kpis?: any[];
    repTalkingPoints?: string[];
  };
  createdAt?: any;
}

const PILLAR_ICONS = [Target, Zap, MapPin, BarChart3];
const PILLAR_COLORS = [
  { bg: 'bg-blue-600', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-violet-600', light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  { bg: 'bg-emerald-600', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-amber-600', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
];

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? '#16a34a' : score >= 45 ? '#d97706' : '#dc2626';
  const label = score >= 70 ? 'Strong' : score >= 45 ? 'Growing' : 'Early Stage';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
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

export default function StrategyReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) return;
    const load = async () => {
      try {
        // Try direct Firestore ID lookup first
        const r1 = await fetch(`/api/strategy-reports/${reportId}`);
        if (r1.ok) {
          const data = await r1.json();
          if (!data.error) { setReport(data); setLoading(false); return; }
        }
        // Fall back to slug lookup
        const r2 = await fetch(`/api/strategy-reports/by-slug/${encodeURIComponent(reportId)}`);
        const data2 = await r2.json();
        if (!r2.ok || data2.error) {
          setError(data2.error || 'Report not found');
        } else {
          setReport(data2);
        }
      } catch {
        setError('Failed to load report');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [reportId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1123] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading your strategy report…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-[#0d1123] flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-6">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <h1 className="text-xl font-semibold text-white">Report not found</h1>
          <p className="text-slate-400 text-sm">{error || 'This link is invalid or no longer available.'}</p>
        </div>
      </div>
    );
  }

  const s = report.strategy || {};
  const diagnosis = report.strategyDiagnosis;
  const es = s.executiveSummary || {};
  const mo = s.marketOpportunity || {};
  const da = s.digitalAudit || {};
  const pillars: any[] = s.growthPillars || [];
  const roadmap: any[] = s.monthlyRoadmap || [];
  const outcomes: any[] = s.projectedOutcomes || [];
  const kpis: any[] = s.kpis || [];
  const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#0d1123] font-sans text-white">

      {/* ── STICKY NAV ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 backdrop-blur bg-[#0d1123]/90 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-bold text-white truncate max-w-[200px]">{report.businessName}</span>
            {report.location && <span className="text-xs text-slate-500 hidden sm:block">· {report.location}</span>}
          </div>
          <a
            href={`tel:${report.phone || ''}`}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors"
            data-testid="link-book-call"
          >
            <Phone className="h-3.5 w-3.5" /> Book a Call
          </a>
        </div>
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1123] via-[#131a3a] to-[#0d1123]" />
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #2563eb 0%, transparent 60%), radial-gradient(circle at 80% 20%, #7c3aed 0%, transparent 50%)' }} />

        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-12 items-center">
            <div className="space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">12-Month Marketing Growth Strategy</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-black leading-tight">
                {report.businessName}
              </h1>

              <div className="flex flex-wrap gap-3 text-sm text-slate-400">
                {report.industry && (
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-slate-500" /> {report.industry}
                  </span>
                )}
                {report.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-500" /> {report.location}
                  </span>
                )}
                {report.websiteUrl && (
                  <a href={report.websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors">
                    <Globe className="h-3.5 w-3.5" /> {report.websiteUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>

              {es.currentChallenge && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-base leading-relaxed text-slate-300">{es.currentChallenge}</p>
                </div>
              )}

              {es.primaryGoal && (
                <div className="flex items-start gap-3">
                  <Target className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-base text-white font-medium">{es.primaryGoal}</p>
                </div>
              )}

              {/* Forecast band */}
              {diagnosis?.growthPotential?.forecastBand && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Add. Impressions', value: diagnosis.growthPotential.forecastBand.additionalImpressions },
                    { label: 'Add. Visitors', value: diagnosis.growthPotential.forecastBand.additionalVisitors },
                    { label: 'Add. Enquiries', value: diagnosis.growthPotential.forecastBand.additionalEnquiries },
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

          {/* Prepared by */}
          <div className="mt-12 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
            <span>Prepared {dateStr}{report.preparedBy ? ` by ${report.preparedBy}` : ''}</span>
            <span className="text-xs">Confidential · For {report.businessName} only</span>
          </div>
        </div>
      </section>

      {/* ── MARKET OPPORTUNITY ────────────────────────────────────────────── */}
      {mo.keywords?.length > 0 && (
        <section className="bg-white text-gray-900">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <div className="mb-10">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Market Opportunity</span>
              <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">The opportunity sitting in your market</h2>
              {mo.keyInsight && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
                  <Star className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold text-amber-800">{mo.keyInsight}</p>
                </div>
              )}
            </div>

            {/* Stats */}
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

            {/* Keyword table */}
            <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] bg-[#0d1123] text-white text-xs font-bold uppercase tracking-wider">
                <div className="px-4 py-3">Keyword</div>
                <div className="px-4 py-3 text-center">Monthly Searches</div>
                <div className="px-4 py-3 text-center">Current Rank</div>
                <div className="px-4 py-3 text-center">KD</div>
                <div className="px-4 py-3 text-center">Opportunity</div>
              </div>
              {mo.keywords.map((kw: any, i: number) => {
                const oppColor = kw.opportunity === 'high'
                  ? 'bg-green-100 text-green-700'
                  : kw.opportunity === 'medium'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-500';
                const kd = kw.difficulty != null ? Number(kw.difficulty) : null;
                const kdColor = kd != null ? (kd < 30 ? 'text-green-600' : kd < 60 ? 'text-amber-600' : 'text-red-500') : 'text-gray-400';
                return (
                  <div
                    key={i}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] text-sm border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                  >
                    <div className="px-4 py-3 font-medium text-gray-900">{kw.keyword}</div>
                    <div className="px-4 py-3 text-center font-semibold text-blue-600">{Number(kw.monthlySearches).toLocaleString()}</div>
                    <div className="px-4 py-3 text-center text-gray-500">{kw.currentRank}</div>
                    <div className={`px-4 py-3 text-center font-semibold ${kdColor}`}>{kd != null ? kd : '—'}</div>
                    <div className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${oppColor}`}>
                        {kw.opportunity}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {mo.keywords.length > 10 && (
              <p className="text-xs text-gray-400 text-right mt-2">{mo.keywords.length} keywords shown</p>
            )}
          </div>
        </section>
      )}

      {/* ── DIGITAL AUDIT ────────────────────────────────────────────────── */}
      {(da.website || da.gbp || da.authority) && (
        <section className="bg-[#0d1123]">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Digital Audit</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-10">Where you stand today</h2>
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
                        <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                          <Icon className="h-4 w-4 text-blue-400" />
                        </div>
                        <span className="text-sm font-bold text-white">{label}</span>
                      </div>
                      <div className={`flex items-center justify-center w-12 h-12 rounded-xl border text-lg font-black ${scoreColor} ${scoreBg}`}>
                        {score}
                      </div>
                    </div>
                    {data.reviews != null && (
                      <p className="text-xs text-slate-400">{data.reviews} reviews · {data.rating}★</p>
                    )}
                    {data.strengths?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-green-400 mb-1.5 uppercase tracking-wider">Strengths</p>
                        {data.strengths.slice(0, 3).map((s: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-300 mb-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {data.gaps?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-red-400 mb-1.5 uppercase tracking-wider">Gaps</p>
                        {data.gaps.slice(0, 3).map((g: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-400 mb-1">
                            <ChevronRight className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                            <span>{g}</span>
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

      {/* ── GROWTH PILLARS ───────────────────────────────────────────────── */}
      {pillars.length > 0 && (
        <section className="bg-gray-50">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Growth Strategy</span>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mt-2 mb-3">Your 4 growth pillars</h2>
            <p className="text-gray-500 mb-10">Every action we take sits under one of these pillars. Together they close the gap between where you are and where you could be.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pillars.slice(0, 4).map((pillar: any, i: number) => {
                const palette = PILLAR_COLORS[i % PILLAR_COLORS.length];
                const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
                return (
                  <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-12 h-12 ${palette.bg} rounded-xl flex items-center justify-center shrink-0`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Pillar {pillar.number || i + 1}</div>
                        <h3 className="text-lg font-bold text-gray-900">{pillar.title}</h3>
                      </div>
                    </div>
                    {pillar.goal && (
                      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{pillar.goal}</p>
                    )}
                    {pillar.timeframe && (
                      <div className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${palette.light} ${palette.text} mb-4`}>
                        {pillar.timeframe}
                      </div>
                    )}
                    {pillar.actions?.length > 0 && (
                      <div className="space-y-2">
                        {pillar.actions.slice(0, 3).map((act: any, j: number) => (
                          <div key={j} className={`flex items-start gap-2 p-3 rounded-xl ${palette.light} border ${palette.border}`}>
                            <ChevronRight className={`h-4 w-4 mt-0.5 shrink-0 ${palette.text}`} />
                            <div>
                              <p className="text-xs font-semibold text-gray-900">{act.action}</p>
                              {act.examples?.length > 0 && (
                                <p className="text-[10px] text-gray-500 mt-0.5">e.g. {act.examples.slice(0, 2).join(', ')}</p>
                              )}
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

      {/* ── 12-MONTH ROADMAP ─────────────────────────────────────────────── */}
      {roadmap.length > 0 && (
        <section className="bg-[#0d1123]">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Execution Plan</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-10">12-Month roadmap</h2>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-white/10 hidden md:block" />
              <div className="space-y-5">
                {roadmap.map((row: any, i: number) => (
                  <div key={i} className="relative flex gap-6 md:gap-8 items-start">
                    {/* Node */}
                    <div className="relative z-10 shrink-0 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-xs font-black text-white shadow-lg shadow-blue-900/50 hidden md:flex">
                      {i + 1}
                    </div>
                    <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-colors">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{row.period}</span>
                          <h3 className="text-base font-bold text-white mt-0.5">{row.phase}</h3>
                        </div>
                        {row.estimatedLeads && (
                          <div className="bg-green-500/15 border border-green-500/30 rounded-lg px-3 py-1.5 text-center">
                            <div className="text-lg font-black text-green-400">{row.estimatedLeads}</div>
                            <div className="text-[10px] text-green-600 uppercase tracking-wider">leads/mo</div>
                          </div>
                        )}
                      </div>
                      {row.focus?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {row.focus.map((f: string, j: number) => (
                            <span key={j} className="bg-white/10 text-slate-300 text-xs px-2.5 py-1 rounded-full">{f}</span>
                          ))}
                        </div>
                      )}
                      {row.milestone && (
                        <div className="flex items-start gap-2 text-xs text-slate-400">
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                          <span><strong className="text-slate-300">Milestone:</strong> {row.milestone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── PROJECTED OUTCOMES ───────────────────────────────────────────── */}
      {outcomes.length > 0 && (
        <section className="bg-white">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Projections</span>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mt-2 mb-3">What to expect, month by month</h2>
            <p className="text-gray-500 mb-10 max-w-2xl">These are estimates based on the market opportunity analysis and current baseline. Actual results vary based on competition and implementation speed.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {outcomes.map((outcome: any, i: number) => {
                const confColor = outcome.confidence === 'high'
                  ? 'text-green-600 bg-green-50 border-green-200'
                  : outcome.confidence === 'medium'
                  ? 'text-amber-600 bg-amber-50 border-amber-200'
                  : 'text-gray-500 bg-gray-50 border-gray-200';
                return (
                  <div key={i} className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{outcome.month}</p>
                    <div className="text-3xl font-black text-blue-600 mb-1">{outcome.estimatedLeads}</div>
                    <p className="text-xs text-gray-500 mb-3">leads/month</p>
                    {outcome.rankingKeywords && (
                      <p className="text-xs text-gray-400 mb-2">~{outcome.rankingKeywords} ranking keywords</p>
                    )}
                    <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${confColor}`}>
                      {outcome.confidence} confidence
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── KPI TABLE ────────────────────────────────────────────────────── */}
      {kpis.length > 0 && (
        <section className="bg-gray-50">
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

      {/* ── CTA SECTION ──────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-blue-700 via-blue-600 to-violet-700">
        <div className="max-w-4xl mx-auto px-6 py-20 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm text-white/90 mb-6">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Ready to start?</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-4">
            Ready to dominate{report.location ? ` ${report.location}` : ' your market'}?
          </h2>
          <p className="text-lg text-blue-100 mb-10 max-w-xl mx-auto leading-relaxed">
            This strategy is built specifically for {report.businessName}. Let's talk through what it means for your business and how we get started.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href={`tel:${report.phone || ''}`}
              className="flex items-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-full text-base hover:bg-blue-50 transition-colors shadow-xl"
              data-testid="link-cta-call"
            >
              <Phone className="h-5 w-5" /> Call Now
            </a>
            {report.preparedByEmail && (
              <a
                href={`mailto:${report.preparedByEmail}?subject=12-Month Strategy — ${report.businessName}`}
                className="flex items-center gap-2 bg-white/20 border border-white/30 text-white font-semibold px-8 py-4 rounded-full text-base hover:bg-white/30 transition-colors"
                data-testid="link-cta-email"
              >
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

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
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

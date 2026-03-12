import { useEffect, useState, useRef } from 'react';
import { useParams } from 'wouter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { CheckCircle2, TrendingUp, Eye, MousePointerClick, Trophy, Lock, ArrowRight, Gift, Users, BookOpen, ChevronRight, AlertCircle } from 'lucide-react';
import type { ClientReport } from '@/lib/types';

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'real-question', label: 'The Real Question' },
  { id: 'performance', label: 'Performance' },
  { id: 'whats-done', label: "What's Done" },
  { id: 'why-calls-low', label: 'Why Calls Are Low' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'next-steps', label: 'Next Steps' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'page1-vs-2', label: 'Page 1 vs 2' },
  { id: 'summary', label: 'Summary' },
];

const PILL_STYLES = {
  positive: 'border-green-400 text-green-300',
  growing: 'border-blue-400 text-blue-300',
  pending: 'border-amber-400 text-amber-300',
};

const PILL_ICONS = {
  positive: <CheckCircle2 className="h-3.5 w-3.5" />,
  growing: <TrendingUp className="h-3.5 w-3.5" />,
  pending: <Lock className="h-3.5 w-3.5" />,
};

export default function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<ClientReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('overview');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!reportId) return;
    fetch(`/api/reports/${reportId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setReport(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load report');
        setLoading(false);
      });
  }, [reportId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    Object.values(sectionRefs.current).forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [report]);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const setRef = (id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Loading your report…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <h1 className="text-xl font-semibold text-gray-900">Report not found</h1>
          <p className="text-gray-500">{error === 'Report has expired' ? 'This report link has expired. Please request an updated report.' : 'This report link is invalid or no longer available.'}</p>
        </div>
      </div>
    );
  }

  const rankingData = (report.monthlyData || []).map(d => ({
    month: d.month,
    position: d.position,
  })).filter(d => d.position != null);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-2">
            <span className="text-xs font-bold text-violet-700 uppercase tracking-wider shrink-0 mr-3">
              {report.clientName.toUpperCase().substring(0, 8)}
            </span>
            {NAV_SECTIONS.filter(s => {
              if (s.id === 'why-calls-low' && (!report.whyCallsAreLow || report.whyCallsAreLow.length === 0)) return false;
              if (s.id === 'opportunities' && (!report.opportunities || report.opportunities.length === 0)) return false;
              return true;
            }).map(section => (
              <button
                key={section.id}
                onClick={() => scrollTo(section.id)}
                className={`text-xs px-3 py-1.5 rounded-full shrink-0 transition-colors font-medium ${
                  activeSection === section.id
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="overview"
        ref={setRef('overview')}
        className="bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#1a0533] text-white px-6 py-16 md:py-24"
      >
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <span>{report.clientName} — {report.location} — {report.period}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
            SEO & Website Growth Update
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl leading-relaxed">
            {report.clientMessage || 'A clear view of what has been improved, what progress is showing in Google, and what still needs to happen to turn visibility into more enquiries.'}
          </p>
          <div className="flex flex-wrap gap-3">
            {(report.statusPills || []).map((pill, i) => (
              <div key={i} className={`flex items-center gap-2 border rounded-full px-4 py-1.5 text-sm font-medium ${PILL_STYLES[pill.status]}`}>
                {PILL_ICONS[pill.status]}
                {pill.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Real Question */}
      <section
        id="real-question"
        ref={setRef('real-question')}
        className="px-6 py-16 bg-white"
      >
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">Addressing the Real Concern</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">The real question: is it generating calls?</h2>
          <div className="bg-gray-50 rounded-2xl p-6 mb-6">
            <p className="text-violet-700 font-semibold text-lg leading-relaxed mb-4">
              At the moment, the campaign is showing encouraging progress — but it is completely understandable to feel frustrated if enquiries have not increased as much as you expected.
            </p>
            <p className="text-gray-600 leading-relaxed mb-6">
              SEO tends to work in stages. Each stage builds on the last, and the commercial payoff — more calls, more enquiries — typically comes once the later stages are reached. Here is where things usually move:
            </p>
            <div className="space-y-2">
              {[
                { label: 'Google understands & trusts the site', done: true },
                { label: 'Rankings improve', done: true },
                { label: 'Page 1 visibility grows', done: false },
                { label: 'Enquiry volume lifts meaningfully', done: false },
              ].map((stage, i) => (
                <div key={i} className={`flex items-center justify-between py-3 border-b border-gray-200 last:border-0 ${!stage.done ? 'opacity-40' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${stage.done ? 'bg-violet-600' : 'border-2 border-gray-300 bg-transparent'}`}>
                      {stage.done ? i + 1 : <span className="text-gray-400">{i + 1}</span>}
                    </div>
                    <span className={`font-medium ${stage.done ? 'text-gray-900' : 'text-gray-400'}`}>{stage.label}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                </div>
              ))}
            </div>
            <div className="mt-6 bg-white rounded-xl border border-violet-100 p-4">
              <p className="text-sm font-semibold text-violet-700 mb-1">Where the campaign is right now</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                The campaign appears to be between the foundation-building stage and the stronger enquiry-growth stage. Foundations are in place. Rankings are moving. The next focus is pushing key terms further — where enquiries follow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Performance Snapshot */}
      {report.performanceMetrics && report.performanceMetrics.length > 0 && (
        <section
          id="performance"
          ref={setRef('performance')}
          className="px-6 py-16 bg-gray-50"
        >
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">Numbers</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Performance snapshot</h2>
            <p className="text-gray-500 mb-10 max-w-2xl">These numbers suggest Google is indexing and surfacing the site more often — an early sign of improved search trust and relevance.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              {report.performanceMetrics.map((metric, i) => {
                const icons = [
                  <MousePointerClick className="h-5 w-5 text-violet-600" />,
                  <Eye className="h-5 w-5 text-violet-600" />,
                  <TrendingUp className="h-5 w-5 text-violet-600" />,
                ];
                const trendColor = metric.trend === 'increasing' ? 'text-green-600' : metric.trend === 'decreasing' ? 'text-red-500' : 'text-blue-600';
                const trendLabel = metric.trend === 'increasing' ? 'Increasing' : metric.trend === 'decreasing' ? 'Decreasing' : 'Improving';
                return (
                  <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                        {icons[i % icons.length]}
                      </div>
                      <span className={`text-xs font-semibold ${trendColor}`}>{trendLabel}</span>
                    </div>
                    <div className="text-4xl font-bold text-gray-900 mb-1">{metric.value}</div>
                    <div className="text-sm font-semibold text-gray-700 mb-1">{metric.label}</div>
                    <div className="text-xs text-gray-400">{metric.description}</div>
                  </div>
                );
              })}
            </div>
            {report.monthlyData && report.monthlyData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="font-semibold text-gray-900 mb-1">Clicks & Impressions Over Time</h3>
                  <p className="text-xs text-gray-400 mb-4">Monthly trend from Google Search Console</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={report.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="impressions" stroke="#7c3aed" fill="#ede9fe" strokeWidth={2} name="Impressions" />
                      <Area type="monotone" dataKey="clicks" stroke="#6d28d9" fill="#c4b5fd" strokeWidth={2} name="Clicks" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-0.5 bg-violet-400" />Clicks</div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-0.5 bg-violet-700" />Impressions</div>
                  </div>
                </div>
                {rankingData.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h3 className="font-semibold text-gray-900 mb-1">Ranking Movement</h3>
                    <p className="text-xs text-gray-400 mb-4">'{report.featuredKeyword?.keyword}' — lower = better</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={rankingData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis reversed tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <Tooltip formatter={(val: any) => [`Position ${val}`, 'Ranking']} />
                        <Line type="monotone" dataKey="position" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Position" />
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-green-600 mt-2">Position improving month-on-month</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* What's Been Done */}
      {report.completedWork && report.completedWork.length > 0 && (
        <section
          id="whats-done"
          ref={setRef('whats-done')}
          className="px-6 py-16 bg-white"
        >
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-600 mb-3">Work Completed</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">What has been done so far</h2>
            <p className="text-gray-500 mb-10 max-w-2xl">This work is essential because strong performance depends on technical health, clear relevance signals, and conversion-ready pages.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.completedWork.map((item, i) => (
                <div key={i} className="border border-gray-100 rounded-2xl p-6 shadow-sm">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed mb-4">{item.description}</p>
                  <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Why Calls Are Low */}
      {report.whyCallsAreLow && report.whyCallsAreLow.length > 0 && (
        <section
          id="why-calls-low"
          ref={setRef('why-calls-low')}
          className="px-6 py-16 bg-gray-50"
        >
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">Context</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Why calls may still feel low right now</h2>
            <p className="text-gray-500 mb-10 max-w-2xl">This is one of the most common experiences in an SEO campaign — and there are clear reasons for it.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.whyCallsAreLow.map((item, i) => {
                const icons = [
                  <TrendingUp className="h-5 w-5 text-blue-600" />,
                  <CheckCircle2 className="h-5 w-5 text-violet-600" />,
                  <Users className="h-5 w-5 text-amber-600" />,
                  <Eye className="h-5 w-5 text-green-600" />,
                ];
                const bgColors = ['bg-blue-50', 'bg-violet-50', 'bg-amber-50', 'bg-green-50'];
                return (
                  <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 ${bgColors[i % bgColors.length]} rounded-xl flex items-center justify-center shrink-0`}>
                        {icons[i % icons.length]}
                      </div>
                      <span className="text-sm font-bold text-gray-400 mt-2.5">{i + 1}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Keyword Progress */}
      {report.featuredKeyword && (
        <section
          id="keywords"
          ref={setRef('keywords')}
          className="px-6 py-16 bg-white"
        >
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">Search Rankings</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Keyword progress</h2>
            <p className="text-gray-500 mb-10">This is encouraging movement, but the biggest lift in enquiries usually comes once high-intent terms reach page 1.</p>
            <div className="border border-gray-100 rounded-2xl p-6 shadow-sm mb-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Featured Keyword</p>
              <h3 className="text-2xl font-bold text-gray-900 mb-8">{report.featuredKeyword.keyword}</h3>
              <div className="flex items-center justify-between relative">
                <div className="absolute left-0 right-0 h-0.5 bg-gray-100 top-8" />
                {/* Start */}
                <div className="flex flex-col items-center gap-2 z-10">
                  <div className="w-14 h-14 bg-gray-100 border-2 border-gray-200 rounded-2xl flex items-center justify-center">
                    <span className="text-xl">📍</span>
                  </div>
                  <span className="text-xs bg-gray-100 rounded-full px-3 py-1 font-medium text-gray-600">{report.featuredKeyword.startingPosition}</span>
                  <span className="text-xs text-gray-400">Starting point</span>
                </div>
                {/* Current */}
                <div className="flex flex-col items-center gap-2 z-10">
                  <div className="w-14 h-14 bg-violet-600 border-2 border-violet-400 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200">
                    <span className="text-white font-bold text-lg">{report.featuredKeyword.currentPosition}</span>
                  </div>
                  <span className="text-xs bg-violet-600 text-white rounded-full px-3 py-1 font-medium">Position {report.featuredKeyword.currentPosition}</span>
                  <span className="text-xs text-gray-400">Current position</span>
                </div>
                {/* Target */}
                <div className="flex flex-col items-center gap-2 z-10">
                  <div className="w-14 h-14 border-2 border-dashed border-amber-400 rounded-2xl flex items-center justify-center bg-amber-50">
                    <Trophy className="h-6 w-6 text-amber-500" />
                  </div>
                  <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-3 py-1 font-medium">Page 1 Goal</span>
                  <span className="text-xs text-gray-400">Target</span>
                </div>
              </div>
            </div>
            <div className="bg-violet-600 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white mb-1">Why page 1 is the real target</p>
                <p className="text-sm text-white/80 leading-relaxed">Studies consistently show that page 1 results receive over 90% of all clicks. Moving to page 1 is not just an incremental improvement — it is where enquiries meaningfully increase.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Next Steps */}
      {report.nextSteps && report.nextSteps.length > 0 && (
        <section
          id="next-steps"
          ref={setRef('next-steps')}
          className="px-6 py-16 bg-gray-50"
        >
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">Strategy</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">What we are focusing on next</h2>
            <p className="text-gray-500 mb-10">Each of these steps is designed to move the campaign closer to the commercial outcome — more page 1 rankings and more qualified enquiries.</p>
            <div className="space-y-4">
              {report.nextSteps.map((step, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-violet-600">S{step.step || i + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Step {step.step || i + 1}</p>
                      <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed mb-3">{step.description}</p>
                      <div className="bg-violet-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-violet-700 mb-1">Why this matters</p>
                        <p className="text-xs text-violet-600 leading-relaxed">{step.whyItMatters}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Extra Opportunities */}
      {report.opportunities && report.opportunities.length > 0 && (
        <section
          id="opportunities"
          ref={setRef('opportunities')}
          className="px-6 py-16 bg-white"
        >
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">Additional Opportunities</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Extra opportunities for growth</h2>
            <p className="text-gray-500 mb-10">These opportunities can help improve both search trust and client confidence, which can support higher enquiry rates over time.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {report.opportunities.map((opp, i) => {
                const icons = [<Gift className="h-5 w-5 text-violet-600" />, <Users className="h-5 w-5 text-violet-600" />, <BookOpen className="h-5 w-5 text-violet-600" />];
                return (
                  <div key={i} className="border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center mb-4">
                      {icons[i % icons.length]}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{opp.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{opp.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Page 1 vs Page 2 */}
      <section
        id="page1-vs-2"
        ref={setRef('page1-vs-2')}
        className="bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#1a0533] text-white px-6 py-16"
      >
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-300 mb-3">Why Position Matters</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Why page 1 matters so much</h2>
          <p className="text-white/70 mb-12 max-w-2xl">The current campaign has started the climb, but the real commercial upside comes when important terms move into page 1 positions.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Page 2</h3>
                  <p className="text-xs text-amber-400">Where things are now</p>
                </div>
              </div>
              <ul className="space-y-2">
                {['Visibility is building', 'Lower click potential', 'Most searchers don\'t scroll past page 1', 'Limited enquiry volume'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-white/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/10 rounded-2xl p-6 border border-green-400/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Page 1</h3>
                  <p className="text-xs text-green-400">The commercial goal</p>
                </div>
              </div>
              <ul className="space-y-2">
                {['Strong visibility and trust', 'Significantly higher click rates', 'Customers find you before competitors', 'Meaningful increase in enquiries'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-white/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="bg-white/5 rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-4">The click rate difference</h3>
            <div className="space-y-3">
              {[
                { label: 'Page 2 results', pct: 5, color: 'bg-amber-500', textColor: 'text-amber-300', note: '~3–5% of clicks' },
                { label: 'Page 1, positions 4–10', pct: 20, color: 'bg-blue-500', textColor: 'text-blue-300', note: '~10–20% of clicks' },
                { label: 'Page 1, positions 1–3', pct: 60, color: 'bg-green-500', textColor: 'text-green-300', note: '~30–60% of clicks' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm text-white/70 w-44 shrink-0">{item.label}</span>
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.pct}%` }} />
                  </div>
                  <span className={`text-xs font-semibold ${item.textColor} w-32 text-right shrink-0`}>{item.note}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/40 mt-4">Source: Industry click-through rate studies across competitive search markets</p>
          </div>
        </div>
      </section>

      {/* Summary */}
      {report.summaryPoints && report.summaryPoints.length > 0 && (
        <section
          id="summary"
          ref={setRef('summary')}
          className="px-6 py-16 bg-white"
        >
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Summary</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10">Where things stand right now</h2>
            <div className="border border-gray-100 rounded-2xl p-6 shadow-sm mb-6 space-y-3">
              {report.summaryPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700 leading-relaxed">{point.text}</span>
                </div>
              ))}
            </div>
            {report.closingStatement && (
              <div className="bg-violet-600 rounded-2xl p-6 flex items-start gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <Trophy className="h-5 w-5 text-white" />
                </div>
                <p className="text-sm text-white/90 leading-relaxed">{report.closingStatement}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-gray-400">
          <span>{report.clientName} — SEO Growth Report — {report.period}</span>
          <span>Prepared by your SEO team</span>
        </div>
      </footer>
    </div>
  );
}

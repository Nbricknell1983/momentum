import { useMemo, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { motion, useInView, useMotionValue, useSpring, AnimatePresence } from 'framer-motion';
import { Phone, Users, FileText, DollarSign, AlertTriangle, CheckCircle, Clock, Mail, MessageSquare, CalendarCheck, MapPin, Send, TrendingUp, Zap, BarChart2, Activity, ArrowRight, Target, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import MomentumScoreCard from '@/components/MomentumScoreCard';
import MomentumCoach from '@/components/MomentumCoach';
import { RootState } from '@/store';
import { calculateRollingAverage, detectTrendAlert, getMomentumStatusColor, getMomentumStatus, getMomentumStatusLabel } from '@/lib/momentumEngine';
import type { ActivityTargets, MomentumResult } from '@/lib/momentumEngine';
import { format, isToday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ReferenceLine, Area, AreaChart,
} from 'recharts';

// ─── Motion Presets ───────────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease } },
};

const stagger = (delay = 0.1) => ({
  hidden: {},
  visible: { transition: { staggerChildren: delay } },
});

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'today', label: "Today's Activity" },
  { id: 'momentum', label: 'Momentum' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'activity', label: 'Activity Log' },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── AnimatedCounter ──────────────────────────────────────────────
function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { damping: 30, stiffness: 80 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (inView) motionVal.set(value);
  }, [inView, value, motionVal]);

  useEffect(() => {
    return spring.on('change', (v) => setDisplay(Math.round(v)));
  }, [spring]);

  return (
    <span ref={ref}>
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
}

// ─── FadeUp wrapper ───────────────────────────────────────────────
function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────
function MetricCard({ icon: Icon, value, numValue, label, desc, trend, iconColor, delay = 0 }:
  { icon: any; value: string | number; numValue?: number; label: string; desc: string; trend?: string; iconColor: string; delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay }}
      whileHover={{ y: -6, boxShadow: '0 24px 48px rgba(124,58,237,0.12)' }}
      className="rounded-2xl border bg-white dark:bg-card p-6 flex flex-col gap-3 cursor-default"
      style={{ transition: 'box-shadow 0.3s ease' }}
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10 px-2 py-1 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <div className="text-4xl font-bold text-foreground tracking-tight">
        {numValue !== undefined ? <AnimatedCounter value={numValue} /> : value}
      </div>
      <div>
        <div className="font-semibold text-foreground text-sm mb-0.5">{label}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </motion.div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────
function SectionHeader({ tag, title, subtitle }: { tag: string; title: string; subtitle?: string }) {
  return (
    <FadeUp className="mb-10">
      <p className="text-xs font-semibold tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-3">{tag}</p>
      <h2 className="text-4xl font-bold text-foreground tracking-tight mb-3">{title}</h2>
      {subtitle && <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">{subtitle}</p>}
    </FadeUp>
  );
}

// ─── ActionCard ───────────────────────────────────────────────────
function ActionCard({ icon: Icon, title, desc, done = true, delay = 0, iconColor = 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-400/10' }:
  { icon: any; title: string; desc: string; done?: boolean; delay?: number; iconColor?: string }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay }}
      whileHover={{ y: -4, boxShadow: '0 16px 32px rgba(0,0,0,0.08)' }}
      className="rounded-2xl border bg-white dark:bg-card p-6 flex flex-col gap-4 cursor-default"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h4 className="font-semibold text-foreground mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
      {done && (
        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
          <CheckCircle className="h-4 w-4" />
          Completed
        </div>
      )}
    </motion.div>
  );
}

// ─── InsightCard ─────────────────────────────────────────────────
function InsightCard({ num, icon: Icon, title, desc, highlight = false, delay = 0 }:
  { num: number; icon: any; title: string; desc: string; highlight?: boolean; delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay }}
      whileHover={{ y: -4 }}
      className={`rounded-2xl border p-6 flex flex-col gap-4 cursor-default relative overflow-hidden ${
        highlight ? 'bg-violet-600 text-white border-violet-500' : 'bg-white dark:bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          highlight ? 'bg-white/20 text-white' : 'bg-violet-50 dark:bg-violet-400/10 text-violet-600 dark:text-violet-400'
        }`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          highlight ? 'bg-white/20 text-white' : 'bg-violet-100 dark:bg-violet-400/10 text-violet-600 dark:text-violet-400'
        }`}>
          #{num}
        </span>
      </div>
      <div>
        <h4 className={`font-semibold mb-1.5 ${highlight ? 'text-white' : 'text-foreground'}`}>{title}</h4>
        <p className={`text-sm leading-relaxed ${highlight ? 'text-white/80' : 'text-muted-foreground'}`}>{desc}</p>
      </div>
      {highlight && (
        <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
      )}
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const user = useSelector((state: RootState) => state.app.user);
  const leads = useSelector((state: RootState) => state.app.leads);
  const activities = useSelector((state: RootState) => state.app.activities);
  const dailyMetrics = useSelector((state: RootState) => state.app.dailyMetrics);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');

  const targets = user?.targets || { calls: 25, doors: 5, meetings: 3, followups: 15, proposals: 2, deals: 1 };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 60);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const todayActivityCounts = useMemo(() => {
    const todayActivities = activities.filter(a => {
      const createdAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(createdAt);
    });
    return {
      calls: todayActivities.filter(a => a.type === 'call').length,
      emails: todayActivities.filter(a => a.type === 'email').length,
      sms: todayActivities.filter(a => a.type === 'sms').length,
      meetings: todayActivities.filter(a => a.type === 'meeting').length,
      meetingsBooked: todayActivities.filter(a => a.type === 'meeting_booked').length,
      dropins: todayActivities.filter(a => a.type === 'dropin').length,
    };
  }, [activities]);

  const activityTargets: ActivityTargets = useMemo(() => ({
    calls: targets.calls,
    sms: Math.round(targets.followups * 0.5),
    emails: Math.round(targets.followups * 0.3),
    dropins: targets.doors,
    meetings: targets.meetings,
  }), [targets]);

  const previousScores = useMemo(() =>
    dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse(),
  [dailyMetrics]);

  const momentum = useMemo((): MomentumResult => {
    const ACTIVITY_WEIGHTS: Record<string, number> = { call: 1.0, sms: 0.6, email: 0.4, dropin: 1.2, meeting: 0.5 };
    const EARLY_STAGES = ['suspect', 'contacted', 'engaged'];
    const MID_STAGES = ['qualified', 'discovery'];
    const LATE_STAGES = ['proposal', 'verbal_commit', 'won'];

    const todayActivities = activities.filter(a => isToday(a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)));

    let weightedSum = 0, targetSum = 0;
    Object.entries(activityTargets).forEach(([key, target]) => {
      const type = key === 'dropins' ? 'dropin' : key === 'calls' ? 'call' : key === 'emails' ? 'email' : key === 'meetings' ? 'meeting' : key;
      const count = todayActivities.filter(a => a.type === type).length;
      const weight = ACTIVITY_WEIGHTS[type] || 0.5;
      weightedSum += Math.min(count, target) * weight;
      targetSum += target * weight;
    });

    const activityScore = targetSum > 0 ? Math.round((weightedSum / targetSum) * 100) : 0;
    const activeLeads = leads.filter(l => !l.archived);
    const totalStageCount = activeLeads.length;
    const earlyStageCount = activeLeads.filter(l => EARLY_STAGES.includes(l.stage)).length;
    const midStageCount = activeLeads.filter(l => MID_STAGES.includes(l.stage)).length;
    const lateStageCount = activeLeads.filter(l => LATE_STAGES.includes(l.stage)).length;

    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentWins = activities.filter(a => a.type === 'proposal_won' && new Date(a.createdAt) >= sevenDaysAgo).length;
    const recentLosses = activities.filter(a => (a.type === 'archived' || a.type === 'lost') && new Date(a.createdAt) >= sevenDaysAgo).length;
    const netChange = recentWins - recentLosses;
    const replacementRate = totalStageCount > 0 ? (netChange / totalStageCount) * 100 : 0;
    const replacementScore = Math.max(0, Math.min(100, 50 + replacementRate * 5));
    const newDealsCreated = activities.filter(a => a.type === 'lead_created' && new Date(a.createdAt) >= sevenDaysAgo).length;

    let pipelineHealthScore = 75, earlyStagePercent = 0, lateStagePercent = 0;
    if (totalStageCount > 0) {
      earlyStagePercent = Math.round((earlyStageCount / totalStageCount) * 100);
      lateStagePercent = Math.round(((midStageCount + lateStageCount) / totalStageCount) * 100);
      pipelineHealthScore = Math.max(0, Math.min(100, 100 - Math.abs(earlyStagePercent - 50)));
    }

    const rawScore = Math.round(replacementScore * 0.33 + activityScore * 0.34 + pipelineHealthScore * 0.33);
    const score = Math.max(0, Math.min(100, rawScore));
    const status = getMomentumStatus(score);
    const prevAvg = previousScores.length > 0 ? previousScores.reduce((a, b) => a + b, 0) / previousScores.length : score;
    const trend = score > prevAvg + 5 ? 'up' : score < prevAvg - 5 ? 'down' : 'flat';
    const minScore = Math.min(replacementScore, activityScore, pipelineHealthScore);
    const constraint = minScore === replacementScore ? 'replacement' : minScore === activityScore ? 'activity' : 'pipeline';

    return {
      score, status, statusLabel: getMomentumStatusLabel(status), statusColor: getMomentumStatusColor(status),
      breakdown: { replacementScore, replacementRate: Math.round(replacementRate), newDealsCreated, dealsRemoved: recentLosses, activityScore: Math.round(activityScore), activityIndex: weightedSum, targetActivityIndex: targetSum, pipelineHealthScore, earlyStagePercent, lateStagePercent, adjustments: [] },
      constraint, trend,
    };
  }, [activities, activityTargets, previousScores]);

  const trendData = useMemo(() => {
    const scores = dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse();
    const rollingAvg = calculateRollingAverage(scores, 3);
    return dailyMetrics.slice(0, 7).reverse().map((m, i) => ({
      date: format(new Date(m.date), 'EEE'),
      score: m.momentumScore,
      avg: rollingAvg[i] || m.momentumScore,
    }));
  }, [dailyMetrics]);

  const trendAlert = useMemo(() => detectTrendAlert(dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse()), [dailyMetrics]);

  const funnelData = useMemo(() => {
    const activeLeads = leads.filter(l => !l.archived);
    const stageCounts: Record<string, number> = {};
    activeLeads.forEach(l => { stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1; });
    return [
      { stage: 'Suspect', count: stageCounts['suspect'] || 0 },
      { stage: 'Contacted', count: stageCounts['contacted'] || 0 },
      { stage: 'Engaged', count: stageCounts['engaged'] || 0 },
      { stage: 'Qualified', count: stageCounts['qualified'] || 0 },
      { stage: 'Discovery', count: stageCounts['discovery'] || 0 },
      { stage: 'Proposal', count: stageCounts['proposal'] || 0 },
      { stage: 'Won', count: stageCounts['won'] || 0 },
    ];
  }, [leads]);

  const wonMrr = useMemo(() =>
    activities.filter(a => a.type === 'deal' || a.type === 'proposal_won' || (a.type === 'stage_change' && a.metadata?.newStage === 'won'))
      .reduce((sum, a) => sum + (Number(a.metadata?.mrr) || Number(a.metadata?.wonMrr) || 0), 0),
  [activities]);

  const totalActivityCounts = useMemo(() => ({
    proposalsSent: activities.filter(a => a.type === 'proposal_sent').length,
    proposalsWon: activities.filter(a => a.type === 'proposal_won').length,
    calls: activities.filter(a => a.type === 'call').length,
  }), [activities]);

  const recentActivities = useMemo(() =>
    [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
  [activities]);

  const todayCompletedActions = useMemo(() =>
    activities.filter(a => {
      const createdAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(createdAt) && a.type === 'nba_completed';
    }),
  [activities]);

  const activeLeadsCount = leads.filter(l => !l.archived).length;
  const todayLabel = format(new Date(), 'MMMM yyyy');
  const userName = authUser?.displayName || authUser?.email?.split('@')[0] || 'Rep';

  const momentumBadge =
    momentum.score >= 80 ? { label: 'Momentum Strong', color: 'border-emerald-400/40 text-emerald-300', icon: Zap } :
    momentum.score >= 65 ? { label: 'Building Momentum', color: 'border-blue-400/40 text-blue-300', icon: TrendingUp } :
    { label: 'Momentum At Risk', color: 'border-amber-400/40 text-amber-300', icon: AlertTriangle };

  const insights = [
    { icon: Phone, title: 'Calls drive pipeline', desc: 'Every call logged keeps leads warm and momentum scores healthy. Stay above your daily target.', highlight: true },
    { icon: Users, title: 'Pipeline balance matters', desc: 'A healthy pipeline has leads in every stage. If everything is stuck at Suspect, push for discovery calls.' },
    { icon: TrendingUp, title: 'Proposals close deals', desc: 'The faster you move qualified leads to proposal, the shorter your sales cycle. Aim for same-week proposals.' },
    { icon: Target, title: 'Follow-up is everything', desc: 'Most deals close on the 5th+ contact. Log every follow-up and never let a lead go cold.' },
  ];

  const customTooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    fontSize: '12px',
  };

  return (
    <div ref={scrollRef} className="h-full overflow-auto" data-testid="text-dashboard-title">

      {/* ── Sticky Nav ── */}
      <motion.div
        className="sticky top-0 z-30 border-b transition-all duration-300"
        animate={scrolled
          ? { backgroundColor: 'hsl(var(--background)/0.92)', backdropFilter: 'blur(16px)' }
          : { backgroundColor: 'hsl(var(--background))', backdropFilter: 'blur(0px)' }
        }
      >
        <div className="flex items-center gap-1 px-8 overflow-x-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground pr-4 shrink-0 py-3.5">MOMENTUM</span>
          {NAV_SECTIONS.map((s) => (
            <motion.button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              whileHover={{ backgroundColor: 'hsl(var(--muted)/0.5)' }}
              whileTap={{ scale: 0.97 }}
              className="px-4 py-3.5 text-sm text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors rounded-sm"
            >
              {s.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── HERO ── */}
      <section id="overview" className="relative px-12 pt-16 pb-28 overflow-hidden"
        style={{ background: 'linear-gradient(120deg, #13082e 0%, #1e0c4a 25%, #3b1585 60%, #5b1fc8 85%, #6d28d9 100%)' }}
      >
        {/* Animated glow blobs */}
        <motion.div
          className="absolute -top-20 right-0 w-[600px] h-[600px] rounded-full opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-10 right-40 w-[300px] h-[300px] rounded-full opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)' }}
          animate={{ scale: [1.1, 1, 1.1], x: [0, -20, 0], y: [0, 15, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />

        <motion.div
          className="relative max-w-3xl"
          variants={stagger(0.12)}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-white/70 text-sm mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            {userName} — {todayLabel}
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
            Daily Sales Performance
          </motion.h1>

          <motion.p variants={fadeUp} className="text-white/60 text-xl max-w-2xl mb-10 leading-relaxed">
            A live view of today's activity, pipeline momentum, and where to focus your energy next.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-wrap gap-3 mb-10">
            {[
              { label: momentumBadge.label, color: momentumBadge.color, icon: momentumBadge.icon },
              { label: `${activeLeadsCount} Active Leads`, color: 'border-violet-400/40 text-violet-300', icon: Users },
              { label: `$${wonMrr.toLocaleString()} Won MRR`, color: 'border-sky-400/40 text-sky-300', icon: DollarSign },
            ].map((badge, i) => (
              <motion.div
                key={badge.label}
                whileHover={{ scale: 1.04, backgroundColor: 'rgba(255,255,255,0.08)' }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-white/5 text-sm font-medium cursor-default transition-colors ${badge.color}`}
              >
                <badge.icon className="h-3.5 w-3.5" />
                {badge.label}
              </motion.div>
            ))}
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="flex gap-8">
            {[
              { value: totalActivityCounts.calls, label: 'Total Calls' },
              { value: totalActivityCounts.proposalsSent, label: 'Proposals Sent' },
              { value: totalActivityCounts.proposalsWon, label: 'Won' },
              { value: activeLeadsCount, label: 'Active Leads' },
            ].map((kpi) => (
              <div key={kpi.label} className="text-center">
                <div className="text-2xl font-bold text-white"><AnimatedCounter value={kpi.value} /></div>
                <div className="text-xs text-white/40 mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll mouse indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-40">
          <svg width="22" height="34" viewBox="0 0 22 34" fill="none">
            <rect x="1" y="1" width="20" height="32" rx="10" stroke="white" strokeWidth="1.5"/>
            <rect x="9.5" y="7" width="3" height="7" rx="1.5" fill="white">
              <animateTransform attributeName="transform" type="translate" values="0,0;0,5;0,0" dur="1.8s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="1;0.2;1" dur="1.8s" repeatCount="indefinite"/>
            </rect>
          </svg>
        </div>
      </section>

      {/* ── TODAY'S ACTIVITY ── */}
      <section id="today" className="px-12 py-20 bg-white dark:bg-background">
        <div className="max-w-5xl">
          <SectionHeader
            tag="TODAY'S NUMBERS"
            title="Performance snapshot"
            subtitle="These numbers reflect all logged activity since midnight. Hit your targets consistently to build momentum."
          />

          {/* Primary 3-col KPI cards */}
          <motion.div
            className="grid grid-cols-3 gap-5 mb-6"
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            <MetricCard icon={Phone} numValue={todayActivityCounts.calls} value={todayActivityCounts.calls} label="Calls Made" desc={`Target: ${targets.calls} calls today`} trend={todayActivityCounts.calls >= targets.calls ? 'On Target' : undefined} iconColor="text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/10" delay={0} />
            <MetricCard icon={CalendarCheck} numValue={todayActivityCounts.meetingsBooked} value={todayActivityCounts.meetingsBooked} label="Meetings Booked" desc="New appointments scheduled today" iconColor="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10" delay={0.1} />
            <MetricCard icon={Users} numValue={todayActivityCounts.meetings} value={todayActivityCounts.meetings} label="Meetings Held" desc={`Target: ${targets.meetings} per day`} trend={todayActivityCounts.meetings >= targets.meetings ? 'On Target' : undefined} iconColor="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10" delay={0.2} />
          </motion.div>

          {/* Secondary row */}
          <motion.div
            className="grid grid-cols-3 gap-5 mb-12"
            variants={stagger(0.08)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            {[
              { icon: Mail, value: todayActivityCounts.emails, label: 'Emails', color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-400/10' },
              { icon: MessageSquare, value: todayActivityCounts.sms, label: 'SMS', color: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-400/10' },
              { icon: MapPin, value: todayActivityCounts.dropins, label: 'Drop-ins', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                variants={fadeUp}
                whileHover={{ y: -4, boxShadow: '0 16px 32px rgba(0,0,0,0.07)' }}
                className="rounded-2xl border bg-white dark:bg-card p-5 flex items-center gap-4"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold"><AnimatedCounter value={item.value} /></div>
                  <div className="text-sm text-muted-foreground">{item.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* All-time dark strip */}
          <FadeUp>
            <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, #0f0a1e 0%, #1a1040 100%)' }}>
              <p className="text-xs font-semibold tracking-widest text-white/40 uppercase mb-6">ALL-TIME TOTALS</p>
              <div className="grid grid-cols-3 gap-6">
                {[
                  { icon: Send, value: totalActivityCounts.proposalsSent, label: 'Proposals Sent', color: 'text-violet-400 bg-violet-400/10' },
                  { icon: FileText, value: totalActivityCounts.proposalsWon, label: 'Proposals Won', color: 'text-emerald-400 bg-emerald-400/10' },
                  { icon: DollarSign, value: wonMrr, label: 'Won MRR', color: 'text-sky-400 bg-sky-400/10', prefix: '$' },
                ].map((item: any) => (
                  <div key={item.label} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">
                        <AnimatedCounter value={item.value} prefix={item.prefix || ''} />
                      </div>
                      <div className="text-sm text-white/50">{item.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── MOMENTUM ── */}
      <section id="momentum" className="px-12 py-20" style={{ background: '#f8f7ff' }}>
        <div className="max-w-5xl">
          <SectionHeader
            tag="MOMENTUM SCORE"
            title="How you're tracking"
            subtitle="Your score reflects pipeline health, activity consistency, and deal flow — updated in real time."
          />
          <motion.div
            className="grid lg:grid-cols-2 gap-6 mb-8"
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <motion.div variants={fadeUp}><MomentumScoreCard momentum={momentum} showBreakdown={true} /></motion.div>
            <motion.div variants={fadeUp}><MomentumCoach momentum={momentum} /></motion.div>
          </motion.div>

          <FadeUp>
            <div className="rounded-2xl p-6 border-l-4 border-violet-500 bg-violet-50 dark:bg-violet-950/30">
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-1">Where the momentum is right now</p>
              <p className="text-sm text-violet-700/70 dark:text-violet-400">
                {momentum.score >= 80
                  ? 'You are in a strong momentum phase. Keep activity consistent and protect your pipeline health.'
                  : momentum.score >= 65
                  ? 'Momentum is building. Focus on converting engaged leads and maintaining call volume to push into the healthy zone.'
                  : 'Momentum needs attention. Prioritise calls and new lead outreach today to turn the trend around.'}
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── PIPELINE / CHARTS ── */}
      <section id="pipeline" className="px-12 py-20 bg-white dark:bg-background">
        <div className="max-w-5xl">
          <SectionHeader
            tag="PIPELINE"
            title="Trend & funnel"
            subtitle="Your 7-day momentum trend and a full breakdown of where leads sit across every stage right now."
          />

          <motion.div
            className="grid lg:grid-cols-2 gap-6 mb-16"
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            {/* Trend chart */}
            <motion.div
              variants={fadeUp}
              whileHover={{ boxShadow: '0 20px 40px rgba(124,58,237,0.08)' }}
              className="rounded-2xl border bg-white dark:bg-card p-6"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-500" />
                  <h3 className="font-semibold">Momentum Trend</h3>
                </div>
                <div className="flex items-center gap-2">
                  {trendAlert.alert && (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      {trendAlert.type === 'downtrend' ? 'Downtrend' : 'Flatline'}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">Last 7 Days</Badge>
                </div>
              </div>
              <div className="h-52" data-testid="momentum-trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={customTooltipStyle} formatter={(v: number, n: string) => [v, n === 'avg' ? '3-Day Avg' : 'Score']} />
                    <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 4" />
                    <ReferenceLine y={65} stroke="#f59e0b" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={2.5} fill="url(#scoreGrad)" dot={{ fill: '#7c3aed', r: 4, strokeWidth: 2, stroke: 'white' }} />
                    <Line type="monotone" dataKey="avg" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Funnel chart */}
            <motion.div
              variants={fadeUp}
              whileHover={{ boxShadow: '0 20px 40px rgba(124,58,237,0.08)' }}
              className="rounded-2xl border bg-white dark:bg-card p-6"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-violet-500" />
                  <h3 className="font-semibold">Pipeline Funnel</h3>
                </div>
                <Badge variant="secondary" className="text-xs">{funnelData.reduce((s, d) => s + d.count, 0)} Leads</Badge>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="stage" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={72} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </motion.div>

          {/* What success looks like */}
          <SectionHeader tag="THE GOAL" title="What success looks like" />
          <motion.div
            className="grid grid-cols-3 gap-5"
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            {[
              { icon: Target, title: 'Full Pipeline', desc: 'Every stage loaded with real opportunities — no gaps, no stale cards sitting untouched.', color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/10' },
              { icon: TrendingUp, title: 'Consistent Activity', desc: 'Daily call targets hit, follow-ups logged on time, and momentum score trending green.', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10' },
              { icon: DollarSign, title: 'Growing MRR', desc: 'Proposals converting to wins and recurring revenue compounding month over month.', color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-400/10' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(124,58,237,0.1)' }}
                className="rounded-2xl border bg-white dark:bg-card p-6"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${item.color}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="font-semibold text-foreground mb-2">{item.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{item.desc}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── INSIGHTS ── */}
      <section className="px-12 py-20" style={{ background: '#f8f7ff' }}>
        <div className="max-w-5xl">
          <SectionHeader
            tag="SALES INSIGHTS"
            title="What moves the needle"
            subtitle="Strategic principles behind every high-performing sales pipeline."
          />
          <motion.div
            className="grid grid-cols-2 gap-5"
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            {insights.map((ins, i) => (
              <InsightCard key={ins.title} num={i + 1} icon={ins.icon} title={ins.title} desc={ins.desc} highlight={ins.highlight} delay={i * 0.1} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── ACTIVITY LOG ── */}
      <section id="activity" className="px-12 py-20 bg-white dark:bg-background">
        <div className="max-w-5xl">
          <SectionHeader
            tag="ACTIVITY LOG"
            title="What's been happening"
            subtitle="A complete log of recent activity across your pipeline."
          />
          <motion.div
            className="grid lg:grid-cols-2 gap-6"
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <motion.div variants={fadeUp} className="rounded-2xl border bg-white dark:bg-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-semibold">Completed Today</h3>
                </div>
                <Badge>{todayCompletedActions.length}</Badge>
              </div>
              <div className="space-y-2">
                {todayCompletedActions.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">No completed actions yet today</p>
                    <p className="text-xs text-muted-foreground mt-1">Log activity from the Pipeline to see it here</p>
                  </div>
                ) : todayCompletedActions.slice(0, 6).map(activity => (
                  <motion.div
                    key={activity.id}
                    whileHover={{ backgroundColor: 'hsl(var(--muted)/0.5)', x: 2 }}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                    data-testid={`completed-action-${activity.id}`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-400/10 flex items-center justify-center shrink-0">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{activity.notes || 'Action completed'}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'h:mm a')}</p>
                    </div>
                    {activity.metadata?.points && <Badge variant="outline" className="text-xs shrink-0">+{activity.metadata.points}</Badge>}
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="rounded-2xl border bg-white dark:bg-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">Recent Activity</h3>
                </div>
                <Badge variant="secondary">{recentActivities.length}</Badge>
              </div>
              <div className="space-y-2">
                {recentActivities.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">No recent activity logged yet</p>
                  </div>
                ) : recentActivities.map(activity => (
                  <motion.div
                    key={activity.id}
                    whileHover={{ backgroundColor: 'hsl(var(--muted)/0.5)', x: 2 }}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                    data-testid={`recent-activity-${activity.id}`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-400/10 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate capitalize">{activity.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'MMM d, h:mm a')}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── CLOSING CTA ── */}
      <FadeUp>
        <section className="px-12 py-16 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e0a4e 0%, #3b1585 50%, #6d28d9 100%)' }}>
          <motion.div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(ellipse 60% 80% at 80% 50%, #a78bfa 0%, transparent 60%)' }}
            animate={{ opacity: [0.15, 0.25, 0.15] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative max-w-5xl flex items-center justify-between gap-8 flex-wrap">
            <div>
              <p className="text-xs font-semibold tracking-widest text-violet-300 uppercase mb-2">SUMMARY</p>
              <h2 className="text-3xl font-bold text-white mb-2">Keep the momentum going</h2>
              <p className="text-white/60 max-w-lg">
                Every call logged, every follow-up scheduled, and every proposal sent compounds into pipeline momentum. Stay consistent.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: '0 12px 32px rgba(124,58,237,0.4)' }}
              whileTap={{ scale: 0.97 }}
              onClick={() => scrollTo('today')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-violet-700 font-semibold rounded-xl text-sm shrink-0 transition-all"
            >
              View Today's Activity
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </div>
        </section>
      </FadeUp>

      {/* Footer */}
      <div className="px-12 py-8 border-t bg-white dark:bg-background flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{userName} — Momentum Agent — {format(new Date(), 'MMMM yyyy')}</p>
        <p className="text-sm text-muted-foreground">Built to drive pipeline momentum</p>
      </div>
    </div>
  );
}

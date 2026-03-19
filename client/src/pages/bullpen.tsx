import { useState, useMemo, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Link, Redirect } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { RootState } from '@/store';
import type { Lead, Activity, Client, NBAAction } from '@/lib/types';
import { db, doc, collection, query, orderBy, limit, onSnapshot } from '@/lib/firebase';
import BullpenCommandCenter from '@/components/BullpenCommandCenter';
import BullpenWorkQueue from '@/components/BullpenWorkQueue';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { AutomationRulesReadResult } from '@shared/controlPlaneSchemas';
import { differenceInDays, formatDistanceToNow, isToday, format } from 'date-fns';
import {
  Briefcase, TrendingUp, Globe, Search, BarChart3, Star, Users, Shield,
  Settings2, AlertTriangle, CheckCircle2, Clock, Zap, ChevronDown, ChevronRight,
  ExternalLink, RefreshCw, Activity as ActivityIcon, Timer, Ban,
  BriefcaseBusiness, Cpu, Eye, Radio, Compass, Bot, Link2, MapPin,
  FileSearch, PlayCircle, Wrench, UserCheck, GitMerge, List,
  Landmark, FlaskConical, Share2, BookOpen, Target, Layers,
  TrendingDown, ArrowRight, ChevronLeft,
  Code2, Layout, Server, Workflow, TestTube2, Cloud
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type BullpenStatus = 'active' | 'idle' | 'blocked' | 'needs_attention' | 'awaiting_approval';

interface RoleMetrics {
  id: string;
  name: string;
  icon: typeof Briefcase;
  status: BullpenStatus;
  currentCount: number;
  currentLabel: string;
  blockerCount: number;
  blockerSummary?: string;
  lastActionLabel?: string;
  detail: string;
  linkedPath?: string;
  tier?: 'leadership' | 'execution' | 'development' | 'control';
}

interface AttentionItem {
  id: string;
  title: string;
  description: string;
  role: string;
  severity: 'high' | 'medium' | 'low';
  linkedPath?: string;
  linkedLabel?: string;
}

interface AgentCommsMessage {
  id: string;
  from: string;
  fromIcon: typeof Briefcase;
  fromBg: string;
  message: string;
  minutesAgo: number;
}

interface SecretaryItem {
  id: string;
  title: string;
  reason: string;
  flaggedBy: string;
  priority: 'urgent' | 'high' | 'medium';
  icon: typeof Briefcase;
  actionLabel: string;
  path: string;
}

interface AutomationRules {
  workHoursStart: string;
  workHoursEnd: string;
  timezone: string;
  blockSmsOutsideHours: boolean;
  blockEmailOutsideHours: boolean;
  blockCallsOutsideHours: boolean;
  requireApprovalCampaigns: boolean;
  requireApprovalHighRisk: boolean;
  requireApprovalPublish: boolean;
  requireApprovalProduction: boolean;
}

const DEFAULT_RULES: AutomationRules = {
  workHoursStart: '08:00',
  workHoursEnd: '17:30',
  timezone: 'Australia/Brisbane',
  blockSmsOutsideHours: true,
  blockEmailOutsideHours: false,
  blockCallsOutsideHours: true,
  requireApprovalCampaigns: true,
  requireApprovalHighRisk: true,
  requireApprovalPublish: true,
  requireApprovalProduction: true,
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const ROLE_META: Record<string, { icon: typeof Briefcase; bg: string }> = {
  'Sales':       { icon: BriefcaseBusiness, bg: 'bg-blue-500' },
  'SEO':         { icon: Search,            bg: 'bg-emerald-500' },
  'Website':     { icon: Globe,             bg: 'bg-orange-500' },
  'Ads':         { icon: BarChart3,         bg: 'bg-amber-500' },
  'GBP':         { icon: Star,              bg: 'bg-yellow-600' },
  'Growth':      { icon: TrendingUp,        bg: 'bg-indigo-500' },
  'Reviews':     { icon: Shield,            bg: 'bg-purple-500' },
  'Strategy':    { icon: Eye,               bg: 'bg-slate-600' },
  'Strategist':  { icon: Compass,           bg: 'bg-violet-600' },
  'Ops':         { icon: Cpu,               bg: 'bg-gray-500' },
  'Social':      { icon: Share2,            bg: 'bg-pink-500' },
  'Commercial':  { icon: Landmark,          bg: 'bg-teal-600' },
  'Performance': { icon: FlaskConical,      bg: 'bg-rose-600' },
  'FullStack':   { icon: Code2,             bg: 'bg-cyan-600' },
  'Frontend':    { icon: Layout,            bg: 'bg-sky-500' },
  'Backend':     { icon: Server,            bg: 'bg-blue-700' },
  'CRM':         { icon: Workflow,          bg: 'bg-fuchsia-600' },
  'QA':          { icon: TestTube2,         bg: 'bg-lime-600' },
  'DevOps':      { icon: Cloud,             bg: 'bg-slate-500' },
  'Team':        { icon: Users,             bg: 'bg-slate-700' },
};

// ─── Role Intelligence Config ─────────────────────────────────────────────────

interface RoleFramework { name: string; focus: string }

interface RoleConfig {
  id: string;
  tier: 'leadership' | 'execution' | 'development' | 'control';
  roleDescription: string;
  expertFrameworks: RoleFramework[];
  operatingPrinciples: string[];
  inputSignals: string[];
  outputTypes: string[];
  successMetrics: string[];
}

const ROLE_CONFIG: Record<string, RoleConfig> = {
  sales: {
    id: 'sales', tier: 'execution',
    roleDescription: 'Outreach, follow-up, stage progression, objection handling, conversion from lead to meeting or proposal.',
    expertFrameworks: [
      { name: 'NEPQ (Jeremy Miner)', focus: 'Consultative discovery — ask instead of pitch, surface emotional drivers' },
      { name: 'Never Split the Difference (Chris Voss)', focus: 'Tactical empathy, labeling, calibrated questions, no-pressure negotiation' },
      { name: 'Fanatical Prospecting (Jeb Blount)', focus: 'Pipeline discipline, activity consistency, follow-up cadence' },
      { name: 'Value Equation (Alex Hormozi)', focus: 'Offer clarity, commercial framing, dream outcome articulation' },
      { name: 'Challenger Sale', focus: 'Teach, reframe, insight-led selling — lead with a point of view' },
    ],
    operatingPrinciples: [
      'Ask before telling — understand the problem before presenting the solution',
      'Follow up the same day. Momentum dies in the gap.',
      'Every touch must move the prospect closer to a decision — not just check in',
      'Pipeline discipline over activity vanity',
    ],
    inputSignals: ['lead stage', 'last contact date', 'overdue follow-ups', 'next best actions', 'open NBA queue'],
    outputTypes: ['call prep notes', 'discovery questions', 'objection handling suggestions', 'follow-up drafts', 'next best touch recommendations'],
    successMetrics: ['contact rate', 'meeting booked rate', 'proposal progression rate', 'reply rate', 'stage movement velocity'],
  },
  strategy: {
    id: 'strategy', tier: 'leadership',
    roleDescription: 'Diagnosis, growth prescription, roadmap generation, strategic prioritization, translating data into direction.',
    expertFrameworks: [
      { name: 'Competitive Advantage (Michael Porter)', focus: 'Positioning, strategic trade-offs, sustainable differentiation' },
      { name: 'Measurement Discipline (Peter Drucker)', focus: 'What gets measured gets managed — objective clarity and progress tracking' },
      { name: 'Business Growth (Alex Hormozi)', focus: 'Offer-market fit, value leverage, compounding growth logic' },
      { name: 'Mental Models (Charlie Munger)', focus: 'Decision quality, rational prioritization, avoiding first-order thinking' },
      { name: 'Challenger Insight Selling', focus: 'Show the gap between current state and opportunity — create urgency from evidence' },
    ],
    operatingPrinciples: [
      'Diagnosis before direction — never prescribe without understanding the business',
      'Strategic trade-offs are decisions, not compromises',
      'Show the cost of inaction, not just the benefit of action',
      'Every recommendation must be executable — not just directional',
    ],
    inputSignals: ['discovery context', 'strategy intelligence', 'engine scores', 'growth plays', 'lead stage data'],
    outputTypes: ['growth prescription', 'strategy direction', '3-phase roadmap', 'four growth pillars', 'priority stack recommendations', 'cost of inaction framing'],
    successMetrics: ['prescription adoption rate', 'clarity of prioritization', 'downstream execution readiness', 'strategy generation quality'],
  },
  website: {
    id: 'website', tier: 'execution',
    roleDescription: 'Website structure, conversion clarity, page architecture, service/location presentation, build readiness.',
    expertFrameworks: [
      { name: 'StoryBrand (Donald Miller)', focus: 'Clarity hierarchy — what you do, who you serve, why choose you' },
      { name: "Don't Make Me Think (Steve Krug)", focus: 'Usability, simplicity, low-friction user flow' },
      { name: 'CRO Thinking (Peep Laja)', focus: 'Conversion-first structure, decision friction reduction, trust placement' },
      { name: 'SEO-aware Content (Brian Dean)', focus: 'Page structure aligned with search intent and content usefulness' },
      { name: 'Direct Response Principles', focus: 'Clear CTA, trust signals in the right places, intent matching' },
    ],
    operatingPrinciples: [
      'Clarity beats cleverness — if a visitor has to think, you have failed',
      'Every page must have one job',
      'Build for the buyer\'s decision, not the client\'s ego',
      'Running ads to a weak website is burning money',
    ],
    inputSignals: ['website engine score', 'overall grade', 'onboarding context', 'service data', 'conversion structure flags'],
    outputTypes: ['sitemap structures', 'page recommendations', 'H1/H2 frameworks', 'CTA placement suggestions', 'service/location page plans', 'build rollout structure'],
    successMetrics: ['conversion rate lift', 'improved clarity score', 'page coverage completeness', 'build readiness'],
  },
  seo: {
    id: 'seo', tier: 'execution',
    roleDescription: 'Keyword targeting, service/location intent coverage, internal linking, content planning, search visibility scoring.',
    expertFrameworks: [
      { name: 'Search Intent (Rand Fishkin)', focus: 'Audience/search alignment, discoverability, intent before keyword volume' },
      { name: 'Search Architecture (Aleyda Solis)', focus: 'Technical structure, crawlability, page hierarchy' },
      { name: 'Content-driven Rankings (Brian Dean)', focus: 'On-page opportunity, content clusters, ranking content systems' },
      { name: 'Testing Mindset (Kyle Roof)', focus: 'What actually drives rankings — data over assumption' },
      { name: 'Intent Clustering Logic', focus: 'Service intent, location intent, problem/need intent, comparison and decision intent' },
    ],
    operatingPrinciples: [
      'Service pages before blog content — commercial intent converts',
      'Location coverage is local moat-building',
      'Internal linking is authority distribution — treat it as architecture',
      'Rankings are earned by relevance, not tricks',
    ],
    inputSignals: ['SEO engine outputs', 'onboarding service/location data', 'keyword targets', 'content gap analysis', 'visibility score'],
    outputTypes: ['keyword grouping', 'service page plan', 'location page plan', 'internal linking recommendations', 'SEO rollout priorities', 'search opportunity scoring'],
    successMetrics: ['ranking keyword growth', 'service/location page coverage', 'search visibility increase', 'organic enquiry growth'],
  },
  gbp: {
    id: 'gbp', tier: 'execution',
    roleDescription: 'Local ranking growth, profile quality, category and service optimization, review support, map visibility.',
    expertFrameworks: [
      { name: 'GBP Fundamentals (Google)', focus: 'Relevance, prominence, distance — the three ranking levers for Maps Pack' },
      { name: 'Local SEO Authority (Joy Hawkins)', focus: 'Real-world GBP optimization and local visibility strategy' },
      { name: 'Local Trust (Darren Shaw)', focus: 'Citations, local presence consistency, entity authority' },
      { name: 'Review & Entity Consistency', focus: 'Service/category/photo/review alignment as a ranking signal' },
    ],
    operatingPrinciples: [
      'Profile completeness is the foundation — gaps are ranking gaps',
      'Review velocity beats review count — recency matters most',
      'Category precision outweighs breadth — own the right category first',
      'Proximity cannot be controlled, but relevance and prominence can',
    ],
    inputSignals: ['GBP engine score', 'review velocity', 'profile completeness', 'GBP location linked', 'maps scan data'],
    outputTypes: ['maps authority score drivers', 'what\'s holding score back', 'service/category recommendations', 'review velocity plan', 'profile completeness actions'],
    successMetrics: ['maps pack visibility', 'profile completeness score', 'review velocity', 'local keyword coverage', 'GBP health improvement'],
  },
  ads: {
    id: 'ads', tier: 'execution',
    roleDescription: 'Demand capture, campaign structure, keyword grouping, ad messaging, paid traffic ROI.',
    expertFrameworks: [
      { name: 'Google Ads Structure (Perry Marshall)', focus: 'ROI discipline, quality score thinking, search intent matching' },
      { name: 'Offer Strength (Alex Hormozi)', focus: 'Commercial framing, value equation, irresistible offer mechanics' },
      { name: 'Direct Response Copy (Dan Kennedy)', focus: 'Response-oriented ads, conversion logic, specific CTAs' },
      { name: 'Awareness Levels (Eugene Schwartz)', focus: 'Match ad message to buyer awareness — cold vs warm vs hot traffic' },
      { name: 'Commercial Performance Mindset', focus: 'Leads and cost per lead — not impressions or clicks' },
    ],
    operatingPrinciples: [
      'Ads amplify what already works — weak websites kill campaign ROI',
      'Intent match is everything — serve the right message at the right stage',
      'Budget without tracking is waste — every dollar must be accountable',
      'Readiness score must exceed 60 before recommending launch',
    ],
    inputSignals: ['ads engine outputs', 'readiness score', 'website grade', 'SEO foundation', 'onboarding context'],
    outputTypes: ['campaign structure recommendations', 'ad group plans', 'keyword cluster drafts', 'ad copy suggestions', 'budget allocation logic', 'risk/opportunity alerts'],
    successMetrics: ['CTR', 'conversion rate', 'cost per lead', 'lead quality', 'revenue contribution'],
  },
  social: {
    id: 'social', tier: 'execution',
    roleDescription: 'Awareness, trust reinforcement, demand creation, nurture support, retargeting signal.',
    expertFrameworks: [
      { name: 'Attention Economy (Gary Vaynerchuk)', focus: 'Platform-native content, volume, native behaviour over broadcast' },
      { name: 'Funnel Thinking (Russell Brunson)', focus: 'Audience movement, nurture sequencing, trust ladder' },
      { name: 'Positioning & Hooks (Alex Hormozi)', focus: 'Offer hooks, strong positioning, value communication that stops the scroll' },
      { name: 'Social Proof Logic', focus: 'Create familiarity and trust — not empty posting' },
    ],
    operatingPrinciples: [
      'Reach without relevance is noise',
      'Social supports the funnel — it is rarely the close',
      'Retargeting is the bridge between awareness and decision',
      'Trust-building content outperforms promotional content 3-to-1',
    ],
    inputSignals: ['growth plays', 'client phase', 'SEO content plan', 'review velocity', 'awareness objectives'],
    outputTypes: ['content themes', 'retargeting content angles', 'trust-building content plan', 'social support for strategy phases'],
    successMetrics: ['engagement quality', 'traffic assists', 'retargeting performance', 'trust signal improvement'],
  },
  review: {
    id: 'review', tier: 'execution',
    roleDescription: 'Review acquisition, response management, trust building, review-based conversion support.',
    expertFrameworks: [
      { name: 'Influence & Social Proof (Robert Cialdini)', focus: 'Social proof as a buying trigger — volume, recency, and specificity' },
      { name: 'Local Conversion Logic', focus: 'Review velocity and quality as direct buying confidence drivers' },
      { name: 'GBP Reputation Platform Logic', focus: 'Review cadence, recency signals, response consistency as ranking factor' },
    ],
    operatingPrinciples: [
      'A recent 4-star beats an old 5-star — recency is the signal',
      'Every unanswered review is a missed trust moment',
      'Review acquisition is a process, not a campaign',
      'Response quality reflects the brand — every reply is public',
    ],
    inputSignals: ['GBP engine review scores', 'review count', 'response rate', 'review recency', 'GBP auth status'],
    outputTypes: ['review acquisition workflows', 'response suggestions', 'trust signal recommendations', 'reputation blocker flags'],
    successMetrics: ['review count growth', 'review recency', 'response consistency', 'trust score improvement'],
  },
  growth: {
    id: 'growth', tier: 'leadership',
    roleDescription: 'Retention, expansion, upsells, identifying growth plays, spotting churn risk.',
    expertFrameworks: [
      { name: 'Measurement Discipline (Peter Drucker)', focus: 'Account health measurement, objective tracking, performance accountability' },
      { name: 'Strategic Positioning (Michael Porter)', focus: 'Expansion into adjacent services, market extension logic' },
      { name: 'Revenue Growth (Alex Hormozi)', focus: 'Value expansion, upsell logic, business economics of retention' },
      { name: 'Customer Success Thinking', focus: 'Account health signals, expansion opportunities, service/channel fit' },
    ],
    operatingPrinciples: [
      'Retention is cheaper than acquisition — protect health before pursuing expansion',
      'Churn signals appear weeks before the cancellation — spot them early',
      'Every upsell must serve the client\'s outcome, not just revenue',
      'Strong momentum clients are the best expansion targets',
    ],
    inputSignals: ['health status', 'learning insight', 'applied plays', 'engine scores', 'automation mode', 'action history'],
    outputTypes: ['retention signals', 'expansion opportunities', 'growth play recommendations', 'churn risk alerts', 'account intelligence summaries'],
    successMetrics: ['retention rate', 'upsell rate', 'expansion play adoption', 'account health improvement'],
  },
  strategist: {
    id: 'strategist', tier: 'leadership',
    roleDescription: 'Senior coordinator — owns client outcomes by sequencing engines, plays, and actions across all specialists.',
    expertFrameworks: [
      { name: 'Systems Thinking', focus: 'How parts interact — sequencing decisions that prevent specialist conflicts' },
      { name: 'Prioritization Logic (Drucker + Munger)', focus: 'What to focus on first — leverage points and constraint resolution' },
      { name: 'Commercial Intelligence (Hormozi)', focus: 'Connecting execution to commercial outcomes for the client' },
    ],
    operatingPrinciples: [
      'Coordinate before executing — misaligned specialists waste resources',
      'One strategic direction at a time — avoid plan fragmentation',
      'The Strategist escalates to the manager, not the other way around',
      'Stalled momentum is always an input problem or sequencing problem',
    ],
    inputSignals: ['all engine outputs', 'learning insights', 'momentum status', 'applied plays', 'specialist statuses'],
    outputTypes: ['strategic direction', 'play sequencing decisions', 'specialist coordination', 'escalation flags', 'momentum assessments'],
    successMetrics: ['client momentum status', 'coordination quality', 'execution readiness', 'stalled client resolution rate'],
  },
  ops: {
    id: 'ops', tier: 'control',
    roleDescription: 'Orchestration, job control, sequencing, automation rules, scheduling and execution control.',
    expertFrameworks: [
      { name: 'Theory of Constraints (Goldratt)', focus: 'Identify and remove bottlenecks — the weakest link limits the system' },
      { name: 'Lean Operations (Taiichi Ohno)', focus: 'Reduce waste, improve flow, eliminate non-value steps' },
      { name: 'Execution Discipline (Andrew Grove)', focus: 'Operational rigor, output-focused management, accountability' },
      { name: 'Orchestration Logic', focus: 'Queueing, retries, approvals, work-hour enforcement, guardrails' },
    ],
    operatingPrinciples: [
      'The bottleneck controls the throughput — fix it before expanding capacity',
      'Automation without guardrails creates new failure modes',
      'Every queued job must have an owner and a completion state',
      'Compliance with work-hour rules is not optional',
    ],
    inputSignals: ['automation rules', 'job queue', 'approval queue', 'blocked clients', 'work hours config'],
    outputTypes: ['workload routing', 'blocker detection', 'sequencing rules', 'active/queued/blocked summaries', 'guardrail enforcement'],
    successMetrics: ['jobs completed rate', 'failure rate reduction', 'approval compliance', 'work-hour adherence'],
  },
  commercial: {
    id: 'commercial', tier: 'leadership',
    roleDescription: 'Commercial reasoning, budget prioritization, ROI framing, investment logic, affordability alignment.',
    expertFrameworks: [
      { name: 'Capital Allocation (Warren Buffett)', focus: 'Where does each dollar produce the most return — think in returns, not costs' },
      { name: 'Decision Under Uncertainty (Charlie Munger)', focus: 'Inversion, margin of safety, avoiding the bad bet masquerading as opportunity' },
      { name: 'Pricing & Value (Alex Hormozi)', focus: 'Value equation, dream outcome vs price perception, offer economics' },
      { name: 'Commercial Planning Logic', focus: 'Tie spend to expected return and opportunity size — evidence-based budgets' },
    ],
    operatingPrinciples: [
      'Every budget recommendation must be anchored to expected return',
      'The cost of inaction is a real number — calculate it',
      'Price is only too high when value is unclear',
      'Affordability and willingness-to-pay are different problems',
    ],
    inputSignals: ['ads readiness', 'revenue potential', 'client tier', 'investment tiers from prescription', 'onboarding commercial context'],
    outputTypes: ['affordability mode recommendations', 'budget prioritization', 'ROI framing', 'investment vs opportunity analysis', 'cost of inaction logic'],
    successMetrics: ['commercial recommendation quality', 'allocation soundness', 'trust in strategy economics', 'budget-to-outcome accuracy'],
  },
  fullstack: {
    id: 'fullstack', tier: 'development',
    roleDescription: 'I lead end-to-end feature delivery for Momentum. Before any code is written I own the implementation brief — problem, outcome, owner, systems affected, risks, success criteria. I design the Firebase layer first, build the smallest safe vertical slice to prove the architecture, and don\'t mark anything done until the outcome matches the original brief.',
    expertFrameworks: [
      { name: 'Implementation Brief First', focus: 'Every change starts with: problem, outcome, owner, user flow, data affected, systems affected, risks, success criteria — no code before clarity' },
      { name: 'Smallest Safe Vertical Slice', focus: 'Ship minimum end-to-end slice first (UI input → Firestore write → validation → output → logging → QA pass), then expand' },
      { name: 'Clean Architecture', focus: 'Business logic stays independent of Replit or Firebase specifics — portable, testable, replaceable' },
      { name: 'Pragmatic Programmer (Hunt & Thomas)', focus: 'Ruthless pragmatism — ship working software, avoid perfectionism, prove the architecture early' },
    ],
    operatingPrinciples: [
      'Write the implementation brief before opening a file — "build first, clarify later" is how regressions happen',
      'Design the Firebase layer (collections, permissions, tenant model, triggers) before building any screen',
      'Build in feature branches or isolated Repls — not directly against live environments',
      'Smallest working end-to-end slice proves architecture and gives QA an early signal',
      'After shipping, verify the outcome matches the original success criteria — not just that it deployed',
    ],
    inputSignals: ['feature briefs', 'Firebase schema decisions', 'API contracts', 'QA sign-off', 'deployment environment config'],
    outputTypes: ['feature implementations', 'Firestore data models', 'API endpoints', 'integration layers', 'architecture decisions'],
    successMetrics: ['features shipped per brief', 'defect escape rate', 'integration reliability', 'build → QA → deploy cycle time', 'success criteria met rate'],
  },
  frontend: {
    id: 'frontend', tier: 'development',
    roleDescription: 'I own everything the user sees and touches — pages, forms, dashboards, interaction states, and display logic. My boundary stops at the screen. Permissions, tenant separation, billing, and routing logic are not mine to enforce — those live in Firebase. I sign off on UI quality and flow before any release, and I don\'t ship a component without empty, loading, error, and success states.',
    expertFrameworks: [
      { name: 'Responsibility Boundary Rule', focus: 'Frontend owns display logic and client-side validation only — permissions, billing, routing, and tenant logic must be enforced server-side in Firebase, not just in UI code' },
      { name: 'Atomic Design (Brad Frost)', focus: 'Components built from atoms to organisms — consistent, reusable, scalable across Momentum surfaces' },
      { name: 'Graceful Degradation', focus: 'Every component must handle empty, loading, error, and partial data states — Firebase reads can fail or be slow' },
      { name: 'Performance Budget Thinking', focus: 'Every KB has a cost — Replit + Firebase latency compounds; keep the UI fast and non-blocking' },
    ],
    operatingPrinciples: [
      'Do not enforce permissions, billing, tenant separation, or lead routing in frontend code — these must live in Firebase rules or Cloud Functions',
      'Missing design states (empty, loading, error, success) are not optional — define them before implementation',
      'Mobile layout is not an afterthought — test responsive behaviour before QA sign-off',
      'Frontend code is not the system of record — Firestore is; never treat local state as the source of truth',
    ],
    inputSignals: ['feature briefs', 'Firebase data shape', 'user flow specs', 'component requirements', 'responsive breakpoints'],
    outputTypes: ['pages', 'forms', 'dashboards', 'UI components', 'client-side validation logic', 'interaction states'],
    successMetrics: ['UI task completion rate', 'mobile QA pass rate', 'empty/error state coverage', 'no sensitive logic in frontend', 'visual regression rate'],
  },
  backend: {
    id: 'backend', tier: 'development',
    roleDescription: 'I own the Firebase layer — data model, auth, security rules, Cloud Functions, and backend reliability. No screen gets built before I\'ve defined where the data lives, who can read it, who can write it, how tenant isolation is enforced, and what happens when a write fails. I sign off on the Firestore structure and permission boundaries before implementation begins. Critical business logic lives in Firebase rules or Cloud Functions — not in frontend code.',
    expertFrameworks: [
      { name: 'Firebase-First Data Design', focus: 'Define collections, documents, tenant/client separation, auth roles, read/write permissions, required indexes, event triggers, and audit trail before any screen is built' },
      { name: 'Tenant Isolation as Non-Negotiable', focus: 'Tenant IDs on all relevant records, security rules reviewed before release — no client should ever see another client\'s data' },
      { name: 'Zero-Trust Security', focus: 'Every input is untrusted, every service boundary is a risk point — validate in Cloud Functions, not just client code' },
      { name: 'Twelve-Factor App', focus: 'Secrets and config in environment variables only — never in code; Firebase config matched to correct project at all times' },
    ],
    operatingPrinciples: [
      'Design Firebase data structure before any screen is built — UI-first leads to data model rewrites',
      'Answer before every build: where does this data live? Who can read it? Who can write it? How is tenant isolation enforced? What happens if a write fails?',
      'Security rules must be reviewed and tested before every release — not assumed',
      'Critical business logic (permissions, billing, routing, calculations) lives in Firebase rules or Cloud Functions — never only in frontend code',
      'Log failures, handle retries/idempotency — silent backend failures destroy trust',
    ],
    inputSignals: ['feature briefs', 'tenant isolation requirements', 'auth role definitions', 'integration credentials', 'security rule scope'],
    outputTypes: ['Firestore schema definitions', 'Firebase security rules', 'Cloud Function logic', 'auth flows', 'audit/event logs', 'backend integration adapters'],
    successMetrics: ['tenant isolation verified', 'security rules reviewed pre-release', 'write failure handling coverage', 'no sensitive logic in frontend', 'auth error rate'],
  },
  crm: {
    id: 'crm', tier: 'development',
    roleDescription: 'I own the automation layer — if a feature touches lead routing, messaging, calendars, or event-driven workflows, it comes through me. I map the process before I automate it, build idempotent Firestore-triggered pipelines, and make sure no automation fires in the wrong environment. Every workflow I build has a manual override path. I don\'t go live with any SMS or notification flow until opt-in compliance and Twilio credentials are confirmed.',
    expertFrameworks: [
      { name: 'Process Mapping Before Automation', focus: 'Understand and document the workflow before automating it — automating a broken process makes it faster to fail' },
      { name: 'Idempotent Automation Design', focus: 'Every automated step must be safe to retry — duplicate triggers, race conditions, and partial failures are common in event-driven systems' },
      { name: 'Firestore Event Trigger Safety', focus: 'Triggers must not fire in the wrong environment — test automation behaviour against staging Firebase only before production release' },
      { name: 'Twilio Compliance Discipline', focus: 'Opt-in confirmation, phone number management, rate limits, and fallback handling must be in place before any SMS workflow goes live' },
    ],
    operatingPrinciples: [
      'Missing workflow rules are a hard blocker — do not automate an undefined or unvalidated process',
      'Lead routing, messaging, and assignment logic belongs in Firebase Cloud Functions or triggers — not frontend state',
      'Calendar and booking integrations fail on timezone edge cases — test across AEST/AEDT and confirm daylight saving behaviour',
      'Every automation must have a manual override path — full autopilot with no escape is a liability',
      'Automation firing in the wrong Firebase environment is a production incident — environment separation is non-negotiable',
    ],
    inputSignals: ['workflow briefs', 'lead routing rules', 'Twilio credentials', 'Firestore trigger scope', 'calendar/booking config', 'client process maps'],
    outputTypes: ['CRM workflow builds', 'Firestore-triggered automations', 'SMS/Twilio pipelines', 'booking integrations', 'event routing logic', 'automation audit logs'],
    successMetrics: ['workflow completion rate', 'trigger reliability', 'SMS delivery + compliance rate', 'automation error rate', 'manual override usage', 'no cross-environment firing'],
  },
  qa: {
    id: 'qa', tier: 'development',
    roleDescription: 'Nothing ships without my sign-off. I validate the full journey — happy path, regressions, edge cases, Firebase permission boundaries, and multi-tenant data isolation. On every release I specifically check: does any client see another client\'s data? Are notifications duplicated or missing? Are logs written? Do Firebase security rules hold? A bug found in QA is a win. A bug found in production means the process failed.',
    expertFrameworks: [
      { name: 'Journey + Permission + Regression — in that order', focus: 'Core happy path first, then permission/multi-tenant safety, then regressions, then edge cases — prioritise the failure modes that matter most' },
      { name: 'Firebase-Specific QA Focus', focus: 'For every release: validate Firebase security rules, write/read permissions, multi-tenant data isolation, and triggered workflow reliability — these are where production incidents happen' },
      { name: 'Shift Left Testing', focus: 'QA thinking starts at the brief stage — acceptance criteria must exist before implementation, not after it' },
      { name: 'Exploratory Edge Case Coverage', focus: 'Missing data, duplicate submits, auth expiry, wrong permissions, slow network/retries, partial failure states — structured but human-driven discovery' },
    ],
    operatingPrinciples: [
      'Missing acceptance criteria is a hard blocker — you cannot QA what is undefined',
      'For every Momentum feature, specifically validate: does any client see another client\'s data? Are notifications duplicated or missing? Does routing go to the right place? Are logs written?',
      'Regression checks cover existing flows — not just the new feature',
      'A bug found in QA is a success; a bug found in production is a process failure — flag before release, not after',
      'QA must validate Firebase rules and permission boundaries, not just the UI — security testing is part of the sign-off checklist',
    ],
    inputSignals: ['acceptance criteria', 'feature briefs', 'Firebase rule changes', 'regression scope', 'Firestore write paths affected', 'tenant isolation assumptions'],
    outputTypes: ['QA sign-offs', 'test plans', 'bug reports', 'regression results', 'permission boundary validation', 'journey validation reports'],
    successMetrics: ['bug escape rate to production', 'multi-tenant safety validated per release', 'regression coverage', 'QA sign-off cycle time', 'critical defect count'],
  },
  devops: {
    id: 'devops', tier: 'development',
    roleDescription: 'I own the boundary between Replit and production. Before any deploy I verify environment variables, confirm Firebase config points to the correct project, and make sure a rollback path exists. Replit is the build surface — production Firebase is the live system — and I treat those as completely separate concerns. I don\'t mark a release complete until monitoring is live and a smoke test has passed.',
    expertFrameworks: [
      { name: 'Firebase Environment Discipline', focus: 'Staging and production Firebase projects must be completely separate — staging keys in Replit dev, production keys only in deployed environment secrets. Mismatched config is the most common production incident.' },
      { name: 'Release with Rollback Thinking', focus: 'Every release includes: preflight check → deployment → smoke test → post-release verification. Rollback path must exist before deploying.' },
      { name: 'Environment Variable Sovereignty', focus: 'Secrets and config live only in environment variables — never in code. Replit Secrets for dev; Deployment-level secrets for production. No test config can leak into prod.' },
      { name: 'Site Reliability Engineering (Google)', focus: 'Monitoring and logging must be visible after every release — deploying blind into production is unacceptable' },
    ],
    operatingPrinciples: [
      'Firebase config must be matched to the correct project before any deployment — wrong project means production data exposed or corrupted',
      'Every release requires: environment variables verified, Firebase project confirmed, rollback path documented, smoke test run post-deploy',
      'Automations and triggers must be confirmed to fire in the correct environment only — cross-environment automation is a production incident',
      'Monitoring and logging must be live before the release is marked complete — no blind production deployments',
      'Replit is the build surface; production Firebase is the live system — these are not interchangeable, and discipline on this boundary is the job',
    ],
    inputSignals: ['environment variable inventory', 'Firebase project config', 'deployment targets', 'release checklist', 'rollback plan', 'post-deploy monitoring setup'],
    outputTypes: ['deployment checklists', 'environment configs', 'Firebase project separation setup', 'smoke test results', 'post-release verification reports', 'incident rollback records'],
    successMetrics: ['zero wrong-environment deployments', 'rollback capability on every release', 'smoke test pass rate', 'config leak incidents (target: 0)', 'mean time to recovery', 'monitoring live rate post-deploy'],
  },
  performance: {
    id: 'performance', tier: 'leadership',
    roleDescription: 'Analyze what worked, compare predictions vs outcomes, detect patterns, feed learning back into the system.',
    expertFrameworks: [
      { name: 'Measurement Discipline (Peter Drucker)', focus: 'Evidence over opinion — track what matters, ignore what doesn\'t' },
      { name: 'Cognitive Bias Awareness (Daniel Kahneman)', focus: 'Identify and correct bad assumptions — overconfidence, recency, anchoring' },
      { name: 'Comparative Reasoning (Charlie Munger)', focus: 'Learn from outcomes across clients — what patterns repeat?' },
      { name: 'Experimentation Logic', focus: 'Build, measure, learn — iteration as a discipline, not a reaction' },
    ],
    operatingPrinciples: [
      'Repeated mistakes are system failures, not people failures',
      'Prediction accuracy improves through honest review of what was wrong',
      'Patterns only become visible when outcomes are tracked rigorously',
      'Evidence updates confidence — opinion does not',
    ],
    inputSignals: ['engine scores over time', 'action approval/rejection rates', 'momentum status history', 'learning insights', 'active plays outcomes'],
    outputTypes: ['weekly learnings summary', 'what improved / what failed', 'confidence updates', 'pattern flags', 'playbook update recommendations'],
    successMetrics: ['quality of learnings', 'improvement in prediction accuracy', 'reduction in repeated mistakes', 'stronger future recommendations'],
  },
};

const STATUS_CONFIG: Record<BullpenStatus, { label: string; color: string; dot: string }> = {
  active:            { label: 'Active',            color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400', dot: 'bg-emerald-500' },
  idle:              { label: 'Idle',              color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',            dot: 'bg-slate-400' },
  blocked:           { label: 'Blocked',           color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',                dot: 'bg-red-500' },
  needs_attention:   { label: 'Needs Attention',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',        dot: 'bg-amber-500' },
  awaiting_approval: { label: 'Awaiting Approval', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',    dot: 'bg-violet-500' },
};

function StatusBadge({ status }: { status: BullpenStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Briefcase; color: string }) {
  return (
    <Card className="border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
          <div className={`p-2 rounded-lg bg-muted/50`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Role Card ────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  leadership:  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
  execution:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  development: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
  control:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function RoleCard({ role, onViewIntel }: { role: RoleMetrics; onViewIntel: () => void }) {
  const Icon = role.icon;

  return (
    <Card className="border bg-card hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted/50 shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">{role.name}</p>
                {role.tier && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${TIER_BADGE[role.tier] || TIER_BADGE.execution}`}>
                    {role.tier}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{role.detail}</p>
            </div>
          </div>
          <StatusBadge status={role.status} />
        </div>

        <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Active</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{role.currentCount}</p>
            <p className="text-[10px] text-muted-foreground">{role.currentLabel}</p>
          </div>
          {role.blockerCount > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Blockers</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{role.blockerCount}</p>
              <p className="text-[10px] text-muted-foreground truncate">{role.blockerSummary}</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Last Action</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{role.lastActionLabel || 'No recent activity'}</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          {role.linkedPath && (
            <Link href={role.linkedPath} className="flex-1">
              <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1">
                <ExternalLink className="h-3 w-3" /> View Records
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2 text-muted-foreground" onClick={onViewIntel}>
            <BookOpen className="h-3 w-3" /> Intel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Role Intel Drawer ────────────────────────────────────────────────────────

function RoleIntelDrawer({ role, config, open, onClose }: {
  role: RoleMetrics | null;
  config: RoleConfig | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!role || !config) return null;
  const Icon = role.icon;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[540px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-muted/60">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <SheetTitle className="text-base">{role.name}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{config.roleDescription}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Expert Frameworks */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <BookOpen className="h-3 w-3" /> Expert Frameworks
            </h3>
            <div className="space-y-2">
              {config.expertFrameworks.map((f, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-semibold">{f.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.focus}</p>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Operating Principles */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <Target className="h-3 w-3" /> Operating Principles
            </h3>
            <ul className="space-y-2">
              {config.operatingPrinciples.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {/* Output Types */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <Layers className="h-3 w-3" /> What This Role Produces
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {config.outputTypes.map((o, i) => (
                <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-muted border text-muted-foreground">{o}</span>
              ))}
            </div>
          </div>

          <Separator />

          {/* Input Signals */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <ActivityIcon className="h-3 w-3" /> Input Signals
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {config.inputSignals.map((s, i) => (
                <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">{s}</span>
              ))}
            </div>
          </div>

          <Separator />

          {/* Success Metrics */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-3 w-3" /> Success Metrics
            </h3>
            <ul className="space-y-1.5">
              {config.successMetrics.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-foreground/80">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  {m}
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {/* Current Status */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <ActivityIcon className="h-3 w-3" /> Current Status
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border bg-muted/30 text-center">
                <p className="text-2xl font-bold">{role.currentCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{role.currentLabel}</p>
              </div>
              <div className={`p-3 rounded-lg border text-center ${role.blockerCount > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-muted/30'}`}>
                <p className={`text-2xl font-bold ${role.blockerCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{role.blockerCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{role.blockerCount > 0 ? role.blockerSummary || 'blockers' : 'no blockers'}</p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Attention Item ───────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  high:   { color: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20',    icon: 'text-red-500',   badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  medium: { color: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  low:    { color: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20',  icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
};

function AttentionCard({ item }: { item: AttentionItem }) {
  const cfg = SEVERITY_CONFIG[item.severity];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.color}`}>
      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.icon}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{item.title}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.badge}`}>{item.severity.toUpperCase()}</span>
          <span className="text-[10px] text-muted-foreground">{item.role}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
      </div>
      {item.linkedPath && (
        <Link href={item.linkedPath}>
          <Button variant="ghost" size="sm" className="shrink-0 h-7 w-7 p-0">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function TypingIndicator({ from, fromBg, fromIcon: Icon }: { from: string; fromBg: string; fromIcon: typeof Briefcase }) {
  return (
    <div className="flex items-start gap-3 pt-4 pb-0.5 animate-fade-in">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${fromBg}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[13px] font-bold text-foreground">{from}</span>
          <span className="text-[11px] text-muted-foreground">typing…</span>
        </div>
        <div className="flex items-center gap-1 h-5">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms',   animationDuration: '0.8s' }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '160ms', animationDuration: '0.8s' }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '320ms', animationDuration: '0.8s' }} />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, grouped }: { msg: AgentCommsMessage; grouped: boolean }) {
  const Icon = msg.fromIcon;
  const timeStr = msg.minutesAgo === 0
    ? 'just now'
    : msg.minutesAgo < 60
    ? `${msg.minutesAgo}m ago`
    : `${Math.floor(msg.minutesAgo / 60)}h ago`;

  if (grouped) {
    return (
      <div className="flex items-start gap-3 py-0.5 pl-0 group animate-message-in">
        <div className="w-8 shrink-0 flex justify-center pt-1">
          <span className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors tabular-nums leading-none">
            {timeStr.replace('m ago', '').replace('h ago', 'h')}
          </span>
        </div>
        <p className="text-[13px] text-foreground/85 leading-relaxed flex-1">{msg.message}</p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 pt-4 pb-0.5 group animate-message-in">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${msg.fromBg}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[13px] font-bold text-foreground">{msg.from}</span>
          <span className="text-[11px] text-muted-foreground">{timeStr}</span>
        </div>
        <p className="text-[13px] text-foreground/85 leading-relaxed">{msg.message}</p>
      </div>
    </div>
  );
}

// ─── Secretary Card ───────────────────────────────────────────────────────────

const PRIORITY_STYLE = {
  urgent: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',   label: 'Urgent',  border: 'border-l-red-500' },
  high:   { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', label: 'High', border: 'border-l-amber-500' },
  medium: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',  label: 'Medium', border: 'border-l-blue-400' },
};

function SecretaryRecommendation({ item }: { item: SecretaryItem }) {
  const Icon = item.icon;
  const ps = PRIORITY_STYLE[item.priority];
  return (
    <div className={`flex items-start gap-4 p-4 border-b border-border/40 last:border-0 border-l-2 ${ps.border}`}>
      <div className="p-2 rounded-lg bg-muted/60 shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className="text-sm font-semibold">{item.title}</p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${ps.badge}`}>{ps.label}</span>
        </div>
        <p className="text-xs text-muted-foreground">{item.reason}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Raised by {item.flaggedBy}</p>
      </div>
      <Link href={item.path}>
        <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1.5 mt-0.5">
          {item.actionLabel} <ChevronRight className="h-3 w-3" />
        </Button>
      </Link>
    </div>
  );
}

// ─── Rule Toggle Row ──────────────────────────────────────────────────────────

function RuleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BullpenPage() {
  const { isManager, orgId, authReady } = useAuth();
  const { toast } = useToast();

  const leads     = useSelector((s: RootState) => s.app.leads);
  const activities = useSelector((s: RootState) => s.app.activities);
  const clients   = useSelector((s: RootState) => s.app.clients);
  const nbaQueue  = useSelector((s: RootState) => s.app.nbaQueue);

  const [rules, setRules] = useState<AutomationRules>(DEFAULT_RULES);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [rulesConfigStatus, setRulesConfigStatus] = useState<'valid' | 'invalid' | 'missing' | null>(null);
  const [rulesValidationErrors, setRulesValidationErrors] = useState<string[]>([]);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [intelRole, setIntelRole] = useState<RoleMetrics | null>(null);

  // ── Live-feed state ───────────────────────────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingAgent, setTypingAgent] = useState<{ from: string; fromBg: string; fromIcon: typeof Briefcase } | null>(null);
  const commsRef = useRef<HTMLDivElement>(null);

  // ── Load automation rules — validated read via API ────────────────────────
  useEffect(() => {
    if (!isManager || !orgId || !authReady) return;
    apiRequest('GET', `/api/settings/automation-rules?orgId=${orgId}`)
      .then(r => r.json() as Promise<AutomationRulesReadResult>)
      .then(result => {
        setRulesConfigStatus(result.status);
        setRules(result.data);
        if (result.validationErrors?.length) {
          setRulesValidationErrors(result.validationErrors);
          console.warn('[Bullpen] automationRules stored doc is invalid:', result.validationErrors);
        }
        setRulesLoaded(true);
      })
      .catch(() => {
        // Network/auth failure — fall back to defaults safely
        setRules(DEFAULT_RULES);
        setRulesLoaded(true);
      });
  }, [orgId, authReady]);

  async function saveRules() {
    if (!orgId) return;
    setRulesSaving(true);
    try {
      const r = await apiRequest('POST', '/api/settings/automation-rules', { orgId, rules });
      const body = await r.json();
      setRulesConfigStatus('valid');
      setRulesValidationErrors([]);
      if (body.strippedKeys?.length > 0) {
        toast({ title: 'Automation rules saved', description: `Note: ${body.strippedKeys.join(', ')} removed (unknown fields)` });
      } else {
        toast({ title: 'Automation rules saved' });
      }
    } catch (err: any) {
      toast({ title: 'Failed to save rules', description: err.message, variant: 'destructive' });
    } finally {
      setRulesSaving(false);
    }
  }

  function patchRule<K extends keyof AutomationRules>(key: K, value: AutomationRules[K]) {
    setRules(r => ({ ...r, [key]: value }));
  }

  // ── Derived metrics ───────────────────────────────────────────────────────

  const now = new Date();
  const activeClients  = useMemo(() => clients.filter(c => !c.archived), [clients]);
  const activeLeads    = useMemo(() => leads.filter(l => !l.archived && l.stage !== 'lost' && l.stage !== 'won'), [leads]);
  const todayActivities = useMemo(() => activities.filter(a => isToday(new Date(a.createdAt))), [activities]);

  const openNBA       = useMemo(() => nbaQueue.filter(a => a.status === 'open'), [nbaQueue]);
  const overdueLeads  = useMemo(() => activeLeads.filter(l => l.nextContactDate && new Date(l.nextContactDate) < now), [activeLeads]);
  const autonomousClients = useMemo(() => activeClients.filter(c => c.automationMode === 'autonomous'), [activeClients]);
  const aiActiveClients   = useMemo(() => activeClients.filter(c => c.automationMode && c.automationMode !== 'assisted'), [activeClients]);
  const redAmberClients   = useMemo(() => activeClients.filter(c => c.healthStatus === 'red' || c.healthStatus === 'amber'), [activeClients]);
  const blockedClients    = useMemo(() => activeClients.filter(c => c.executionStatus?.overall === 'blocked' || c.executionStatus?.overall === 'needs_input'), [activeClients]);

  const clientsWithSEO     = useMemo(() => activeClients.filter(c => c.seoEngine), [activeClients]);
  const clientsWithWebsite = useMemo(() => activeClients.filter(c => c.websiteEngine), [activeClients]);
  const clientsWithGBP     = useMemo(() => activeClients.filter(c => c.gbpEngine), [activeClients]);
  const clientsWithAds     = useMemo(() => activeClients.filter(c => c.adsEngine), [activeClients]);
  const clientsWithGBPAuth = useMemo(() => activeClients.filter(c => c.gbpLocationName), [activeClients]);
  const clientsWithPrescription = useMemo(() => activeLeads.filter(l => (l as any).growthPrescription), [activeLeads]);

  const mostRecentActivity = useMemo(() => {
    if (!activities.length) return null;
    return [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [activities]);

  // Summary counts
  const summaryActiveWorkloads  = aiActiveClients.length + openNBA.length;
  const summaryQueued           = openNBA.length;
  const summaryAwaitingApproval = activeClients.filter(c => c.automationMode === 'supervised').length;
  const summaryBlocked          = blockedClients.length + overdueLeads.length;
  const summaryCompletedToday   = todayActivities.length;
  const summaryClientsAffected  = aiActiveClients.length;

  // ── Needs Attention items ─────────────────────────────────────────────────

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    if (overdueLeads.length > 0) {
      items.push({
        id: 'overdue-leads',
        title: `${overdueLeads.length} lead${overdueLeads.length > 1 ? 's' : ''} with overdue follow-up`,
        description: `Scheduled contact dates have passed. Sales momentum is stalling.`,
        role: 'Sales Specialist',
        severity: overdueLeads.length > 5 ? 'high' : 'medium',
        linkedPath: '/pipeline',
        linkedLabel: 'View Pipeline',
      });
    }

    if (redAmberClients.length > 0) {
      const redCount = redAmberClients.filter(c => c.healthStatus === 'red').length;
      items.push({
        id: 'at-risk-clients',
        title: `${redAmberClients.length} client${redAmberClients.length > 1 ? 's' : ''} at risk`,
        description: `${redCount} critical, ${redAmberClients.length - redCount} amber. Client health requires attention.`,
        role: 'Client Growth Specialist',
        severity: redCount > 0 ? 'high' : 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    if (blockedClients.length > 0) {
      items.push({
        id: 'blocked-clients',
        title: `${blockedClients.length} client${blockedClients.length > 1 ? 's' : ''} with blocked execution`,
        description: 'AI growth engine stalled — missing inputs or awaiting resolution.',
        role: 'Operations Specialist',
        severity: 'high',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const clientsMissingOnboarding = activeClients.filter(c => !c.clientOnboarding?.businessContext);
    if (clientsMissingOnboarding.length > 0) {
      items.push({
        id: 'missing-onboarding',
        title: `${clientsMissingOnboarding.length} client${clientsMissingOnboarding.length > 1 ? 's' : ''} missing onboarding context`,
        description: 'SEO, Website and Ads engines require completed onboarding to generate intelligence.',
        role: 'Strategy Specialist',
        severity: 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const stuckLeads = activeLeads.filter(l => {
      const last = l.lastActivityAt ? new Date(l.lastActivityAt) : new Date(l.createdAt);
      return differenceInDays(now, last) > 14;
    });
    if (stuckLeads.length > 0) {
      items.push({
        id: 'stuck-leads',
        title: `${stuckLeads.length} deal${stuckLeads.length > 1 ? 's' : ''} with no activity in 14+ days`,
        description: 'Prospects going cold. Nurture or action required.',
        role: 'Sales Specialist',
        severity: stuckLeads.length > 10 ? 'high' : 'medium',
        linkedPath: '/pipeline',
        linkedLabel: 'View Pipeline',
      });
    }

    const clientsNoGBP = activeClients.filter(c => !c.gbpLocationName && c.website);
    if (clientsNoGBP.length > 0) {
      items.push({
        id: 'no-gbp-auth',
        title: `${clientsNoGBP.length} client${clientsNoGBP.length > 1 ? 's' : ''} without GBP connected`,
        description: 'GBP OAuth not connected — review monitoring and rank tracking unavailable.',
        role: 'GBP Specialist',
        severity: 'low',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const clientsLowReviews = clientsWithGBP.filter(c => {
      const reviewScore = c.gbpEngine?.scores?.reviewStrength;
      return reviewScore !== undefined && reviewScore < 50;
    });
    if (clientsLowReviews.length > 0) {
      items.push({
        id: 'low-reviews',
        title: `${clientsLowReviews.length} client${clientsLowReviews.length > 1 ? 's' : ''} with weak review profile`,
        description: 'GBP review strength below 50% — reputation risk.',
        role: 'Review Specialist',
        severity: 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    if (autonomousClients.length > 0 && !rules.requireApprovalHighRisk) {
      items.push({
        id: 'autopilot-no-guard',
        title: `${autonomousClients.length} client${autonomousClients.length > 1 ? 's' : ''} on autopilot with reduced guardrails`,
        description: 'High-risk approval not required. Verify automation rules are intentional.',
        role: 'Operations Specialist',
        severity: 'medium',
      });
    }

    // ── Development & Systems technical blockers ──────────────────────────────
    const clientsMissingEnvConfig = activeClients.filter(c => !c.website && !c.gbpLocationName);
    if (clientsMissingEnvConfig.length > 2) {
      items.push({
        id: 'missing-env-config',
        title: `${clientsMissingEnvConfig.length} clients missing website and GBP data`,
        description: 'Backend integrations and environment configs cannot be validated without website URL and GBP connection.',
        role: 'Backend Developer',
        severity: 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const clientsMissingOnboardingQA = activeClients.filter(c => c.clientOnboarding?.businessContext && !c.websiteEngine && !c.seoEngine);
    if (clientsMissingOnboardingQA.length > 0) {
      items.push({
        id: 'unvalidated-engines',
        title: `${clientsMissingOnboardingQA.length} client${clientsMissingOnboardingQA.length > 1 ? 's' : ''} with onboarding complete but no engine reports`,
        description: 'Onboarding context exists but Website and SEO engines have not run. QA journey not yet validated.',
        role: 'QA / Tester',
        severity: 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const clientsNeedingCRM = activeClients.filter(c => c.healthStatus === 'green' && c.automationMode === 'supervised');
    if (clientsNeedingCRM.length > 3) {
      items.push({
        id: 'crm-workflow-candidates',
        title: `${clientsNeedingCRM.length} healthy clients eligible for CRM workflow automation`,
        description: 'Strong account health and supervised mode — CRM workflow builds should be scoped and prioritised.',
        role: 'CRM & Automation Engineer',
        severity: 'low',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    return items.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [overdueLeads, redAmberClients, blockedClients, activeClients, activeLeads, autonomousClients, clientsWithGBP, rules.requireApprovalHighRisk]);

  // ── Role cards ────────────────────────────────────────────────────────────

  const roles = useMemo<RoleMetrics[]>(() => {
    const salesActions = openNBA.filter(a => a.targetType === 'lead');
    const lastSalesActivity = [...activities]
      .filter(a => ['call', 'email', 'sms', 'meeting'].includes(a.type))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    const nurtureDue = activeLeads.filter(l => l.nextTouchAt && new Date(l.nextTouchAt) <= now);

    return [
      {
        id: 'sales',
        name: 'Sales Specialist',
        icon: BriefcaseBusiness,
        tier: 'execution',
        status: overdueLeads.length > 5 ? 'needs_attention' : salesActions.length > 0 ? 'active' : overdueLeads.length > 0 ? 'needs_attention' : 'idle',
        currentCount: salesActions.length,
        currentLabel: 'open outreach actions',
        blockerCount: overdueLeads.length,
        blockerSummary: overdueLeads.length ? `${overdueLeads.length} overdue follow-ups` : undefined,
        lastActionLabel: lastSalesActivity ? `${lastSalesActivity.type} — ${formatDistanceToNow(new Date(lastSalesActivity.createdAt), { addSuffix: true })}` : undefined,
        detail: 'Outreach, follow-up, stage progression, conversion',
        linkedPath: '/pipeline',
      },
      {
        id: 'seo', name: 'SEO Specialist', icon: Search, tier: 'execution',
        status: clientsWithSEO.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithSEO.length, currentLabel: 'clients with SEO plans',
        blockerCount: activeClients.filter(c => !c.seoEngine && !c.clientOnboarding?.seoInputs).length,
        blockerSummary: 'Missing service/location data',
        lastActionLabel: clientsWithSEO.length > 0 ? `${clientsWithSEO.length} SEO plans generated` : undefined,
        detail: 'Keyword targeting, intent coverage, content planning, visibility scoring',
        linkedPath: '/clients',
      },
      {
        id: 'website', name: 'Website Specialist', icon: Globe, tier: 'execution',
        status: clientsWithWebsite.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithWebsite.length, currentLabel: 'clients with website audits',
        blockerCount: clientsWithWebsite.filter(c => { const g = c.websiteEngine?.overallGrade; return g === 'F' || g === 'D'; }).length,
        blockerSummary: 'Low-grade sites needing rebuild',
        lastActionLabel: clientsWithWebsite.length > 0 ? `${clientsWithWebsite.length} website audits active` : undefined,
        detail: 'Conversion clarity, sitemap structure, build readiness',
        linkedPath: '/clients',
      },
      {
        id: 'ads', name: 'Google Ads Specialist', icon: BarChart3, tier: 'execution',
        status: clientsWithAds.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithAds.length, currentLabel: 'clients with ads plans',
        blockerCount: clientsWithAds.filter(c => (c.adsEngine?.readinessScore || 0) < 50).length,
        blockerSummary: 'Low readiness — needs SEO/GBP first',
        lastActionLabel: clientsWithAds.length > 0 ? `${clientsWithAds.length} campaigns assessed` : undefined,
        detail: 'Demand capture, campaign structure, budget ROI',
        linkedPath: '/clients',
      },
      {
        id: 'gbp', name: 'GBP Specialist', icon: Star, tier: 'execution',
        status: clientsWithGBP.length > 0 ? 'active' : clientsWithGBPAuth.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithGBP.length, currentLabel: 'clients with GBP reports',
        blockerCount: activeClients.filter(c => !c.gbpLocationName).length,
        blockerSummary: 'GBP OAuth not connected',
        lastActionLabel: clientsWithGBP.length > 0 ? `${clientsWithGBP.length} GBP profiles assessed` : undefined,
        detail: 'Profile optimisation, review strategy, local map visibility',
        linkedPath: '/clients',
      },
      {
        id: 'social', name: 'Social Media Specialist', icon: Share2, tier: 'execution',
        status: aiActiveClients.filter(c => c.appliedPlays?.some((p: string) => p.toLowerCase().includes('social') || p.toLowerCase().includes('content'))).length > 0 ? 'active' : 'idle',
        currentCount: aiActiveClients.length,
        currentLabel: 'active clients in scope',
        blockerCount: 0,
        lastActionLabel: 'Awareness, trust, retargeting support',
        detail: 'Awareness content, trust building, demand creation, retargeting',
        linkedPath: '/clients',
      },
      {
        id: 'review', name: 'Review & Reputation', icon: Shield, tier: 'execution',
        status: clientsWithGBPAuth.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithGBPAuth.length, currentLabel: 'clients with GBP connected',
        blockerCount: clientsWithGBP.filter(c => (c.gbpEngine?.scores?.reviewStrength || 0) < 50).length,
        blockerSummary: 'Weak review profiles',
        lastActionLabel: clientsWithGBPAuth.length > 0 ? `${clientsWithGBPAuth.length} profiles monitored` : undefined,
        detail: 'Review acquisition, response management, trust building',
        linkedPath: '/clients',
      },
      {
        id: 'growth', name: 'Client Growth Specialist', icon: TrendingUp, tier: 'leadership',
        status: aiActiveClients.length > 0 ? 'active' : redAmberClients.length > 0 ? 'needs_attention' : 'idle',
        currentCount: aiActiveClients.length, currentLabel: 'clients with AI growth active',
        blockerCount: redAmberClients.length,
        blockerSummary: `${redAmberClients.filter(c => c.healthStatus === 'red').length} critical, ${redAmberClients.filter(c => c.healthStatus === 'amber').length} amber`,
        lastActionLabel: aiActiveClients.length > 0 ? `${aiActiveClients.length} clients monitored` : undefined,
        detail: 'Retention, expansion, churn prevention, account intelligence',
        linkedPath: '/clients',
      },
      {
        id: 'strategy', name: 'Strategy Specialist', icon: Eye, tier: 'leadership',
        status: clientsWithPrescription.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithPrescription.length, currentLabel: 'growth prescriptions generated',
        blockerCount: activeLeads.filter(l => !l.strategyIntelligence?.businessOverview).length,
        blockerSummary: 'Missing discovery context',
        lastActionLabel: clientsWithPrescription.length > 0 ? `${clientsWithPrescription.length} strategies active` : undefined,
        detail: 'Diagnosis, growth prescription, roadmap, strategic prioritization',
        linkedPath: '/pipeline',
      },
      {
        id: 'strategist', name: 'Client Strategist', icon: Compass, tier: 'leadership',
        status: (() => {
          const stalled = activeClients.filter(c => c.learningInsight?.momentumStatus === 'stalled');
          if (stalled.length > 0) return 'needs_attention' as const;
          if (aiActiveClients.length > 0) return 'active' as const;
          return 'idle' as const;
        })(),
        currentCount: aiActiveClients.length, currentLabel: 'clients with active growth strategy',
        blockerCount: activeClients.filter(c => !c.appliedPlays || c.appliedPlays.length === 0).length,
        blockerSummary: 'No growth play activated',
        lastActionLabel: (() => {
          const stalled = activeClients.filter(c => c.learningInsight?.momentumStatus === 'stalled');
          if (stalled.length > 0) return `${stalled.length} client${stalled.length > 1 ? 's' : ''} stalled — needs direction`;
          const strong = activeClients.filter(c => c.learningInsight?.momentumStatus === 'strong');
          if (strong.length > 0) return `${strong.length} client${strong.length > 1 ? 's' : ''} with strong momentum`;
          return undefined;
        })(),
        detail: 'Senior coordinator — sequences engines, plays & actions across all specialists',
        linkedPath: '/clients',
      },
      {
        id: 'commercial', name: 'Commercial Intelligence', icon: Landmark, tier: 'leadership',
        status: clientsWithPrescription.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithPrescription.length, currentLabel: 'clients with investment tiers',
        blockerCount: activeClients.filter(c => !c.growthPrescription?.investmentTiers).length,
        blockerSummary: 'No investment tiers generated',
        lastActionLabel: clientsWithPrescription.length > 0 ? `${clientsWithPrescription.length} ROI models active` : 'No commercial models yet',
        detail: 'Budget logic, ROI framing, cost of inaction, investment allocation',
        linkedPath: '/clients',
      },
      {
        id: 'performance', name: 'Performance Analyst', icon: FlaskConical, tier: 'leadership',
        status: activeClients.filter(c => c.learningInsight?.overallAssessment).length > 0 ? 'active' : 'idle',
        currentCount: activeClients.filter(c => c.learningInsight?.overallAssessment).length,
        currentLabel: 'clients with learning data',
        blockerCount: activeClients.filter(c => !c.learningInsight).length,
        blockerSummary: 'No learning insights generated yet',
        lastActionLabel: 'Pattern detection, prediction accuracy, playbook updates',
        detail: 'What worked, what failed, pattern analysis, confidence updates',
        linkedPath: '/clients',
      },
      {
        id: 'ops', name: 'Operations Specialist', icon: Cpu, tier: 'control',
        status: autonomousClients.length > 0 ? 'active' : aiActiveClients.length > 0 ? 'active' : 'idle',
        currentCount: autonomousClients.length, currentLabel: 'clients on autopilot',
        blockerCount: 0,
        lastActionLabel: autonomousClients.length > 0 ? `${autonomousClients.length} on autonomous mode` : 'All clients in manual mode',
        detail: 'Orchestration, automation rules, job control, execution oversight',
        linkedPath: '/clients',
      },
      {
        id: 'fullstack', name: 'Full Stack Developer', icon: Code2, tier: 'development',
        status: 'idle',
        currentCount: 0, currentLabel: 'features / builds in progress',
        blockerCount: 0,
        lastActionLabel: 'Scaffold structure ready — connect live build data when available',
        detail: 'Architecture, implementation, scalable cross-stack delivery',
      },
      {
        id: 'frontend', name: 'Frontend Developer', icon: Layout, tier: 'development',
        status: 'idle',
        currentCount: 0, currentLabel: 'active UI tasks',
        blockerCount: 0,
        lastActionLabel: 'Scaffold structure ready — connect live task data when available',
        detail: 'UI, responsiveness, components, user flow quality',
      },
      {
        id: 'backend', name: 'Backend Developer', icon: Server, tier: 'development',
        status: 'idle',
        currentCount: 0, currentLabel: 'backend tasks in progress',
        blockerCount: 0,
        lastActionLabel: 'Scaffold structure ready — connect live task data when available',
        detail: 'APIs, database logic, integrations, auth, reliability',
      },
      {
        id: 'crm', name: 'CRM & Automation Engineer', icon: Workflow, tier: 'development',
        status: 'idle',
        currentCount: 0, currentLabel: 'CRM / workflow builds in progress',
        blockerCount: 0,
        lastActionLabel: 'Scaffold structure ready — connect live build data when available',
        detail: 'Custom CRM builds, widgets, Twilio, calendars, workflow automation',
      },
      {
        id: 'qa', name: 'QA / Tester', icon: TestTube2, tier: 'development',
        status: 'idle',
        currentCount: 0, currentLabel: 'features under test',
        blockerCount: 0,
        lastActionLabel: 'Scaffold structure ready — connect live test data when available',
        detail: 'End-to-end testing, bug validation, journey QA, regression checks',
      },
      {
        id: 'devops', name: 'DevOps / Systems Engineer', icon: Cloud, tier: 'development',
        status: 'idle',
        currentCount: 0, currentLabel: 'deploy / infrastructure tasks',
        blockerCount: 0,
        lastActionLabel: 'Scaffold structure ready — connect live infra data when available',
        detail: 'Deployment, environments, CI/CD, uptime, infrastructure',
      },
    ];
  }, [
    openNBA, activities, activeLeads, overdueLeads, activeClients,
    clientsWithSEO, clientsWithWebsite, clientsWithGBP, clientsWithGBPAuth,
    clientsWithAds, clientsWithPrescription, aiActiveClients, autonomousClients,
    redAmberClients
  ]);

  const activeRoles = roles.filter(r => r.status !== 'idle');
  const idleRoles   = roles.filter(r => r.status === 'idle');

  // ── Comms context (lightweight state summary for the AI endpoint) ─────────

  const commsContext = useMemo(() => ({
    activeClientCount: activeClients.length,
    blockedClientNames: blockedClients.map(c => c.businessName).slice(0, 5),
    overdueLeadCount: overdueLeads.length,
    noGBPClientNames: activeClients.filter(c => !c.gbpLocationName).map(c => c.businessName).slice(0, 4),
    noPlaysCount: activeClients.filter(c => !c.appliedPlays?.length).length,
    redHealthClientNames: activeClients.filter(c => c.healthStatus === 'red').map(c => c.businessName).slice(0, 4),
    autonomousClientCount: autonomousClients.length,
    supervisedClientCount: activeClients.filter(c => c.automationMode === 'supervised').length,
    activePipelineLeadCount: activeLeads.length,
    openNBACount: openNBA.length,
  }), [activeClients, blockedClients, overdueLeads, activeLeads, autonomousClients, openNBA]);

  // ── AI-generated comms (GPT via backend) ──────────────────────────────────

  const { data: aiCommsData, isLoading: aiCommsLoading } = useQuery<{ messages: Array<{ from: string; message: string; minutesAgo: number }> }>({
    queryKey: ['/api/bullpen/comms', orgId, commsContext.activeClientCount, commsContext.overdueLeadCount],
    queryFn: async () => {
      const res = await fetch('/api/bullpen/comms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, context: commsContext }),
      });
      if (!res.ok) throw new Error('AI comms unavailable');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled: !!orgId && isManager,
  });

  // ── Real-time OpenClaw messages from Firestore ────────────────────────────

  const [clawMessages, setClawMessages] = useState<AgentCommsMessage[]>([]);

  useEffect(() => {
    if (!orgId || !isManager) return;
    const rm = (key: string) => ROLE_META[key] ?? ROLE_META['Ops'];
    const q = query(
      collection(db, 'orgs', orgId, 'bullpenComms'),
      orderBy('createdAt', 'desc'),
      limit(30),
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs: AgentCommsMessage[] = snap.docs.map(d => {
        const data = d.data();
        const meta = rm(data.from);
        const createdAt = data.createdAt?.toDate?.() || new Date();
        const minutesAgo = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
        return {
          id: d.id,
          from: data.from,
          fromIcon: meta.icon,
          fromBg: meta.bg,
          message: data.message,
          minutesAgo,
        };
      }).reverse(); // oldest first
      setClawMessages(msgs);
    });
    return () => unsub();
  }, [orgId, isManager]);

  // ── Merged feed: AI background + live OpenClaw actions ───────────────────

  const agentFeed = useMemo<AgentCommsMessage[]>(() => {
    const rm = (key: string) => ROLE_META[key] ?? ROLE_META['Ops'];

    // While AI comms are loading, use the scripted fallback
    const msgs: AgentCommsMessage[] = [];
    let t = 118; // start ~2h ago, count down to 0 (now)

    const say = (id: string, from: string, message: string, gap = 3) => {
      t = Math.max(0, t - gap);
      msgs.push({ id, from, fromIcon: rm(from).icon, fromBg: rm(from).bg, message, minutesAgo: t });
    };

    // ── Morning status (Ops always opens)
    say('ops-open', 'Ops', `Morning check — ${activeClients.length} active clients, ${activeLeads.length} leads in pipeline. ${autonomousClients.length > 0 ? `${autonomousClients.length} on autopilot, running smoothly.` : 'All clients in supervised mode.'}`, 0);
    say('strat-ack', 'Strategist', 'Thanks Ops. Let\'s run through any flags before we start sequencing today.', 4);

    // ── Autopilot clients
    if (autonomousClients.length > 0) {
      say('ops-auto', 'Ops', `Autopilot clients are all executing as scheduled. No escalations overnight.`, 5);
      say('strat-auto', 'Strategist', 'Good. Keep monitoring — flag anything that deviates from the expected action sequence.', 3);
    }

    // ── GBP & SEO reports
    if (clientsWithGBP.length > 0) {
      const c = clientsWithGBP[0];
      say('gbp-done', 'GBP', `Finished the GBP audit for ${c.businessName}. Profile completeness is solid but review response rate is low — that's their biggest gap right now.`, 8);
      say('strat-gbp', 'Strategist', `What's the quick win to move the needle there?`, 3);
      say('gbp-qw', 'GBP', `Respond to the 3 unanswered reviews and post twice this week. Should lift the score within a fortnight.`, 2);
      say('strat-gbp2', 'Strategist', `Good. I'll queue those as actions in their feed.`, 3);
    }

    if (clientsWithSEO.length > 0) {
      const c = clientsWithSEO[0];
      say('seo-done', 'SEO', `SEO plan locked for ${c.businessName}. ${clientsWithSEO.length > 1 ? `${clientsWithSEO.length - 1} more plans also ready.` : ''} Keyword targets and content gaps are mapped — 3-month roadmap's in the system.`, 10);
      say('strat-seo', 'Strategist', `Are the service pages covered or is it mostly blog content?`, 3);
      say('seo-detail', 'SEO', `Mix of both — 6 service pages, 4 location pages, and 4 FAQ opportunities. The service pages should come first for conversion.`, 2);
      say('strat-seo2', 'Strategist', `Agreed. Let's prioritise those in the content calendar. I'll update the sequencing.`, 4);
    }

    // ── Website audit
    const lowGrade = clientsWithWebsite.filter(c => c.websiteEngine?.overallGrade === 'F' || c.websiteEngine?.overallGrade === 'D');
    if (lowGrade.length > 0) {
      const c = lowGrade[0];
      say('web-flag', 'Website', `Just flagging — ${c.businessName} website scored ${c.websiteEngine?.overallGrade}. Conversion structure is critically weak. I wouldn't recommend running ads to this site yet.`, 12);
      say('strat-web', 'Strategist', `That's a problem if they're expecting leads from paid. What's the rebuild scope?`, 3);
      say('web-scope', 'Website', `Landing page refresh at minimum, ideally a full restructure. I can detail it in the action list if you want to present to them.`, 2);
      say('strat-web2', 'Strategist', `Yes — put it in the client report. We'll use it as a conversation starter.`, 3);
    }

    // ── Ads ready
    const adsReady = clientsWithAds.filter(c => (c.adsEngine?.readinessScore || 0) >= 70);
    if (adsReady.length > 0) {
      const c = adsReady[0];
      say('ads-ready', 'Ads', `${c.businessName} is sitting at ${c.adsEngine?.readinessScore}% readiness for paid search. Campaign structure and budget model are mapped — ready to launch when you give the word.`, 14);
      say('strat-ads', 'Strategist', `Is the landing page situation sorted for them?`, 3);
      say('ads-lp', 'Ads', `Yeah, they're in decent shape on that front. I'd say we're good to go.`, 2);
      say('strat-ads2', 'Strategist', `Let's schedule a launch brief with the client this week then. Sales, can you get that in the calendar?`, 3);
      say('sales-ads', 'Sales', `On it — I'll reach out today.`, 2);
    }

    // ── Missing onboarding
    const noOnboarding = activeClients.filter(c => !c.clientOnboarding?.businessContext);
    if (noOnboarding.length > 0) {
      say('strat-onb', 'Strategy', `Still waiting on onboarding context for ${noOnboarding.length} client${noOnboarding.length > 1 ? 's' : ''}. SEO and Website engines can't run until we have their discovery data.`, 10);
      say('strat-onb2', 'Strategist', `Which ones are most time-sensitive?`, 3);
      const c = noOnboarding[0];
      say('strat-onb3', 'Strategy', `${c.businessName} should be the priority — they're expecting intelligence outputs soon.`, 2);
      say('strat-onb4', 'Strategist', `I'll follow up with the account lead today. Can we hold the engine run until we have it?`, 3);
      say('strat-onb5', 'Strategy', `Done — holding.`, 2);
    }

    // ── Missing GBP OAuth
    const noGBP = activeClients.filter(c => !c.gbpLocationName);
    if (noGBP.length > 0) {
      say('gbp-missing', 'GBP', `Flagging ${noGBP.length} client${noGBP.length > 1 ? 's' : ''} without GBP connected. I can't track rankings or manage reviews for them without the OAuth link.`, 8);
      say('strat-gbp-missing', 'Strategist', `That should be part of the onboarding checklist. Ops, can we add a blocker to their account until it's connected?`, 3);
      say('ops-gbp', 'Ops', `Already flagged in their execution status. They'll show as blocked until resolved.`, 2);
    }

    // ── Stalled or red health clients
    const redClients = activeClients.filter(c => c.healthStatus === 'red');
    const stalledClients = activeClients.filter(c => c.learningInsight?.momentumStatus === 'stalled');
    if (redClients.length > 0 || stalledClients.length > 0) {
      const target = redClients[0] ?? stalledClients[0];
      say('growth-flag', 'Growth', `Health check: ${target.businessName} hasn't had a meaningful touchpoint in a while — health score has dropped. We're in churn risk territory if this continues.`, 10);
      say('strat-growth', 'Strategist', `How long since last real engagement?`, 3);
      say('growth-days', 'Growth', `It's been a while. I'd recommend a direct call this week before it gets worse.`, 2);
      say('strat-growth2', 'Strategist', `Agreed. Sales, can you pick this one up today?`, 3);
    }

    // ── Blocked execution
    if (blockedClients.length > 0) {
      const c = blockedClients[0];
      say('ops-blocked', 'Ops', `Execution blocked for ${c.businessName} — missing a few inputs before I can continue. Need the landing page URL and confirmed GBP access.`, 8);
      say('strat-blocked', 'Strategist', `I'll chase the client now. Can you hold the queue until this afternoon?`, 3);
      say('ops-hold', 'Ops', `Holding. I'll retry automatically once the inputs are in.`, 2);
    }

    // ── Overdue follow-ups
    if (overdueLeads.length > 0) {
      const lead = overdueLeads[0];
      say('sales-overdue', 'Sales', `Flagging ${overdueLeads.length} lead${overdueLeads.length > 1 ? 's' : ''} past their follow-up date. ${lead?.businessName ? `${lead.businessName} is the most overdue.` : ''} Want me to reprioritise the sequence?`, 6);
      say('strat-overdue', 'Strategist', `Yes — ${lead?.businessName ? `bump ${lead.businessName} to the top.` : 'prioritise the deepest-stage lead.'} The rest can hold until tomorrow.`, 3);
      say('sales-overdue2', 'Sales', `Done. Reaching out this afternoon.`, 2);
    }

    // ── No plays activated
    const noPlays = activeClients.filter(c => !c.appliedPlays || c.appliedPlays.length === 0);
    if (noPlays.length > 0) {
      say('strat-plays', 'Strategist', `Quick reminder — ${noPlays.length} client${noPlays.length > 1 ? 's' : ''} still don't have a growth play activated. Without that sequencing framework the AI actions are just individual tasks, not a coordinated strategy.`, 6);
      say('growth-plays', 'Growth', `I can recommend a play for each based on their current signals. Want me to run through them?`, 3);
      say('strat-plays2', 'Strategist', `Yes — send me the shortlist and I'll confirm before we activate.`, 2);
    }

    // ── Open NBA queue
    if (openNBA.length > 0) {
      say('sales-nba', 'Sales', `${openNBA.length} AI action${openNBA.length > 1 ? 's' : ''} queued and ready to go.`, 5);
      say('strat-nba', 'Strategist', `Hold on anything client-facing until after 10am. Execute the research and prep tasks now.`, 3);
      say('sales-nba2', 'Sales', `Understood.`, 2);
    }

    // ── Strong momentum celebration
    const strongClients = activeClients.filter(c => c.learningInsight?.momentumStatus === 'strong');
    if (strongClients.length > 0) {
      say('strat-strong', 'Strategist', `Good news — ${strongClients.map(c => c.businessName).slice(0, 2).join(' and ')} ${strongClients.length > 2 ? `and ${strongClients.length - 2} others` : ''} are showing strong momentum. Engines performing above baseline.`, 5);
      say('growth-strong', 'Growth', `Agreed — the Growth Playbook is working well for them. Worth highlighting in the next client review.`, 3);
    }

    // ── Prescriptions
    if (clientsWithPrescription.length > 0) {
      say('strat-presc', 'Strategy', `${clientsWithPrescription.length} growth prescription${clientsWithPrescription.length > 1 ? 's' : ''} are ready in the pipeline. Recommended stacks and investment tiers are mapped — good material for the next discovery calls.`, 8);
      say('sales-presc', 'Sales', `Perfect timing. I've got a few calls this week where this will help.`, 3);
    }

    // ── Fallback if nothing to talk about
    if (msgs.length <= 3) {
      say('ops-quiet', 'Ops', 'All systems operational. No blockers or escalations at this time.', 5);
      say('strat-quiet', 'Strategist', 'Good. Let\'s use the time to get ahead on the pipeline. Sales — any leads close to proposal stage?', 3);
      say('sales-quiet', 'Sales', `Working through a few. I'll update the pipeline by end of day.`, 2);
    }

    const scriptedFeed = msgs; // scripted fallback

    // If AI comms are ready, use them instead of scripted; otherwise fall back
    const baseFeed: AgentCommsMessage[] = aiCommsData?.messages?.length
      ? aiCommsData.messages.map((m, i) => {
          const meta = rm(m.from);
          return { id: `ai-${i}`, from: m.from, fromIcon: meta.icon, fromBg: meta.bg, message: m.message, minutesAgo: m.minutesAgo };
        })
      : scriptedFeed;

    // Append real-time OpenClaw messages (always most recent, always at bottom)
    const clawOffset = clawMessages.length > 0 ? (clawMessages[clawMessages.length - 1].minutesAgo ?? 0) : 0;
    const clawWithSource = clawMessages.map((m, i) => ({
      ...m,
      id: `claw-${m.id}-${i}`,
      minutesAgo: Math.max(0, clawOffset > 0 ? clawOffset - 1 - i : i),
    }));

    return [...baseFeed, ...clawWithSource];
  }, [overdueLeads, openNBA, activeClients, blockedClients, clientsWithSEO, clientsWithWebsite,
      clientsWithGBP, clientsWithAds, clientsWithPrescription, autonomousClients,
      activeLeads, aiCommsData, clawMessages]);

  // ── Live-feed animation: replay the feed each time agentFeed changes ────────
  useEffect(() => {
    let cancelled = false;

    setVisibleCount(0);
    setTypingAgent(null);

    const feed = agentFeed; // snapshot

    async function play() {
      for (let i = 0; i < feed.length; i++) {
        if (cancelled) return;
        const msg = feed[i];

        // Brief pause before showing typing indicator
        await sleep(i === 0 ? 600 : 1400);
        if (cancelled) return;

        setTypingAgent({ from: msg.from, fromBg: msg.fromBg, fromIcon: msg.fromIcon });

        // Typing duration: proportional to message length, capped
        const typingMs = Math.min(1800, 700 + msg.message.length * 6);
        await sleep(typingMs);
        if (cancelled) return;

        setTypingAgent(null);
        setVisibleCount(i + 1);
      }
    }

    play();
    return () => { cancelled = true; };
  }, [agentFeed.length]); // re-play only if the number of messages changes

  // ── Auto-scroll comms panel ────────────────────────────────────────────────
  useEffect(() => {
    const el = commsRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [visibleCount, typingAgent]);

  // ── Secretary recommendations ─────────────────────────────────────────────

  const secretaryItems = useMemo<SecretaryItem[]>(() => {
    const items: SecretaryItem[] = [];

    const noGBP        = activeClients.filter(c => !c.gbpLocationName);
    const noOnboarding = activeClients.filter(c => !c.clientOnboarding?.businessContext);
    const noPlays      = activeClients.filter(c => !c.appliedPlays || c.appliedPlays.length === 0);
    const noSEOInputs  = activeClients.filter(c => !c.seoEngine && !c.clientOnboarding?.seoInputs);
    const lowGrade     = clientsWithWebsite.filter(c => c.websiteEngine?.overallGrade === 'F' || c.websiteEngine?.overallGrade === 'D');
    const supervised   = activeClients.filter(c => c.automationMode === 'supervised');
    const redClients   = activeClients.filter(c => c.healthStatus === 'red');

    if (blockedClients.length > 0) {
      items.push({
        id: 'resolve-blockers',
        title: `Resolve execution blockers for ${blockedClients.length} client${blockedClients.length > 1 ? 's' : ''}`,
        reason: `${blockedClients.map(c => c.businessName).slice(0, 2).join(', ')} are stalled. The team cannot proceed until missing inputs are provided.`,
        flaggedBy: 'Ops Agent',
        priority: 'urgent',
        icon: Wrench,
        actionLabel: 'View Clients',
        path: '/clients',
      });
    }

    if (redClients.length > 0) {
      items.push({
        id: 'red-clients',
        title: `Intervene on ${redClients.length} at-risk client${redClients.length > 1 ? 's' : ''}`,
        reason: `${redClients.map(c => c.businessName).slice(0, 2).join(', ')} are in red health. Churn risk is high — direct contact needed this week.`,
        flaggedBy: 'Growth Agent',
        priority: 'urgent',
        icon: UserCheck,
        actionLabel: 'View Clients',
        path: '/clients',
      });
    }

    if (noGBP.length > 0) {
      items.push({
        id: 'link-gbp',
        title: `Link Google Business Profiles for ${noGBP.length} client${noGBP.length > 1 ? 's' : ''}`,
        reason: `GBP Agent cannot track rankings, manage reviews, or generate audit reports without OAuth access. This blocks the entire local SEO workflow.`,
        flaggedBy: 'GBP Agent',
        priority: 'high',
        icon: Link2,
        actionLabel: 'Connect GBPs',
        path: '/clients',
      });
    }

    if (overdueLeads.length > 0) {
      items.push({
        id: 'pipeline-followup',
        title: `Clear ${overdueLeads.length} overdue follow-up${overdueLeads.length > 1 ? 's' : ''} in the pipeline`,
        reason: `Sales Agent has flagged leads past their contact date. Momentum is stalling — these need a sequencing decision or contact today.`,
        flaggedBy: 'Sales Agent',
        priority: 'high',
        icon: List,
        actionLabel: 'View Pipeline',
        path: '/pipeline',
      });
    }

    if (noOnboarding.length > 0) {
      items.push({
        id: 'onboarding-context',
        title: `Complete discovery inputs for ${noOnboarding.length} client${noOnboarding.length > 1 ? 's' : ''}`,
        reason: `Strategy, SEO, Website and Ads engines are all blocked without onboarding context. Run a discovery call or fill in the onboarding card.`,
        flaggedBy: 'Strategy Agent',
        priority: 'high',
        icon: FileSearch,
        actionLabel: 'View Clients',
        path: '/clients',
      });
    }

    if (noPlays.length > 0) {
      items.push({
        id: 'activate-plays',
        title: `Activate a growth play for ${noPlays.length} client${noPlays.length > 1 ? 's' : ''}`,
        reason: `Without an active play, the AI action feed has no strategic sequencing framework. Actions are being generated but not coordinated.`,
        flaggedBy: 'Strategist',
        priority: 'high',
        icon: PlayCircle,
        actionLabel: 'View Clients',
        path: '/clients',
      });
    }

    if (noSEOInputs.length > 0) {
      items.push({
        id: 'seo-inputs',
        title: `Add service & location data for ${noSEOInputs.length} client${noSEOInputs.length > 1 ? 's' : ''}`,
        reason: `SEO Agent needs service types, target locations and competitor data to generate keyword plans. Fill in the SEO inputs tab in onboarding.`,
        flaggedBy: 'SEO Agent',
        priority: 'medium',
        icon: MapPin,
        actionLabel: 'View Clients',
        path: '/clients',
      });
    }

    if (lowGrade.length > 0) {
      const c = lowGrade[0];
      items.push({
        id: 'website-rebuild',
        title: `Prioritise website rebuild for ${c.businessName}`,
        reason: `Website scored ${c.websiteEngine?.overallGrade} — conversion structure is critically weak. Running paid ads to this site will waste budget.`,
        flaggedBy: 'Website Agent',
        priority: 'medium',
        icon: Globe,
        actionLabel: 'View Client',
        path: '/clients',
      });
    }

    if (supervised.length > 0) {
      items.push({
        id: 'review-automation',
        title: `Review autonomous mode eligibility for ${supervised.length} client${supervised.length > 1 ? 's' : ''}`,
        reason: `These clients are in supervised mode, generating approval requests that need manual review. Consider upgrading eligible clients to reduce your workload.`,
        flaggedBy: 'Ops Agent',
        priority: 'medium',
        icon: GitMerge,
        actionLabel: 'Automation Rules',
        path: '/bullpen',
      });
    }

    return items;
  }, [activeClients, blockedClients, clientsWithWebsite, overdueLeads]);

  // ── Work hours check ──────────────────────────────────────────────────────

  const isWithinWorkHours = useMemo(() => {
    const timeStr = format(now, 'HH:mm');
    return timeStr >= rules.workHoursStart && timeStr <= rules.workHoursEnd;
  }, [rules.workHoursStart, rules.workHoursEnd]);

  if (!isManager) return <Redirect to="/dashboard" />;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Radio className="h-5 w-5 text-violet-500" />
              Bullpen
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Internal AI workforce command layer — {format(now, 'EEEE dd/MM/yyyy HH:mm')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isWithinWorkHours
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isWithinWorkHours ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isWithinWorkHours ? `Work hours active (${rules.workHoursStart}–${rules.workHoursEnd})` : `Outside work hours (${rules.workHoursStart}–${rules.workHoursEnd})`}
            </div>
          </div>
        </div>

        {/* ── Summary cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Active Workloads"   value={summaryActiveWorkloads}  icon={Zap}          color="text-violet-600 dark:text-violet-400" />
          <SummaryCard label="Queued Actions"      value={summaryQueued}            icon={Clock}        color="text-blue-600 dark:text-blue-400" />
          <SummaryCard label="Awaiting Approval"   value={summaryAwaitingApproval}  icon={Timer}        color="text-amber-600 dark:text-amber-400" />
          <SummaryCard label="Blocked / At Risk"   value={summaryBlocked}           icon={Ban}          color="text-red-600 dark:text-red-400" />
          <SummaryCard label="Completed Today"     value={summaryCompletedToday}    icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
          <SummaryCard label="AI-Managed Clients"  value={summaryClientsAffected}   icon={Users}        color="text-indigo-600 dark:text-indigo-400" />
        </div>

        {/* ── Command Center ───────────────────────────────────────────────── */}
        <BullpenCommandCenter />

        {/* ── Work Queue ───────────────────────────────────────────────────── */}
        <BullpenWorkQueue />

        {/* ── Needs Attention ──────────────────────────────────────────────── */}
        {attentionItems.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Needs Attention — {attentionItems.length} item{attentionItems.length > 1 ? 's' : ''}
            </h2>
            <div className="space-y-2">
              {attentionItems.map(item => <AttentionCard key={item.id} item={item} />)}
            </div>
          </div>
        )}

        {attentionItems.length === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">No attention required</p>
              <p className="text-xs text-muted-foreground">All systems operating normally. No blockers or urgent items detected.</p>
            </div>
          </div>
        )}

        {/* ── Team Comms ───────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
            </span>
            Team Comms — Live
            {aiCommsLoading && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground/60 normal-case tracking-normal animate-pulse">
                AI generating…
              </span>
            )}
            {aiCommsData && !aiCommsLoading && (
              <span className="ml-1 text-[10px] font-normal text-violet-500/70 normal-case tracking-normal">
                · AI-powered
              </span>
            )}
            {clawMessages.length > 0 && (
              <span className="ml-1 text-[10px] font-normal text-emerald-600/70 normal-case tracking-normal">
                · {clawMessages.length} live from Claw
              </span>
            )}
          </h2>
          <Card className="border bg-card">
            <CardContent className="p-0">
              <div ref={commsRef} className="max-h-[520px] overflow-y-auto px-5 pb-4">
                {agentFeed.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No agent messages yet.</div>
                ) : (
                  <>
                    {agentFeed.slice(0, visibleCount).map((msg, i) => (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        grouped={i > 0 && agentFeed[i - 1].from === msg.from}
                      />
                    ))}
                    {typingAgent && (
                      <TypingIndicator
                        from={typingAgent.from}
                        fromBg={typingAgent.fromBg}
                        fromIcon={typingAgent.fromIcon}
                      />
                    )}
                    {visibleCount === 0 && !typingAgent && (
                      <div className="py-8 text-center text-sm text-muted-foreground">Starting team comms…</div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Secretary ────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-violet-500" />
            Secretary — Action Briefing
          </h2>
          <Card className="border bg-card">
            <div className="px-5 py-4 border-b border-border/50 bg-violet-50/50 dark:bg-violet-950/20 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
                  {secretaryItems.length > 0
                    ? `I've reviewed the team's conversation and flagged ${secretaryItems.length} thing${secretaryItems.length > 1 ? 's' : ''} that need your direct involvement.`
                    : 'I\'ve reviewed the team\'s conversation. Everything looks well-resourced — no immediate action required from you.'}
                </p>
                <p className="text-xs text-violet-700/70 dark:text-violet-400/70 mt-0.5">
                  Based on agent feedback from today's comms — sorted by urgency.
                </p>
              </div>
            </div>
            {secretaryItems.length > 0 ? (
              <CardContent className="p-0">
                {secretaryItems.map(item => (
                  <SecretaryRecommendation key={item.id} item={item} />
                ))}
              </CardContent>
            ) : (
              <CardContent className="px-5 py-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <p className="text-sm text-muted-foreground">All tools and integrations appear to be in good shape. I'll flag anything that changes.</p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* ── Workforce ────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5" />
            Workforce — {activeRoles.length} active, {idleRoles.length} idle
          </h2>

          {(['leadership', 'execution', 'development', 'control'] as const).map(tier => {
            const tierRoles = roles.filter(r => r.tier === tier);
            if (!tierRoles.length) return null;
            const tierLabel: Record<string, string> = {
              leadership:  'Leadership & Strategy',
              execution:   'Execution Specialists',
              development: 'Development & Systems Team',
              control:     'Control & Orchestration',
            };
            return (
              <div key={tier} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${TIER_BADGE[tier]}`}>
                    {tier}
                  </span>
                  <p className="text-xs text-muted-foreground">{tierLabel[tier]}</p>
                  <div className="flex-1 border-t ml-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tierRoles.map(role => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      onViewIntel={() => setIntelRole(role)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Role Intel Drawer ────────────────────────────────────────────── */}
        <RoleIntelDrawer
          role={intelRole}
          config={intelRole ? ROLE_CONFIG[intelRole.id] ?? null : null}
          open={!!intelRole}
          onClose={() => setIntelRole(null)}
        />

        {/* ── Automation Rules ─────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" />
            Automation Rules & Control
          </h2>

          {/* Config status banners */}
          {rulesConfigStatus === 'invalid' && (
            <div className="mb-3 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2" data-testid="banner-rules-invalid">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Stored config is invalid</span> — defaults are in use until you save corrected values.
                {rulesValidationErrors.length > 0 && (
                  <ul className="mt-1 list-disc list-inside opacity-80">
                    {rulesValidationErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
          {rulesConfigStatus === 'missing' && (
            <div className="mb-3 p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs flex items-center gap-2" data-testid="banner-rules-missing">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No rules saved yet — showing defaults. Save to persist your configuration.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Work hours */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Work Hours Window
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start time</Label>
                    <Select value={rules.workHoursStart} onValueChange={v => patchRule('workHoursStart', v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-work-start">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['06:00','07:00','07:30','08:00','08:30','09:00'].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End time</Label>
                    <Select value={rules.workHoursEnd} onValueChange={v => patchRule('workHoursEnd', v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-work-end">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['17:00','17:30','18:00','18:30','19:00','20:00'].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Timezone</Label>
                  <Select value={rules.timezone} onValueChange={v => patchRule('timezone', v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                      <SelectItem value="Australia/Sydney">Australia/Sydney (AEDT)</SelectItem>
                      <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEDT)</SelectItem>
                      <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={`text-xs px-2 py-1.5 rounded flex items-center gap-1.5 ${
                  isWithinWorkHours
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-muted-foreground'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isWithinWorkHours ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {isWithinWorkHours ? 'Currently within work hours' : 'Currently outside work hours — comms held'}
                </div>
              </CardContent>
            </Card>

            {/* Communication restrictions */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Ban className="h-4 w-4 text-muted-foreground" />
                  Communication Restrictions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <RuleRow
                  label="Block SMS outside hours"
                  description="Queue all outbound SMS until work hours open"
                  checked={rules.blockSmsOutsideHours}
                  onChange={v => patchRule('blockSmsOutsideHours', v)}
                />
                <RuleRow
                  label="Block email outside hours"
                  description="Hold email dispatch until next work window"
                  checked={rules.blockEmailOutsideHours}
                  onChange={v => patchRule('blockEmailOutsideHours', v)}
                />
                <RuleRow
                  label="Block outbound calls outside hours"
                  description="AI must not initiate or log calls outside approved window"
                  checked={rules.blockCallsOutsideHours}
                  onChange={v => patchRule('blockCallsOutsideHours', v)}
                />
              </CardContent>
            </Card>

            {/* Approval requirements */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Approval Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <RuleRow
                  label="Require approval — campaign launches"
                  description="Google Ads, SEO rollouts, and paid campaigns need sign-off"
                  checked={rules.requireApprovalCampaigns}
                  onChange={v => patchRule('requireApprovalCampaigns', v)}
                />
                <RuleRow
                  label="Require approval — high-risk actions"
                  description="Communications flagged as high-risk need manual review"
                  checked={rules.requireApprovalHighRisk}
                  onChange={v => patchRule('requireApprovalHighRisk', v)}
                />
                <RuleRow
                  label="Require approval — publish actions"
                  description="Website, GBP, and content publish actions require confirmation"
                  checked={rules.requireApprovalPublish}
                  onChange={v => patchRule('requireApprovalPublish', v)}
                />
                <RuleRow
                  label="Require approval — production releases"
                  description="All production deployments and infrastructure changes require manager sign-off"
                  checked={rules.requireApprovalProduction}
                  onChange={v => patchRule('requireApprovalProduction', v)}
                />
              </CardContent>
            </Card>

            {/* Status summary */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {[
                  { label: 'Total active leads', value: activeLeads.length },
                  { label: 'Total active clients', value: activeClients.length },
                  { label: 'Clients on AI growth', value: aiActiveClients.length },
                  { label: 'Clients on autopilot', value: autonomousClients.length },
                  { label: 'Activities logged today', value: todayActivities.length },
                  { label: 'Open AI actions (queue)', value: openNBA.length },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={saveRules} disabled={rulesSaving} className="gap-2" data-testid="button-save-rules">
              {rulesSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Save Automation Rules
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}

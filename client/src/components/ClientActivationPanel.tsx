import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Globe, MapPin, Search, Megaphone, Sparkles, Loader2, ChevronDown, ChevronRight,
  CheckCircle2, Clock, Zap, FileText, Layout, Type, Star, Check,
  AlertTriangle, ListChecks, CalendarDays, Tag, TrendingUp, Eye, Shield,
  ArrowRight, Mic, MicOff, Upload, X, MessageSquare, Image, Table2, Send, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Client, WorkstreamScope, WorkstreamStatus, GBPTask } from '@/lib/types';
import { useDispatch } from 'react-redux';
import { updateClient } from '@/store';
import { updateClientInFirestore } from '@/lib/firestoreService';
import { auth } from '@/lib/firebase';
import * as XLSX from 'xlsx';

const SCOPE_CONFIG: Record<WorkstreamScope, { label: string; icon: typeof Globe; color: string; bg: string }> = {
  website: {
    label: 'Website Build',
    icon: Globe,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  gbp: {
    label: 'GBP / Local',
    icon: MapPin,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  seo: {
    label: 'SEO',
    icon: Search,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
  },
  ads: {
    label: 'Paid Ads',
    icon: Megaphone,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
  },
};

const STATUS_CONFIG: Record<WorkstreamStatus, { label: string; cls: string; dot: string }> = {
  queued: { label: 'Queued', cls: 'text-muted-foreground', dot: 'bg-muted-foreground/40' },
  generating: { label: 'Generating…', cls: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500 animate-pulse' },
  ready_for_review: { label: 'Ready for review', cls: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  approved: { label: 'Approved', cls: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  live: { label: 'Live', cls: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  optimising: { label: 'Optimising', cls: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
};

const PRIORITY_CONFIG = {
  high: { cls: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800', label: 'High' },
  medium: { cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800', label: 'Medium' },
  low: { cls: 'text-muted-foreground bg-muted/60 border-border', label: 'Low' },
};

const TIMELINE_LABELS: Record<string, string> = {
  '7_days': '7 days',
  '30_days': '30 days',
  '60_days': '60 days',
  '90_days': '90 days',
  'ongoing': 'Ongoing',
};

function StatusPill({ status }: { status: WorkstreamStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon: typeof Globe; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      {badge && <Badge variant="secondary" className="text-[10px] py-0">{badge}</Badge>}
    </div>
  );
}

// ── Website Workstream Output ──────────────────────────────────────────────

function WebsiteWorkstreamOutput({ client }: { client: Client }) {
  const ww = client.activationPlan?.websiteWorkstream;
  const [openSection, setOpenSection] = useState<string | null>('brief');

  if (!ww) return null;

  const toggle = (s: string) => setOpenSection(prev => prev === s ? null : s);

  return (
    <div className="space-y-2 mt-3">
      {/* Brief */}
      {ww.brief && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            onClick={() => toggle('brief')}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-medium">Website Brief</span>
            </div>
            {openSection === 'brief' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {openSection === 'brief' && (
            <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Positioning</p>
                <p className="text-xs">{ww.brief.positioning}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Unique Value Proposition</p>
                <p className="text-xs">{ww.brief.uniqueValueProposition}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Target Audience</p>
                <p className="text-xs">{ww.brief.targetAudience}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Primary CTA</p>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{ww.brief.primaryCTA}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Trust Signals</p>
                <ul className="space-y-1">
                  {ww.brief.trustSignals.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Tone of Voice</p>
                <p className="text-xs text-muted-foreground">{ww.brief.toneOfVoice}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Page Structure */}
      {ww.pageStructure && ww.pageStructure.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            onClick={() => toggle('pages')}
          >
            <div className="flex items-center gap-2">
              <Layout className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-medium">Page Structure</span>
              <Badge variant="outline" className="text-[10px] py-0">{ww.pageStructure.length} pages</Badge>
            </div>
            {openSection === 'pages' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {openSection === 'pages' && (
            <div className="border-t divide-y bg-muted/20">
              {ww.pageStructure.map((page, i) => (
                <div key={i} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{page.pageName}</span>
                      <Badge variant="outline" className="text-[10px] py-0 capitalize">{page.pageType}</Badge>
                    </div>
                    <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">{page.primaryKeyword}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{page.goalStatement}</p>
                  <div className="flex flex-wrap gap-1">
                    {page.keySections.map((s, j) => (
                      <span key={j} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{s}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">{page.metaTitle}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Homepage Content */}
      {ww.homepageContent && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            onClick={() => toggle('homepage')}
          >
            <div className="flex items-center gap-2">
              <Type className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-medium">Homepage Content</span>
            </div>
            {openSection === 'homepage' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {openSection === 'homepage' && (
            <div className="border-t px-3 py-3 space-y-4 bg-muted/20">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Hero Section</p>
                <div className="rounded-md border bg-background p-2.5 space-y-1">
                  <p className="text-sm font-semibold">{ww.homepageContent.hero.headline}</p>
                  <p className="text-xs text-muted-foreground">{ww.homepageContent.hero.subheadline}</p>
                  <div className="mt-1.5">
                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">
                      {ww.homepageContent.hero.cta}
                    </span>
                  </div>
                  {ww.homepageContent.hero.supportingPoints?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {ww.homepageContent.hero.supportingPoints.map((p, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Services</p>
                <div className="space-y-1.5">
                  {ww.homepageContent.services.map((svc, i) => (
                    <div key={i} className="rounded border bg-background px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">{svc.title}</p>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400">{svc.cta}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{svc.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              {ww.homepageContent.faq?.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">FAQ</p>
                  <div className="space-y-1.5">
                    {ww.homepageContent.faq.map((faq, i) => (
                      <div key={i} className="rounded border bg-background px-2.5 py-2">
                        <p className="text-[11px] font-medium">{faq.question}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SEO Foundations */}
      {ww.seoFoundations && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            onClick={() => toggle('seo')}
          >
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-medium">SEO Foundations</span>
            </div>
            {openSection === 'seo' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {openSection === 'seo' && (
            <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Primary Keyword</p>
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400">{ww.seoFoundations.primaryKeyword}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Supporting Keywords</p>
                <div className="flex flex-wrap gap-1">
                  {ww.seoFoundations.secondaryKeywords.map((kw, i) => (
                    <span key={i} className="text-[10px] bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded border border-violet-200 dark:border-violet-800">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Schema Type</p>
                <p className="text-xs text-muted-foreground">{ww.seoFoundations.schemaType}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEO Preservation Plan — only for takeover/rebuild clients */}
      {ww.seoFoundations?.preservationPlan && (() => {
        const pp = ww.seoFoundations!.preservationPlan!;
        return (
          <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors bg-amber-50/30 dark:bg-amber-950/10"
              onClick={() => toggle('preservation')}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-xs font-medium text-amber-800 dark:text-amber-200">SEO Migration Plan</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">TAKEOVER</span>
              </div>
              {openSection === 'preservation' ? <ChevronDown className="h-3.5 w-3.5 text-amber-500" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-500" />}
            </button>
            {openSection === 'preservation' && (
              <div className="border-t border-amber-200 dark:border-amber-800 px-3 py-3 space-y-3 bg-amber-50/20 dark:bg-amber-950/10">
                {pp.seoRiskNote && (
                  <div className="flex items-start gap-2 p-2 rounded bg-amber-100/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">{pp.seoRiskNote}</p>
                  </div>
                )}
                {pp.preserveItems?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">Preserve</p>
                    <div className="space-y-1">
                      {pp.preserveItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pp.improveItems?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">Improve</p>
                    <div className="space-y-1">
                      {pp.improveItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <TrendingUp className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pp.replaceItems?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-1.5">Replace</p>
                    <div className="space-y-1">
                      {pp.replaceItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <ArrowRight className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pp.redirectsRequired?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">301 Redirects Required</p>
                    <div className="space-y-1">
                      {pp.redirectsRequired.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <ArrowRight className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── GBP Workstream Output ───────────────────────────────────────────────────

function GBPWorkstreamOutput({ client, onTaskToggle }: { client: Client; onTaskToggle: (taskId: string, done: boolean) => void }) {
  const gw = client.activationPlan?.gbpWorkstream;
  const [openSection, setOpenSection] = useState<string | null>('tasks');
  const [filter, setFilter] = useState<string>('all');

  if (!gw) return null;

  const toggle = (s: string) => setOpenSection(prev => prev === s ? null : s);

  const tasks = gw.tasks || [];
  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.priority === filter || t.category === filter || t.timeline === filter);
  const done = tasks.filter(t => t.done).length;

  return (
    <div className="space-y-2 mt-3">
      {/* Task List */}
      <div className="border rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
          onClick={() => toggle('tasks')}
        >
          <div className="flex items-center gap-2">
            <ListChecks className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs font-medium">Optimisation Tasks</span>
            <Badge variant="secondary" className="text-[10px] py-0">{done}/{tasks.length}</Badge>
          </div>
          {openSection === 'tasks' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {openSection === 'tasks' && (
          <div className="border-t bg-muted/20">
            <div className="flex gap-1 px-3 py-2 flex-wrap border-b">
              {(['all', 'high', 'medium', 'profile', 'content', 'reviews', 'photos', 'visibility'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize ${
                    filter === f ? 'bg-emerald-500 text-white border-emerald-500' : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {filtered.map((task) => (
                <GBPTaskRow key={task.id} task={task} onToggle={onTaskToggle} />
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No tasks match this filter</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content Calendar */}
      {gw.contentCalendar && gw.contentCalendar.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            onClick={() => toggle('calendar')}
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="text-xs font-medium">Content Calendar</span>
              <Badge variant="outline" className="text-[10px] py-0">{gw.contentCalendar.length} weeks</Badge>
            </div>
            {openSection === 'calendar' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {openSection === 'calendar' && (
            <div className="border-t bg-muted/20 divide-y max-h-[300px] overflow-y-auto">
              {gw.contentCalendar.map((week, i) => (
                <div key={i} className="px-3 py-2.5 flex items-start gap-3">
                  <div className="text-[10px] font-semibold text-muted-foreground w-12 shrink-0 mt-0.5">Wk {week.week}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge variant="outline" className="text-[10px] py-0 capitalize">{week.postType}</Badge>
                      <span className="text-xs font-medium truncate">{week.topic}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{week.cta}</p>
                    {week.hashtags?.length > 0 && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">{week.hashtags.join(' ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category Recommendations */}
      {gw.categoryRecommendations && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            onClick={() => toggle('categories')}
          >
            <div className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="text-xs font-medium">Category Optimisation</span>
            </div>
            {openSection === 'categories' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {openSection === 'categories' && (
            <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
              {gw.categoryRecommendations.current?.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Current</p>
                  <div className="flex flex-wrap gap-1">
                    {gw.categoryRecommendations.current.map((c, i) => (
                      <span key={i} className="text-[10px] bg-muted border border-border px-1.5 py-0.5 rounded text-muted-foreground">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Recommended</p>
                <div className="flex flex-wrap gap-1">
                  {gw.categoryRecommendations.recommended.map((c, i) => (
                    <span key={i} className={`text-[10px] border px-1.5 py-0.5 rounded font-medium ${i === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-muted border-border text-foreground'}`}>
                      {i === 0 ? '★ ' : ''}{c}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{gw.categoryRecommendations.rationale}</p>
            </div>
          )}
        </div>
      )}

      {/* Review Strategy */}
      {gw.reviewStrategy && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            onClick={() => toggle('reviews')}
          >
            <div className="flex items-center gap-2">
              <Star className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="text-xs font-medium">Review Strategy</span>
              <span className="text-[10px] text-muted-foreground">Target: {gw.reviewStrategy.targetMonthly}/mo</span>
            </div>
            {openSection === 'reviews' ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {openSection === 'reviews' && (
            <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Ask Script</p>
                <p className="text-xs italic bg-background border rounded px-2.5 py-2">&ldquo;{gw.reviewStrategy.askScript}&rdquo;</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Response Template</p>
                <p className="text-xs italic bg-background border rounded px-2.5 py-2">&ldquo;{gw.reviewStrategy.responseTemplate}&rdquo;</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GBPTaskRow({ task, onToggle }: { task: GBPTask; onToggle: (id: string, done: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const pc = PRIORITY_CONFIG[task.priority];
  return (
    <div className={`px-3 py-2.5 transition-colors ${task.done ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggle(task.id, !task.done)}
          className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
            task.done ? 'bg-emerald-500 border-emerald-500' : 'border-border hover:border-emerald-400'
          }`}
        >
          {task.done && <Check className="h-2.5 w-2.5 text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${pc.cls}`}>{pc.label}</span>
            <span className="text-xs font-medium">{task.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground capitalize">{task.category}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{TIMELINE_LABELS[task.timeline] || task.timeline}</span>
          </div>
          {expanded && (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground">{task.description}</p>
              {task.actionSteps?.length > 0 && (
                <ul className="space-y-1">
                  {task.actionSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px]">
                      <ChevronRight className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      {step}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3 w-3 inline mr-1" />{task.estimatedImpact}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Workstream Feedback ─────────────────────────────────────────────────────

interface FeedbackFile {
  id: string;
  name: string;
  type: 'image' | 'spreadsheet';
  dataUrl?: string;
  rows?: string[][];
}

interface FeedbackItem {
  id: string;
  text: string;
  files: FeedbackFile[];
  createdAt: string;
}

function SpreadsheetPreview({ rows }: { rows: string[][] }) {
  const headers = rows[0] || [];
  const data = rows.slice(1);
  const MAX_COLS = 8;
  const MAX_ROWS = 20;
  const visibleHeaders = headers.slice(0, MAX_COLS);
  const visibleData = data.slice(0, MAX_ROWS);

  return (
    <div className="overflow-x-auto rounded border bg-background mt-1.5">
      <table className="text-[10px] w-full min-w-max border-collapse">
        <thead>
          <tr className="bg-muted/60">
            {visibleHeaders.map((h, i) => (
              <th key={i} className="px-2 py-1 text-left font-semibold border-b border-r last:border-r-0 text-muted-foreground whitespace-nowrap max-w-[120px] truncate">
                {h || `Col ${i + 1}`}
              </th>
            ))}
            {headers.length > MAX_COLS && <th className="px-2 py-1 text-muted-foreground border-b">+{headers.length - MAX_COLS} more</th>}
          </tr>
        </thead>
        <tbody>
          {visibleData.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-muted/20'}>
              {visibleHeaders.map((_, ci) => (
                <td key={ci} className="px-2 py-1 border-b border-r last:border-r-0 whitespace-nowrap max-w-[120px] truncate text-foreground/80">
                  {row[ci] ?? ''}
                </td>
              ))}
              {headers.length > MAX_COLS && <td className="px-2 py-1 border-b" />}
            </tr>
          ))}
          {data.length > MAX_ROWS && (
            <tr>
              <td colSpan={Math.min(headers.length, MAX_COLS) + (headers.length > MAX_COLS ? 1 : 0)} className="px-2 py-1 text-center text-muted-foreground">
                +{data.length - MAX_ROWS} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WorkstreamFeedback({
  client,
  scope,
  orgId,
  authReady,
}: {
  client: Client;
  scope: WorkstreamScope;
  orgId: string | null;
  authReady: boolean;
}) {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<FeedbackFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const existingFeedback: FeedbackItem[] = (client.activationPlan?.workstreams?.[scope] as any)?.feedback || [];

  const processFile = useCallback((file: File): Promise<FeedbackFile> => {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isImage = file.type.startsWith('image/');
      const isSheet = file.name.match(/\.(xlsx|xls|csv)$/i);

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ id, name: file.name, type: 'image', dataUrl: e.target?.result as string });
        reader.readAsDataURL(file);
      } else if (isSheet) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const wb = XLSX.read(e.target?.result, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
            resolve({ id, name: file.name, type: 'spreadsheet', rows });
          } catch {
            resolve({ id, name: file.name, type: 'spreadsheet', rows: [['Error reading file']] });
          }
        };
        reader.readAsBinaryString(file);
      } else {
        resolve({ id, name: file.name, type: 'image' });
      }
    });
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const processed = await Promise.all(files.map(processFile));
    setPendingFiles(prev => [...prev, ...processed]);
  }, [processFile]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const processed = await Promise.all(files.map(processFile));
    setPendingFiles(prev => [...prev, ...processed]);
    e.target.value = '';
  }, [processFile]);

  const removeFile = useCallback((id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Voice not supported', description: 'Your browser does not support voice input.', variant: 'destructive' });
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-AU';
    let interim = '';
    rec.onresult = (e: any) => {
      let final = '';
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) setText(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + final);
    };
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }, [listening, toast]);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const handleSave = useCallback(async () => {
    if (!text.trim() && pendingFiles.length === 0) return;
    if (!orgId || !authReady) return;
    setSaving(true);
    try {
      const newItem: FeedbackItem = {
        id: `fb-${Date.now()}`,
        text: text.trim(),
        files: pendingFiles,
        createdAt: new Date().toISOString(),
      };
      const updated = [...existingFeedback, newItem];
      const fieldPath = `activationPlan.workstreams.${scope}.feedback`;
      await updateClientInFirestore(orgId, client.id, { [fieldPath]: updated } as any, authReady);
      const plan = client.activationPlan!;
      dispatch(updateClient({
        ...client,
        activationPlan: {
          ...plan,
          workstreams: {
            ...plan.workstreams,
            [scope]: {
              ...plan.workstreams[scope],
              feedback: updated,
            },
          },
        },
      }));
      setText('');
      setPendingFiles([]);
      toast({ title: 'Feedback saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [text, pendingFiles, existingFeedback, orgId, authReady, client, scope, dispatch, toast]);

  const deleteFeedback = useCallback(async (id: string) => {
    if (!orgId || !authReady) return;
    const updated = existingFeedback.filter(f => f.id !== id);
    const fieldPath = `activationPlan.workstreams.${scope}.feedback`;
    await updateClientInFirestore(orgId, client.id, { [fieldPath]: updated } as any, authReady);
    const plan = client.activationPlan!;
    dispatch(updateClient({
      ...client,
      activationPlan: {
        ...plan,
        workstreams: {
          ...plan.workstreams,
          [scope]: { ...plan.workstreams[scope], feedback: updated },
        },
      },
    }));
  }, [existingFeedback, orgId, authReady, client, scope, dispatch]);

  return (
    <div className="mt-3 border-t pt-3">
      <button
        className="w-full flex items-center justify-between text-left group"
        onClick={() => setOpen(o => !o)}
        data-testid={`feedback-toggle-${scope}`}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Feedback & Notes
          </span>
          {existingFeedback.length > 0 && (
            <Badge variant="secondary" className="text-[10px] py-0">{existingFeedback.length}</Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {/* Existing feedback items */}
          {existingFeedback.length > 0 && (
            <div className="space-y-2">
              {[...existingFeedback].reverse().map((item) => (
                <div key={item.id} className="border rounded-lg p-3 bg-muted/20 space-y-2 relative group/item">
                  <button
                    onClick={() => deleteFeedback(item.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover/item:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                    data-testid={`delete-feedback-${item.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {item.text && <p className="text-xs leading-relaxed">{item.text}</p>}
                  {item.files?.length > 0 && (
                    <div className="space-y-2">
                      {item.files.map((f) => (
                        <div key={f.id}>
                          {f.type === 'image' && f.dataUrl && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <Image className="h-3 w-3" /> {f.name}
                              </div>
                              <img src={f.dataUrl} alt={f.name} className="max-w-full rounded border max-h-64 object-contain bg-muted/30" />
                            </div>
                          )}
                          {f.type === 'spreadsheet' && f.rows && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <Table2 className="h-3 w-3" /> {f.name}
                              </div>
                              <SpreadsheetPreview rows={f.rows} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new feedback */}
          <div className="border rounded-lg overflow-hidden">
            {/* Drop zone */}
            <div
              className={`relative border-b p-2 transition-colors ${isDragging ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700' : 'bg-muted/20'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {pendingFiles.length === 0 ? (
                <button
                  className="w-full flex flex-col items-center gap-1.5 py-3 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid={`dropzone-${scope}`}
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-[11px]">Drop screenshots or spreadsheets here, or click to browse</span>
                  <span className="text-[10px] text-muted-foreground/60">PNG, JPG, XLSX, XLS, CSV</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} attached</span>
                    <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      <Upload className="h-3 w-3" /> Add more
                    </button>
                  </div>
                  {pendingFiles.map((f) => (
                    <div key={f.id} className="relative">
                      {f.type === 'image' && f.dataUrl && (
                        <div className="relative inline-block">
                          <img src={f.dataUrl} alt={f.name} className="max-h-32 max-w-full rounded border object-contain bg-white dark:bg-black/20" />
                          <button onClick={() => removeFile(f.id)} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      )}
                      {f.type === 'spreadsheet' && f.rows && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <Table2 className="h-3 w-3" /> {f.name}
                            </div>
                            <button onClick={() => removeFile(f.id)} className="text-muted-foreground hover:text-red-500">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <SpreadsheetPreview rows={f.rows.slice(0, 5)} />
                          {f.rows.length > 5 && <p className="text-[10px] text-muted-foreground">+{f.rows.length - 5} more rows (will be saved in full)</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.xlsx,.xls,.csv"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {/* Text area */}
            <div className="relative bg-background">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={listening ? 'Listening…' : 'Add your feedback, notes, or context here…'}
                className={`w-full px-3 py-2.5 text-xs resize-none bg-transparent outline-none placeholder:text-muted-foreground/60 min-h-[72px] ${listening ? 'bg-red-50/20 dark:bg-red-950/10' : ''}`}
                data-testid={`feedback-textarea-${scope}`}
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <button
                  onClick={toggleVoice}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    listening
                      ? 'bg-red-500 text-white border-red-500 animate-pulse'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                  }`}
                  data-testid={`voice-btn-${scope}`}
                >
                  {listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  {listening ? 'Stop' : 'Speak'}
                </button>
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1 px-2.5"
                  onClick={handleSave}
                  disabled={saving || (!text.trim() && pendingFiles.length === 0)}
                  data-testid={`feedback-save-${scope}`}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {saving ? 'Saving…' : 'Save Note'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

interface ClientActivationPanelProps {
  client: Client;
}

export default function ClientActivationPanel({ client }: ClientActivationPanelProps) {
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const dispatch = useDispatch();
  const [generatingScope, setGeneratingScope] = useState<WorkstreamScope | null>(null);
  const [openWorkstream, setOpenWorkstream] = useState<WorkstreamScope | null>(null);

  const plan = client.activationPlan;

  const generateWorkstream = useCallback(async (scope: WorkstreamScope) => {
    if (!orgId || !authReady || !plan) return;
    setGeneratingScope(scope);

    const token = await auth.currentUser?.getIdToken();
    const endpoint = scope === 'website' ? 'website-workstream' : scope === 'gbp' ? 'gbp-workstream' : null;
    if (!endpoint) {
      setGeneratingScope(null);
      return;
    }

    try {
      const res = await fetch(`/api/clients/${client.id}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const updatedPlan = {
        ...plan,
        workstreams: {
          ...plan.workstreams,
          [scope]: { ...plan.workstreams[scope], status: 'ready_for_review', updatedAt: new Date().toISOString() },
        },
        [`${scope}Workstream`]: data.workstream,
      };

      dispatch(updateClient({ ...client, activationPlan: updatedPlan }));
      setOpenWorkstream(scope);
      toast({ title: 'Workstream ready', description: `${SCOPE_CONFIG[scope].label} plan generated — ready for review.` });
    } catch (err: any) {
      console.error(`[${scope}-workstream]`, err);
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingScope(null);
    }
  }, [orgId, authReady, client, plan, dispatch, toast]);

  const handleTaskToggle = useCallback(async (taskId: string, done: boolean) => {
    if (!orgId || !authReady || !plan) return;
    const tasks = plan.gbpWorkstream?.tasks || [];
    const updated = tasks.map(t => t.id === taskId ? { ...t, done } : t);
    const updatedPlan = {
      ...plan,
      gbpWorkstream: { ...plan.gbpWorkstream, tasks: updated },
    };
    dispatch(updateClient({ ...client, activationPlan: updatedPlan }));
    try {
      await updateClientInFirestore(orgId, client.id, {
        'activationPlan.gbpWorkstream.tasks': updated,
      } as any, authReady);
    } catch (err) {
      console.error('[task-toggle]', err);
    }
  }, [orgId, authReady, client, plan, dispatch]);

  if (!plan) return null;

  const completedScopes = plan.selectedScope.filter(s => {
    const ws = plan.workstreams[s];
    return ws && (ws.status === 'ready_for_review' || ws.status === 'approved' || ws.status === 'live' || ws.status === 'optimising');
  });

  return (
    <div className="border rounded-lg overflow-hidden mb-3" data-testid="client-activation-panel">
      {/* Header */}
      <div className="px-3 py-2.5 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-semibold">Client Execution Plan</span>
            <Badge variant="secondary" className="text-[10px] py-0">
              {completedScopes.length}/{plan.selectedScope.length} active
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Activated {new Date(plan.activatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </div>
        </div>

        {/* Progress pills */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {plan.selectedScope.map(scope => {
            const cfg = SCOPE_CONFIG[scope];
            const ws = plan.workstreams[scope];
            const Icon = cfg.icon;
            return (
              <span key={scope} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                ws?.status === 'ready_for_review' || ws?.status === 'approved' || ws?.status === 'live'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : ws?.status === 'generating'
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'border-border bg-muted/60 text-muted-foreground'
              }`}>
                <Icon className="h-2.5 w-2.5" />
                {cfg.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Workstream cards */}
      <div className="divide-y">
        {plan.selectedScope.map(scope => {
          const cfg = SCOPE_CONFIG[scope];
          const ws = plan.workstreams[scope];
          const Icon = cfg.icon;
          const isOpen = openWorkstream === scope;
          const isManualGenerating = generatingScope === scope;
          const isAutoGenerating = ws?.status === 'generating';
          const isGenerating = isManualGenerating || isAutoGenerating;
          const hasOutput = scope === 'website' ? !!plan.websiteWorkstream : scope === 'gbp' ? !!plan.gbpWorkstream : false;
          const canGenerate = (scope === 'website' || scope === 'gbp') && !hasOutput && !isAutoGenerating;
          const wsState = ws?.status || 'queued';

          return (
            <div key={scope} className="bg-background">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                onClick={() => setOpenWorkstream(isOpen ? null : scope)}
                data-testid={`workstream-${scope}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium">{cfg.label}</p>
                    <StatusPill status={wsState} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canGenerate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] gap-1 px-2"
                      onClick={(e) => { e.stopPropagation(); generateWorkstream(scope); }}
                      disabled={!!generatingScope}
                      data-testid={`button-generate-${scope}`}
                    >
                      {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      {isGenerating ? 'Generating…' : 'Generate'}
                    </Button>
                  )}
                  {hasOutput && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                      'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30'
                    }`}>
                      <Eye className="h-2.5 w-2.5 inline mr-0.5" />Review
                    </span>
                  )}
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 bg-muted/10 border-t">
                  {scope === 'website' && (
                    hasOutput
                      ? <WebsiteWorkstreamOutput client={client} />
                      : (
                        <div className="py-4 text-center space-y-2">
                          <Globe className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                          <p className="text-xs text-muted-foreground">Generate the website workstream to see the brief, page structure and homepage content.</p>
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => generateWorkstream(scope)}
                            disabled={!!generatingScope}
                            data-testid="button-generate-website-empty"
                          >
                            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {isGenerating ? 'Generating…' : 'Generate Website Plan'}
                          </Button>
                        </div>
                      )
                  )}
                  {scope === 'gbp' && (
                    hasOutput
                      ? <GBPWorkstreamOutput client={client} onTaskToggle={handleTaskToggle} />
                      : (
                        <div className="py-4 text-center space-y-2">
                          <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                          <p className="text-xs text-muted-foreground">Generate the GBP plan to get an active optimisation task list, content calendar and review strategy.</p>
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => generateWorkstream(scope)}
                            disabled={!!generatingScope}
                            data-testid="button-generate-gbp-empty"
                          >
                            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {isGenerating ? 'Generating…' : 'Generate GBP Plan'}
                          </Button>
                        </div>
                      )
                  )}
                  {(scope === 'seo' || scope === 'ads') && (
                    <div className="py-3 text-center space-y-1">
                      <AlertTriangle className="h-6 w-6 text-muted-foreground/30 mx-auto" />
                      <p className="text-xs text-muted-foreground">
                        {scope === 'seo' ? 'SEO workstream' : 'Ads workstream'} planning coming soon. Use the {scope === 'seo' ? 'SEO Engine' : 'Ads Engine'} panel in the meantime.
                      </p>
                    </div>
                  )}
                  <WorkstreamFeedback
                    client={client}
                    scope={scope}
                    orgId={orgId}
                    authReady={authReady}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

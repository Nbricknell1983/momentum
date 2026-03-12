import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/lib/types';
import { auth } from '@/lib/firebase';
import { format } from 'date-fns';
import {
  Plus, Trash2, ExternalLink, Copy, CheckCircle2, Loader2,
  TrendingUp, Eye, MousePointerClick, ChevronDown, ChevronUp,
} from 'lucide-react';

interface GenerateReportDialogProps {
  client: Client;
  orgId: string;
  open: boolean;
  onClose: () => void;
}

interface CompletedWorkItem { title: string; description: string; }
interface NextStepItem { title: string; description: string; whyItMatters: string; }
interface OpportunityItem { title: string; description: string; }
interface MonthlyDataItem { month: string; clicks: number; impressions: number; position?: number; }

const DEFAULT_WHY_CALLS_LOW = [
  { title: 'Rankings are improving, but not yet in the strongest positions', description: 'Moving from not ranking to page 2 is genuine progress, but page 2 typically does not generate the same enquiry volume as page 1. The gap is closer than it was — but the biggest commercial lift comes when key terms move to the top of page 1.' },
  { title: 'Competitive searches need stronger authority to convert consistently', description: 'In competitive markets, Google often rewards businesses with stronger content depth, trust signals, backlinks, and local authority. Building that authority takes time and deliberate strategy.' },
  { title: 'Traffic does not always equal enquiries', description: 'Even when Google sends visitors, enquiries depend on page intent, trust signals, offer clarity, and conversion strength. The page needs to earn the enquiry once someone arrives — not just attract the visit.' },
  { title: 'SEO momentum builds before enquiries noticeably lift', description: 'The early phase of SEO can feel slow commercially. It is often where the most important groundwork gets laid, setting up stronger enquiry growth as rankings reach page 1.' },
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function GenerateReportDialog({ client, orgId, open, onClose }: GenerateReportDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string>('basics');

  const now = new Date();
  const [period, setPeriod] = useState(format(now, 'MMMM yyyy'));
  const [location, setLocation] = useState(client.areaName || client.regionName || '');
  const [clientMessage, setClientMessage] = useState('A clear view of what has been improved, what progress is showing in Google, and what still needs to happen to turn visibility into more enquiries.');

  // Status pills
  const [pills, setPills] = useState([
    { label: 'Foundations Improved', status: 'positive' as const },
    { label: 'Visibility Growing', status: 'growing' as const },
    { label: 'Enquiry Growth Still to Unlock', status: 'pending' as const },
  ]);

  // Performance metrics
  const [metrics, setMetrics] = useState([
    { label: 'Google Search Clicks', value: '', trend: 'increasing' as const, description: 'Visitors that clicked through from Google search results' },
    { label: 'Search Appearances', value: '', trend: 'increasing' as const, description: 'Times the site appeared in Google search results' },
    { label: 'Avg. Position', value: '', trend: 'improving' as const, description: 'Current average ranking position' },
  ]);

  // Monthly data (last 6 months)
  const [monthlyData, setMonthlyData] = useState<MonthlyDataItem[]>(
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - (5 - i));
      return { month: MONTH_LABELS[d.getMonth()], clicks: 0, impressions: 0, position: undefined };
    })
  );

  // Featured keyword
  const [keyword, setKeyword] = useState('');
  const [startPos, setStartPos] = useState('Not Ranking');
  const [currentPos, setCurrentPos] = useState('');
  const [targetPos, setTargetPos] = useState('Top 10');

  // Completed work
  const [completedWork, setCompletedWork] = useState<CompletedWorkItem[]>([
    { title: 'Page Titles, Meta & Headings', description: 'Improved page titles, meta descriptions and headings to better match how customers search.' },
    { title: 'Google Business Profile', description: 'Optimised categories, services and tracking links on the Google Business Profile for stronger local visibility.' },
  ]);

  // Next steps
  const [nextSteps, setNextSteps] = useState<NextStepItem[]>([
    { title: '', description: '', whyItMatters: '' },
  ]);

  // Opportunities
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([
    { title: '', description: '' },
  ]);

  // Summary
  const [summaryPoints, setSummaryPoints] = useState([
    { text: 'The technical and structural SEO foundations are now stronger' },
    { text: 'Google is showing the site more often in search results' },
    { text: 'Rankings have improved for competitive local terms' },
    { text: 'The current gap is between visibility and consistent page 1 presence' },
    { text: 'The next phase is focused on closing that gap and driving more enquiries' },
  ]);
  const [closingStatement, setClosingStatement] = useState('The campaign is progressing, but the commercial goal is still ahead of us. The work completed so far has improved the foundation and visibility — the next step is converting that momentum into page 1 rankings and stronger enquiry volume.');

  const toggleSection = (s: string) => setExpandedSection(prev => prev === s ? '' : s);

  async function handleGenerate() {
    if (!keyword || !currentPos) {
      toast({ title: 'Missing info', description: 'Please enter the featured keyword and current position.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();

      const payload = {
        orgId,
        clientId: client.id,
        clientName: client.businessName,
        location,
        period,
        clientMessage,
        statusPills: pills,
        performanceMetrics: metrics.filter(m => m.value.trim()),
        monthlyData: monthlyData.filter(d => d.clicks > 0 || d.impressions > 0),
        completedWork: completedWork.filter(w => w.title.trim()),
        whyCallsAreLow: DEFAULT_WHY_CALLS_LOW,
        featuredKeyword: { keyword, startingPosition: startPos, currentPosition: currentPos, targetPosition: targetPos },
        nextSteps: nextSteps.filter(s => s.title.trim()).map((s, i) => ({ ...s, step: i + 1 })),
        opportunities: opportunities.filter(o => o.title.trim()),
        summaryPoints: summaryPoints.filter(p => p.text.trim()),
        closingStatement,
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create report');

      const fullUrl = `${window.location.origin}/report/${data.id}`;
      setGeneratedUrl(fullUrl);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate report', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const SectionHeader = ({ id, label, children }: { id: string; label: string; children?: React.ReactNode }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between py-3 px-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
    >
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {children}
        {expandedSection === id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>
    </button>
  );

  if (generatedUrl) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report Ready</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
              <p className="font-semibold text-green-800">Your client report is live!</p>
              <p className="text-sm text-green-700">Share this link with {client.businessName}. It's public — no login required.</p>
            </div>
            <div className="flex gap-2">
              <Input value={generatedUrl} readOnly className="text-xs font-mono" />
              <Button size="icon" variant="outline" onClick={handleCopy} data-testid="button-copy-report-url">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="outline" asChild>
                <a href={generatedUrl} target="_blank" rel="noopener noreferrer" data-testid="button-open-report">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setGeneratedUrl(null)}>Create Another</Button>
              <Button className="flex-1" onClick={onClose}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Client Report — {client.businessName}</DialogTitle>
          <p className="text-sm text-muted-foreground">Creates a shareable URL with a beautiful strategy report for your client.</p>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* Basics */}
          <div>
            <SectionHeader id="basics" label="Report Details" />
            {expandedSection === 'basics' && (
              <div className="border border-border rounded-lg p-4 mt-1 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Period (e.g. March 2026)</Label>
                    <Input value={period} onChange={e => setPeriod(e.target.value)} className="mt-1" data-testid="input-report-period" />
                  </div>
                  <div>
                    <Label className="text-xs">Location</Label>
                    <Input value={location} onChange={e => setLocation(e.target.value)} className="mt-1" placeholder="e.g. Brisbane" data-testid="input-report-location" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Opening Message</Label>
                  <Textarea value={clientMessage} onChange={e => setClientMessage(e.target.value)} className="mt-1 text-sm" rows={2} data-testid="input-report-message" />
                </div>
              </div>
            )}
          </div>

          {/* Performance Metrics */}
          <div>
            <SectionHeader id="metrics" label="Performance Metrics" />
            {expandedSection === 'metrics' && (
              <div className="border border-border rounded-lg p-4 mt-1 space-y-4">
                {metrics.map((m, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center gap-2">
                      {i === 0 && <MousePointerClick className="h-4 w-4 text-violet-600" />}
                      {i === 1 && <Eye className="h-4 w-4 text-violet-600" />}
                      {i === 2 && <TrendingUp className="h-4 w-4 text-violet-600" />}
                      <span className="text-sm font-medium">{m.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Value</Label>
                        <Input
                          value={m.value}
                          onChange={e => setMetrics(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                          placeholder={i === 0 ? '522' : i === 1 ? '14,600' : '~22'}
                          className="mt-1"
                          data-testid={`input-metric-value-${i}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Trend</Label>
                        <select
                          value={m.trend}
                          onChange={e => setMetrics(prev => prev.map((x, j) => j === i ? { ...x, trend: e.target.value as any } : x))}
                          className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                        >
                          <option value="increasing">Increasing</option>
                          <option value="decreasing">Decreasing</option>
                          <option value="stable">Stable / Improving</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="border-t pt-3">
                  <Label className="text-xs font-semibold">Monthly Data (last 6 months)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Used for trend charts. Leave blank to skip charts.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left py-1 pr-2">Month</th>
                          <th className="text-left py-1 pr-2">Clicks</th>
                          <th className="text-left py-1 pr-2">Impressions</th>
                          <th className="text-left py-1">Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.map((row, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-2 font-medium text-foreground">{row.month}</td>
                            <td className="py-1 pr-2">
                              <Input
                                type="number"
                                value={row.clicks || ''}
                                onChange={e => setMonthlyData(prev => prev.map((r, j) => j === i ? { ...r, clicks: Number(e.target.value) } : r))}
                                className="h-7 text-xs"
                                placeholder="0"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <Input
                                type="number"
                                value={row.impressions || ''}
                                onChange={e => setMonthlyData(prev => prev.map((r, j) => j === i ? { ...r, impressions: Number(e.target.value) } : r))}
                                className="h-7 text-xs"
                                placeholder="0"
                              />
                            </td>
                            <td className="py-1">
                              <Input
                                type="number"
                                value={row.position || ''}
                                onChange={e => setMonthlyData(prev => prev.map((r, j) => j === i ? { ...r, position: e.target.value ? Number(e.target.value) : undefined } : r))}
                                className="h-7 text-xs"
                                placeholder="—"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Featured Keyword */}
          <div>
            <SectionHeader id="keyword" label="Featured Keyword" >
              {!keyword && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
            </SectionHeader>
            {expandedSection === 'keyword' && (
              <div className="border border-border rounded-lg p-4 mt-1 space-y-3">
                <div>
                  <Label className="text-xs">Keyword *</Label>
                  <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. Cosmetic Injectables Brisbane" className="mt-1" data-testid="input-keyword" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Starting position</Label>
                    <Input value={startPos} onChange={e => setStartPos(e.target.value)} placeholder="Not Ranking" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Current position *</Label>
                    <Input value={currentPos} onChange={e => setCurrentPos(e.target.value)} placeholder="~22" className="mt-1" data-testid="input-current-position" />
                  </div>
                  <div>
                    <Label className="text-xs">Target</Label>
                    <Input value={targetPos} onChange={e => setTargetPos(e.target.value)} placeholder="Top 10" className="mt-1" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Completed Work */}
          <div>
            <SectionHeader id="work" label={`Work Completed (${completedWork.length})`} />
            {expandedSection === 'work' && (
              <div className="border border-border rounded-lg p-4 mt-1 space-y-3">
                {completedWork.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Input value={item.title} onChange={e => setCompletedWork(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Work item title" className="text-sm" />
                      <Textarea value={item.description} onChange={e => setCompletedWork(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Brief description" className="text-sm" rows={2} />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setCompletedWork(prev => prev.filter((_, j) => j !== i))} className="shrink-0 mt-1">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setCompletedWork(prev => [...prev, { title: '', description: '' }])} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Work Item
                </Button>
              </div>
            )}
          </div>

          {/* Next Steps */}
          <div>
            <SectionHeader id="nextsteps" label={`Next Steps (${nextSteps.filter(s => s.title).length})`} />
            {expandedSection === 'nextsteps' && (
              <div className="border border-border rounded-lg p-4 mt-1 space-y-4">
                {nextSteps.map((step, i) => (
                  <div key={i} className="space-y-1.5 pb-3 border-b border-border last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-muted-foreground">Step {i + 1}</Label>
                      <Button size="icon" variant="ghost" onClick={() => setNextSteps(prev => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <Input value={step.title} onChange={e => setNextSteps(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Step title" className="text-sm" />
                    <Textarea value={step.description} onChange={e => setNextSteps(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="What we'll do" className="text-sm" rows={2} />
                    <Textarea value={step.whyItMatters} onChange={e => setNextSteps(prev => prev.map((x, j) => j === i ? { ...x, whyItMatters: e.target.value } : x))} placeholder="Why this matters (shown in purple panel)" className="text-sm" rows={2} />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setNextSteps(prev => [...prev, { title: '', description: '', whyItMatters: '' }])} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Step
                </Button>
              </div>
            )}
          </div>

          {/* Opportunities */}
          <div>
            <SectionHeader id="opps" label={`Growth Opportunities (${opportunities.filter(o => o.title).length})`} />
            {expandedSection === 'opps' && (
              <div className="border border-border rounded-lg p-4 mt-1 space-y-3">
                {opportunities.map((opp, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Input value={opp.title} onChange={e => setOpportunities(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Opportunity title" className="text-sm" />
                      <Textarea value={opp.description} onChange={e => setOpportunities(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description" className="text-sm" rows={2} />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setOpportunities(prev => prev.filter((_, j) => j !== i))} className="shrink-0 mt-1">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setOpportunities(prev => [...prev, { title: '', description: '' }])} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Opportunity
                </Button>
              </div>
            )}
          </div>

          {/* Summary */}
          <div>
            <SectionHeader id="summary" label="Summary" />
            {expandedSection === 'summary' && (
              <div className="border border-border rounded-lg p-4 mt-1 space-y-3">
                <Label className="text-xs">Summary Points</Label>
                {summaryPoints.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={p.text} onChange={e => setSummaryPoints(prev => prev.map((x, j) => j === i ? { text: e.target.value } : x))} placeholder="Summary point" className="text-sm flex-1" />
                    <Button size="icon" variant="ghost" onClick={() => setSummaryPoints(prev => prev.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setSummaryPoints(prev => [...prev, { text: '' }])} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Point
                </Button>
                <div>
                  <Label className="text-xs">Closing Statement</Label>
                  <Textarea value={closingStatement} onChange={e => setClosingStatement(e.target.value)} className="mt-1 text-sm" rows={3} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleGenerate} disabled={saving} className="flex-1 gap-2" data-testid="button-generate-report">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><ExternalLink className="h-4 w-4" /> Generate Report URL</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

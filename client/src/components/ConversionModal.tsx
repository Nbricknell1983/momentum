import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Globe, MapPin, Search, Megaphone, CheckCircle2, Sparkles,
  Trophy, Building2, ChevronRight, Loader2, TrendingUp,
} from 'lucide-react';
import { Lead, WorkstreamScope } from '@/lib/types';

interface ConversionModalProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onConfirm: (mrr: number, selectedScope: WorkstreamScope[]) => Promise<void>;
}

const SCOPE_OPTIONS: {
  id: WorkstreamScope;
  label: string;
  description: string;
  icon: typeof Globe;
  color: string;
  bgColor: string;
}[] = [
  {
    id: 'website',
    label: 'Website Build',
    description: 'High-converting site with local SEO, CTAs and service pages',
    icon: Globe,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
  },
  {
    id: 'gbp',
    label: 'GBP / Local Visibility',
    description: 'Active Google Business Profile optimisation and Maps Pack growth',
    icon: MapPin,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800',
  },
  {
    id: 'seo',
    label: 'SEO & Content',
    description: 'Organic search growth through targeted content and technical SEO',
    icon: Search,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800',
  },
  {
    id: 'ads',
    label: 'Paid Ads',
    description: 'Google Ads campaigns optimised for lead generation',
    icon: Megaphone,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
  },
];

function IntelligenceHighlight({ lead }: { lead: Lead }) {
  const items: string[] = [];

  const si = lead.strategyIntelligence;
  if (si) {
    if ((si as any).topPriority) items.push((si as any).topPriority);
    if ((si as any).primaryGap) items.push((si as any).primaryGap);
    if ((si as any).immediateOpportunity) items.push((si as any).immediateOpportunity);
  }

  const gp = lead.growthPrescription;
  if (gp && !items.length) {
    if ((gp as any).topRecommendation) items.push((gp as any).topRecommendation);
  }

  const prep = lead.prepCallPack;
  if (prep && !items.length) {
    if (prep.keyOpportunity) items.push(prep.keyOpportunity);
    if (prep.primaryGap) items.push(prep.primaryGap);
    if (prep.strategicAngle) items.push(prep.strategicAngle);
  }

  const diagnosis = lead.aiGrowthPlan?.strategyDiagnosis;
  if (diagnosis?.gaps?.length && !items.length) {
    diagnosis.gaps.slice(0, 2).forEach((g: any) => {
      if (g.title) items.push(g.title);
    });
  }

  if (!items.length && !lead.strategyIntelligence && !lead.prepCallPack) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Intelligence captured
      </p>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.slice(0, 3).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <span>Strategy intelligence, prep pack &amp; evidence bundle captured</span>
        </div>
      )}
    </div>
  );
}

export default function ConversionModal({ lead, open, onClose, onConfirm }: ConversionModalProps) {
  const [mrr, setMrr] = useState<string>(lead.mrr ? String(lead.mrr) : '');
  const [selectedScope, setSelectedScope] = useState<WorkstreamScope[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const hasIntelligence = !!(
    lead.strategyIntelligence || lead.prepCallPack || lead.growthPrescription || lead.aiGrowthPlan
  );

  const toggleScope = (id: WorkstreamScope) => {
    setSelectedScope(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(parseFloat(mrr) || 0, selectedScope);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isConfirming) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="conversion-modal">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <DialogTitle className="text-base">Activate client — {lead.companyName}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Choose delivery scope to launch execution workstreams immediately.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Intelligence carry-over */}
          {hasIntelligence && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                Lead intelligence will be carried into the client record
              </div>
              <IntelligenceHighlight lead={lead} />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {lead.strategyIntelligence && (
                  <Badge variant="secondary" className="text-[10px] py-0">Strategy intel</Badge>
                )}
                {lead.prepCallPack && (
                  <Badge variant="secondary" className="text-[10px] py-0">Prep pack</Badge>
                )}
                {lead.growthPrescription && (
                  <Badge variant="secondary" className="text-[10px] py-0">Growth prescription</Badge>
                )}
                {lead.aiGrowthPlan?.strategyDiagnosis && (
                  <Badge variant="secondary" className="text-[10px] py-0">Strategy diagnosis</Badge>
                )}
                {lead.website && (
                  <Badge variant="secondary" className="text-[10px] py-0">
                    <Globe className="h-2.5 w-2.5 mr-1" />Website presence data
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* MRR */}
          <div className="space-y-1.5">
            <Label htmlFor="conv-mrr" className="text-xs font-medium">
              Monthly retainer value (optional)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                id="conv-mrr"
                type="number"
                min={0}
                placeholder="0"
                value={mrr}
                onChange={e => setMrr(e.target.value)}
                className="pl-6 h-8 text-sm"
                data-testid="input-conversion-mrr"
              />
            </div>
          </div>

          <Separator />

          {/* Scope selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Select delivery scope</p>
              {selectedScope.length > 0 && (
                <span className="text-xs text-muted-foreground">{selectedScope.length} selected</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = selectedScope.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleScope(opt.id)}
                    data-testid={`scope-${opt.id}`}
                    className={`relative text-left rounded-lg border-2 p-3 transition-all ${
                      active
                        ? `${opt.bgColor} border-current`
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                    }`}
                  >
                    {active && (
                      <CheckCircle2 className={`absolute top-2 right-2 h-4 w-4 ${opt.color}`} />
                    )}
                    <div className={`flex items-center gap-1.5 mb-1 ${active ? opt.color : 'text-foreground'}`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{opt.description}</p>
                  </button>
                );
              })}
            </div>
            {selectedScope.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-1">
                Select at least one scope to activate execution workstreams — or skip to convert without scope.
              </p>
            )}
          </div>

          {/* Execution preview */}
          {selectedScope.length > 0 && (
            <div className="rounded-md bg-muted/40 border px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
                On activation, these workstreams will be queued:
              </div>
              {selectedScope.map(s => {
                const opt = SCOPE_OPTIONS.find(o => o.id === s)!;
                const Icon = opt.icon;
                return (
                  <div key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <Icon className={`h-3 w-3 shrink-0 ${opt.color}`} />
                    <span>{opt.label}</span>
                    <span className="ml-auto">
                      <Badge variant="outline" className="text-[10px] py-0">Queued</Badge>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isConfirming}
            data-testid="button-conversion-cancel"
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            {selectedScope.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConfirm()}
                disabled={isConfirming}
                data-testid="button-conversion-skip"
              >
                Convert without scope
              </Button>
            )}
            {selectedScope.length > 0 && (
              <Button
                size="sm"
                onClick={() => handleConfirm()}
                disabled={isConfirming}
                className="gap-1.5"
                data-testid="button-conversion-confirm"
              >
                {isConfirming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trophy className="h-3.5 w-3.5" />
                )}
                {isConfirming ? 'Activating…' : `Activate client`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import {
  X, ArrowLeft, ArrowRight, Eye, BarChart3,
  TrendingUp, Zap, CheckSquare, DollarSign, ShieldX, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Lead, STAGE_LABELS, CONVERSATION_STAGE_LABELS,
  CONVERSATION_STAGE_COLORS, getTrafficLightStatus,
} from '@/lib/types';
import { calculateDealMomentumScore, MOMENTUM_STATUS_COLORS } from '@/lib/dealMomentumScore';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import TrafficLight from './TrafficLight';
import LeadCardExpanded from './LeadCardExpanded';
import ConversationIntelligence from './ConversationIntelligence';
import DealIntelligencePanel from './DealIntelligencePanel';
import GrowthPlanWorkspace from './GrowthPlanWorkspace';
import DealLiveActivityFeed from './DealLiveActivityFeed';
import LeadVisibilityGapPanel from './LeadVisibilityGapPanel';
import DigitalGrowthPlanPanel from './DigitalGrowthPlanPanel';
import SalesNextBestActionPanel from './SalesNextBestActionPanel';
import ProposalReadinessPanel from './ProposalReadinessPanel';
import LeadStrategyReportPanel from './LeadStrategyReportPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CenterView =
  | 'deal_intelligence'
  | 'visibility'
  | 'growth_plan'
  | 'sales_actions'
  | 'readiness'
  | 'calculator'
  | 'strategy_report';

interface TabDef {
  id:    CenterView;
  label: string;
  icon:  typeof Eye;
  shortLabel?: string;
}

const TABS: TabDef[] = [
  { id: 'deal_intelligence', label: 'Deal Intelligence', shortLabel: 'Intel',    icon: Eye },
  { id: 'visibility',        label: 'Visibility Gaps',   shortLabel: 'Gaps',     icon: ShieldX },
  { id: 'growth_plan',       label: 'Growth Plan',       shortLabel: 'Plan',     icon: TrendingUp },
  { id: 'sales_actions',     label: 'Sales Actions',     shortLabel: 'Actions',  icon: Zap },
  { id: 'readiness',         label: 'Readiness',         shortLabel: 'Ready',    icon: CheckSquare },
  { id: 'calculator',        label: 'ROI Calculator',    shortLabel: 'ROI',      icon: DollarSign },
  { id: 'strategy_report',   label: 'Strategy Report',   shortLabel: 'Strategy', icon: FileText },
];

interface LeadFocusViewProps {
  lead:               Lead;
  onClose:            () => void;
  onNavigate?:        (direction: 'prev' | 'next') => void;
  hasPrev?:           boolean;
  hasNext?:           boolean;
  onConvertToClient?: (lead: Lead) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeadFocusView({
  lead, onClose, onNavigate, hasPrev, hasNext, onConvertToClient,
}: LeadFocusViewProps) {
  const activities     = useSelector((state: RootState) => state.app.activities);
  const momentumResult = calculateDealMomentumScore(lead, activities);
  const trafficStatus  = getTrafficLightStatus(lead);

  const [centerView, setCenterView] = useState<CenterView>('deal_intelligence');

  // Reset to deal intelligence when switching leads
  useEffect(() => { setCenterView('deal_intelligence'); }, [lead.id]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (isEditable) return;
      if (e.key === 'ArrowLeft'  && onNavigate && hasPrev) onNavigate('prev');
      if (e.key === 'ArrowRight' && onNavigate && hasNext) onNavigate('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate, hasPrev, hasNext]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ---------------------------------------------------------------------------
  // Center panel content
  // ---------------------------------------------------------------------------

  function renderCenter() {
    switch (centerView) {
      case 'deal_intelligence':
        return (
          <ScrollArea className="h-full">
            <DealIntelligencePanel lead={lead} />
          </ScrollArea>
        );
      case 'visibility':
        return (
          <ScrollArea className="h-full">
            <div className="p-4">
              <LeadVisibilityGapPanel lead={lead} />
            </div>
          </ScrollArea>
        );
      case 'growth_plan':
        return (
          <ScrollArea className="h-full">
            <div className="p-4">
              <DigitalGrowthPlanPanel lead={lead} />
            </div>
          </ScrollArea>
        );
      case 'sales_actions':
        return (
          <ScrollArea className="h-full">
            <div className="p-4">
              <SalesNextBestActionPanel lead={lead} />
            </div>
          </ScrollArea>
        );
      case 'readiness':
        return (
          <ScrollArea className="h-full">
            <div className="p-4">
              <ProposalReadinessPanel lead={lead} />
            </div>
          </ScrollArea>
        );
      case 'calculator':
        return (
          <GrowthPlanWorkspace
            lead={lead}
            onBack={() => setCenterView('deal_intelligence')}
          />
        );
      case 'strategy_report':
        return (
          <ScrollArea className="h-full">
            <div className="p-4">
              <LeadStrategyReportPanel
                lead={lead}
                orgId={(lead as any).orgId || ''}
                preparedBy={(lead as any).assignedTo || ''}
                preparedByEmail={(lead as any).assignedToEmail || ''}
                phone={(lead as any).phone || ''}
              />
            </div>
          </ScrollArea>
        );
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="lead-focus-view">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 shrink-0"
            data-testid="button-close-focus"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold truncate" data-testid="text-focus-lead-name">
                {lead.companyName}
              </h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${MOMENTUM_STATUS_COLORS[momentumResult.status]}`}
                data-testid="badge-focus-momentum"
              >
                {momentumResult.score} {momentumResult.label}
              </span>
              {lead.conversationStage && lead.conversationStage !== 'not_started' && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: CONVERSATION_STAGE_COLORS[lead.conversationStage] }}
                >
                  {CONVERSATION_STAGE_LABELS[lead.conversationStage]}
                </span>
              )}
              <TrafficLight status={trafficStatus} size="sm" />
              <Badge variant="outline" className="text-xs">{STAGE_LABELS[lead.stage]}</Badge>
            </div>
            {(lead.address || lead.territory) && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {lead.address || lead.territory}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onNavigate && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onNavigate('prev')}
                disabled={!hasPrev}
                className="h-8 w-8"
                data-testid="button-focus-prev"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onNavigate('next')}
                disabled={!hasNext}
                className="h-8 w-8"
                data-testid="button-focus-next"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Main body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel: lead card + conversation */}
        <ScrollArea className="w-[340px] shrink-0 border-r">
          <div className="p-4 space-y-4">
            <ConversationIntelligence lead={lead} />
            <LeadCardExpanded
              lead={lead}
              isExpanded={true}
              onToggle={onClose}
              focusMode={true}
              onConvertToClient={onConvertToClient}
            />
          </div>
        </ScrollArea>

        {/* Center panel: tabbed intelligence views */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b bg-background shrink-0 overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = centerView === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCenterView(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{tab.label}</span>
                  <span className="lg:hidden">{tab.shortLabel ?? tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0">
            {renderCenter()}
          </div>
        </div>

        {/* Right panel: live activity feed */}
        <div className="w-[340px] shrink-0 border-l bg-muted/5 flex flex-col min-h-0">
          <DealLiveActivityFeed lead={lead} />
        </div>
      </div>
    </div>
  );
}

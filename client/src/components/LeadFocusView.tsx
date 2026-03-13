import { useState, useEffect, useCallback } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Lead, STAGE_LABELS, CONVERSATION_STAGE_LABELS, CONVERSATION_STAGE_COLORS, getTrafficLightStatus } from '@/lib/types';
import { calculateDealMomentumScore, MOMENTUM_STATUS_COLORS } from '@/lib/dealMomentumScore';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import TrafficLight from './TrafficLight';
import LeadCardExpanded from './LeadCardExpanded';
import AISalesEngine from './AISalesEngine';
import ConversationIntelligence from './ConversationIntelligence';
import DealIntelligencePanel from './DealIntelligencePanel';
import GrowthPlanWorkspace from './GrowthPlanWorkspace';

type EngineSection = 'pre_call' | 'objection' | 'follow_up' | 'growth_plan' | 'prospect';
type CenterView = 'deal_intelligence' | 'growth_plan';

interface LeadFocusViewProps {
  lead: Lead;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export default function LeadFocusView({ lead, onClose, onNavigate, hasPrev, hasNext }: LeadFocusViewProps) {
  const activities = useSelector((state: RootState) => state.app.activities);
  const momentumResult = calculateDealMomentumScore(lead, activities);
  const trafficStatus = getTrafficLightStatus(lead);
  const [aiSection, setAiSection] = useState<EngineSection | null>(null);
  const [centerView, setCenterView] = useState<CenterView>('deal_intelligence');

  useEffect(() => {
    setAiSection(null);
    setCenterView('deal_intelligence');
  }, [lead.id]);

  const handleSectionChange = useCallback((section: EngineSection | null) => {
    if (section === 'growth_plan') {
      setCenterView('growth_plan');
    } else {
      setCenterView('deal_intelligence');
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (isEditable) return;
      if (e.key === 'ArrowLeft' && onNavigate && hasPrev) onNavigate('prev');
      if (e.key === 'ArrowRight' && onNavigate && hasNext) onNavigate('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate, hasPrev, hasNext]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="lead-focus-view">
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0" data-testid="button-close-focus">
            <X className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold truncate" data-testid="text-focus-lead-name">{lead.companyName}</h2>
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
              <p className="text-sm text-muted-foreground truncate mt-0.5">{lead.address || lead.territory}</p>
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

      <div className="flex flex-1 min-h-0">
        <ScrollArea className="w-[380px] shrink-0">
          <div className="p-4">
            <div className="mb-4">
              <ConversationIntelligence lead={lead} />
            </div>
            <LeadCardExpanded
              lead={lead}
              isExpanded={true}
              onToggle={onClose}
              focusMode={true}
              onAiSectionChange={(section) => setAiSection(section as EngineSection)}
            />
          </div>
        </ScrollArea>

        <div className="flex-1 border-l min-h-0 overflow-hidden">
          {centerView === 'growth_plan' ? (
            <GrowthPlanWorkspace
              lead={lead}
              onBack={() => setCenterView('deal_intelligence')}
            />
          ) : (
            <ScrollArea className="h-full">
              <DealIntelligencePanel lead={lead} />
            </ScrollArea>
          )}
        </div>

        <div className="w-[380px] shrink-0 border-l bg-muted/5">
          <AISalesEngine
            isOpen={true}
            onClose={() => {}}
            activeSection={aiSection}
            selectedLeadOverride={lead}
            embedded={true}
            onSectionChange={handleSectionChange}
          />
        </div>
      </div>
    </div>
  );
}

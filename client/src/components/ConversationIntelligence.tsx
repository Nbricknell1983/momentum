import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { MessageCircle, PhoneMissed, ArrowRight, Clock, TrendingUp, Zap, Phone, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { updateLead, addActivity, RootState } from '@/store';
import {
  Lead,
  ConversationStage,
  ConversationChannel,
  ConversationOutcome,
  ConversationLog,
  CONVERSATION_STAGE_ORDER,
  CONVERSATION_STAGE_LABELS,
  CONVERSATION_STAGE_COLORS,
  CONVERSATION_OUTCOME_LABELS,
  ATTEMPT_OUTCOMES,
  CONVERSATION_OUTCOMES,
  getConversationStageFromOutcome,
} from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { createConversationLog, fetchConversationLogs } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { formatDistanceToNow } from 'date-fns';

interface ConversationIntelligenceProps {
  lead: Lead;
}

const CHANNEL_OPTIONS: { value: ConversationChannel; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'dropin', label: 'Drop-in' },
  { value: 'video', label: 'Video Call' },
];

function ConversationStageDial({ stage, size = 'md' }: { stage: ConversationStage; size?: 'sm' | 'md' }) {
  const currentIndex = CONVERSATION_STAGE_ORDER.indexOf(stage);
  const total = CONVERSATION_STAGE_ORDER.length;
  const segmentAngle = 360 / total;
  const gap = 4;
  const radius = size === 'sm' ? 18 : 28;
  const strokeWidth = size === 'sm' ? 4 : 5;
  const center = radius + strokeWidth;
  const svgSize = (radius + strokeWidth) * 2;

  return (
    <div className="relative inline-flex items-center justify-center" data-testid="conversation-stage-dial">
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
        {CONVERSATION_STAGE_ORDER.map((s, i) => {
          const startAngle = i * segmentAngle - 90 + gap / 2;
          const endAngle = (i + 1) * segmentAngle - 90 - gap / 2;
          const startRad = (startAngle * Math.PI) / 180;
          const endRad = (endAngle * Math.PI) / 180;
          const x1 = center + radius * Math.cos(startRad);
          const y1 = center + radius * Math.sin(startRad);
          const x2 = center + radius * Math.cos(endRad);
          const y2 = center + radius * Math.sin(endRad);
          const largeArc = endAngle - startAngle > 180 ? 1 : 0;
          const isActive = i <= currentIndex;
          const color = isActive ? CONVERSATION_STAGE_COLORS[s] : '#e2e8f0';

          return (
            <path
              key={s}
              d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={isActive ? 1 : 0.3}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-bold ${size === 'sm' ? 'text-[9px]' : 'text-[11px]'}`} style={{ color: CONVERSATION_STAGE_COLORS[stage] }}>
          {CONVERSATION_STAGE_LABELS[stage].slice(0, 4).toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function getConversationInsight(lead: Lead, recentLogs: ConversationLog[]): string {
  const stage = lead.conversationStage || 'not_started';
  const attempts = lead.attemptCount || 0;
  const conversations = lead.conversationCount || 0;

  if (stage === 'not_started' && attempts === 0) {
    return 'No contact attempts yet. Start with a call or drop-in.';
  }
  if (stage === 'attempted' && attempts > 0 && conversations === 0) {
    return `${attempts} attempt${attempts > 1 ? 's' : ''} made, no connection yet. Try a different channel.`;
  }
  if (stage === 'connected' && conversations > 0) {
    return `Connected ${conversations} time${conversations > 1 ? 's' : ''}. Push for a discovery conversation.`;
  }
  if (stage === 'discovery') {
    return 'Discovery conversation held. Qualify their needs and budget next.';
  }
  if (stage === 'qualified') {
    return 'Lead is qualified. Time to present a proposal.';
  }
  if (stage === 'objection') {
    return 'Objection raised. Address concerns and re-qualify.';
  }
  if (stage === 'proposal') {
    return 'Proposal discussed. Follow up to close or book a meeting.';
  }
  if (stage === 'booked') {
    return 'Meeting booked! Prepare your pitch and confirm details.';
  }

  return `${attempts} attempt${attempts !== 1 ? 's' : ''}, ${conversations} conversation${conversations !== 1 ? 's' : ''} logged.`;
}

function getMomentumImpact(lead: Lead): { value: number; label: string } {
  const stage = lead.conversationStage || 'not_started';
  const stageIndex = CONVERSATION_STAGE_ORDER.indexOf(stage);
  const daysSinceConversation = lead.lastConversationAt
    ? Math.floor((Date.now() - new Date(lead.lastConversationAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  let impact = stageIndex * 2;
  if (daysSinceConversation <= 2) impact += 3;
  else if (daysSinceConversation <= 7) impact += 1;
  else if (daysSinceConversation > 14) impact -= 2;

  return {
    value: impact,
    label: impact > 0 ? `+${impact}` : `${impact}`,
  };
}

export default function ConversationIntelligence({ lead }: ConversationIntelligenceProps) {
  const dispatch = useDispatch();
  const { orgId, authReady, user } = useAuth();
  const { toast } = useToast();
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [logType, setLogType] = useState<'conversation' | 'attempt'>('conversation');
  const [channel, setChannel] = useState<ConversationChannel>('call');
  const [outcome, setOutcome] = useState<ConversationOutcome | ''>('');
  const [notes, setNotes] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentLogs, setRecentLogs] = useState<ConversationLog[]>([]);

  const currentStage = lead.conversationStage || 'not_started';
  const momentum = getMomentumImpact(lead);
  const insight = getConversationInsight(lead, recentLogs);

  useEffect(() => {
    if (orgId && authReady && lead.id) {
      fetchConversationLogs(orgId, lead.id, authReady).then(setRecentLogs);
    }
  }, [orgId, authReady, lead.id]);

  const openLogDialog = (type: 'conversation' | 'attempt') => {
    setLogType(type);
    setChannel('call');
    setOutcome('');
    setNotes('');
    setNextStep('');
    setShowLogDialog(true);
  };

  const handleSubmitLog = async () => {
    if (!outcome) {
      toast({ title: 'Select an outcome', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const newStage = getConversationStageFromOutcome(outcome as ConversationOutcome, currentStage);

      const log: Omit<ConversationLog, 'id'> = {
        leadId: lead.id,
        userId: user?.uid || '',
        type: logType,
        channel,
        outcome: outcome as ConversationOutcome,
        conversationStageBefore: currentStage,
        conversationStageAfter: newStage,
        notes: notes || undefined,
        nextStep: nextStep || undefined,
        createdAt: new Date(),
      };

      const leadUpdates: Partial<Lead> = {
        conversationStage: newStage,
        updatedAt: new Date(),
      };

      if (logType === 'conversation') {
        leadUpdates.lastConversationAt = new Date();
        leadUpdates.conversationCount = (lead.conversationCount || 0) + 1;
        leadUpdates.lastContactDate = new Date();
      } else {
        leadUpdates.lastAttemptAt = new Date();
        leadUpdates.attemptCount = (lead.attemptCount || 0) + 1;
      }

      if (nextStep) {
        leadUpdates.nextConversationStep = nextStep;
      }

      dispatch(updateLead({ ...lead, ...leadUpdates }));

      dispatch(addActivity({
        id: uuidv4(),
        userId: user?.uid || '',
        leadId: lead.id,
        type: logType === 'conversation' ? 'conversation' : 'attempt',
        notes: notes || `${logType === 'conversation' ? 'Conversation' : 'Attempt'} via ${channel}: ${CONVERSATION_OUTCOME_LABELS[outcome as ConversationOutcome]}`,
        outcome: outcome as string,
        createdAt: new Date(),
        metadata: {
          channel,
          conversationStageBefore: currentStage,
          conversationStageAfter: newStage,
          nextStep: nextStep || undefined,
        },
      }));

      if (orgId && authReady) {
        await createConversationLog(orgId, lead.id, log, authReady, leadUpdates);
      }

      setRecentLogs(prev => [{ id: uuidv4(), ...log }, ...prev]);

      toast({
        title: logType === 'conversation' ? 'Conversation logged' : 'Attempt logged',
        description: newStage !== currentStage
          ? `Stage moved: ${CONVERSATION_STAGE_LABELS[currentStage]} → ${CONVERSATION_STAGE_LABELS[newStage]}`
          : `Logged ${CONVERSATION_OUTCOME_LABELS[outcome as ConversationOutcome]}`,
      });

      setShowLogDialog(false);
    } catch (error) {
      console.error('Error logging conversation:', error);
      toast({ title: 'Error', description: 'Failed to log conversation', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const outcomes = logType === 'attempt' ? ATTEMPT_OUTCOMES : CONVERSATION_OUTCOMES;

  return (
    <>
      <div className="space-y-3 p-3 rounded-lg border bg-muted/30" data-testid="conversation-intelligence-panel">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-500" />
            Conversation Intelligence
          </h3>
          <Badge
            variant="outline"
            className="text-xs"
            style={{ borderColor: CONVERSATION_STAGE_COLORS[currentStage], color: CONVERSATION_STAGE_COLORS[currentStage] }}
            data-testid="badge-conversation-stage"
          >
            {CONVERSATION_STAGE_LABELS[currentStage]}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <ConversationStageDial stage={currentStage} />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {lead.lastConversationAt && (
                <span className="flex items-center gap-1" data-testid="text-last-conversation">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(lead.lastConversationAt), { addSuffix: true })}
                </span>
              )}
              <span className="flex items-center gap-1" data-testid="text-momentum-impact">
                <TrendingUp className="h-3 w-3" />
                Momentum: {momentum.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground italic" data-testid="text-ai-insight">
              {insight}
            </p>
          </div>
        </div>

        {(lead.contactName || lead.phone || lead.email) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border rounded px-2 py-1.5 bg-background/60" data-testid="contact-details-row">
            {lead.contactName && (
              <span className="flex items-center gap-1 text-foreground font-medium" data-testid="text-contact-name">
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                {lead.contactName}
              </span>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                data-testid="link-contact-phone"
              >
                <Phone className="h-3 w-3 shrink-0" />
                {lead.phone}
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[180px]"
                title={lead.email}
                data-testid="link-contact-email"
              >
                <Mail className="h-3 w-3 shrink-0" />
                {lead.email}
              </a>
            )}
          </div>
        )}

        {lead.nextConversationStep && (
          <div className="flex items-start gap-1.5 text-xs bg-background/80 rounded px-2 py-1.5 border" data-testid="text-next-step">
            <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-blue-500" />
            <span><strong>Next:</strong> {lead.nextConversationStep}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => openLogDialog('conversation')}
            data-testid="button-log-conversation"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Log Conversation
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => openLogDialog('attempt')}
            data-testid="button-log-attempt"
          >
            <PhoneMissed className="h-3.5 w-3.5" />
            Log Attempt
          </Button>
        </div>

        {recentLogs.length > 0 && (
          <div className="space-y-1 pt-1" data-testid="recent-conversations-list">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recent</p>
            {recentLogs.slice(0, 3).map((log) => (
              <div key={log.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: CONVERSATION_STAGE_COLORS[log.conversationStageAfter] }}
                />
                <span className="truncate">
                  {log.type === 'conversation' ? 'Conv' : 'Attempt'} via {log.channel}
                  {log.outcome ? ` — ${CONVERSATION_OUTCOME_LABELS[log.outcome]}` : ''}
                </span>
                <span className="shrink-0 ml-auto">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-log-conversation">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {logType === 'conversation' ? (
                <><MessageCircle className="h-5 w-5" /> Log Conversation</>
              ) : (
                <><PhoneMissed className="h-5 w-5" /> Log Attempt</>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ConversationChannel)}>
                <SelectTrigger data-testid="select-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">What happened?</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as ConversationOutcome)}>
                <SelectTrigger data-testid="select-outcome">
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  {outcomes.map((o) => (
                    <SelectItem key={o} value={o}>{CONVERSATION_OUTCOME_LABELS[o]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {outcome && (
              <div className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs">
                <span>Stage will move:</span>
                <Badge variant="outline" className="text-[10px]" style={{ borderColor: CONVERSATION_STAGE_COLORS[currentStage] }}>
                  {CONVERSATION_STAGE_LABELS[currentStage]}
                </Badge>
                <ArrowRight className="h-3 w-3" />
                <Badge variant="outline" className="text-[10px]" style={{ borderColor: CONVERSATION_STAGE_COLORS[getConversationStageFromOutcome(outcome as ConversationOutcome, currentStage)] }}>
                  {CONVERSATION_STAGE_LABELS[getConversationStageFromOutcome(outcome as ConversationOutcome, currentStage)]}
                </Badge>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was discussed..."
                rows={3}
                data-testid="textarea-conversation-notes"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Next Step (optional)</Label>
              <Input
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="e.g., Send proposal by Friday"
                data-testid="input-next-step"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogDialog(false)} data-testid="button-cancel-log">
              Cancel
            </Button>
            <Button onClick={handleSubmitLog} disabled={isSubmitting || !outcome} data-testid="button-submit-log">
              {isSubmitting ? 'Saving...' : 'Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ConversationStageDial };

import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { MessageCircle, PhoneMissed, ArrowRight, Clock, TrendingUp, Zap, Phone, Mail, User, Mic, MicOff, Loader2, Wand2, Sparkles, CalendarPlus, X, CheckCircle2, RefreshCw, Copy, ExternalLink } from 'lucide-react';
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
  Task,
  TaskType,
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
import { createConversationLog, fetchConversationLogs, createPlanTask } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { formatDistanceToNow, format, addDays } from 'date-fns';

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
  const [pendingTaskSuggestion, setPendingTaskSuggestion] = useState<{
    taskType: TaskType;
    title: string;
    notes: string;
    daysFromNow: number;
    dueDate: string;
  } | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // AI suggestion state for Log Attempt dialog
  const [aiSuggestion, setAiSuggestion] = useState<{
    framework: string;
    frameworkReason: string;
    message?: string;
    subject?: string;
    body?: string;
    openingLine?: string;
    firstQuestion?: string;
  } | null>(null);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);

  const generateAttemptSuggestion = async (ch: ConversationChannel) => {
    if (!lead.companyName) return;
    setAiSuggestion(null);
    setIsGeneratingSuggestion(true);
    try {
      const recentForAI = recentLogs.slice(0, 6).map(l => ({
        type: l.type,
        channel: l.channel,
        outcome: l.outcome,
        notes: l.notes,
      }));
      const r = await fetch('/api/leads/ai/suggest-attempt-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: ch,
          companyName: lead.companyName,
          contactName: lead.contactName,
          stage: lead.stage,
          conversationStage: lead.conversationStage,
          notes: lead.notes,
          recentLogs: recentForAI,
          attemptCount: lead.attemptCount || 0,
        }),
      });
      if (!r.ok) throw new Error('Failed');
      const data = await r.json();
      setAiSuggestion(data);
    } catch (e) {
      console.error('[CI] suggestion failed', e);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  // Dictation state for Notes field
  const [recording, setRecording] = useState(false);
  const [dictFinalText, setDictFinalText] = useState('');
  const [dictInterimText, setDictInterimText] = useState('');
  const [dictTidying, setDictTidying] = useState(false);
  const recognitionRef = useRef<any>(null);
  const srSupported = typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  const startDictation = () => {
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) return;
    const rec = new SRClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-AU';
    let accumulated = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          accumulated += (accumulated ? ' ' : '') + t.trim();
        } else {
          interim += t;
        }
      }
      setDictFinalText(accumulated);
      setDictInterimText(interim);
    };
    rec.onend = () => { setRecording(false); setDictInterimText(''); };
    rec.onerror = () => { setRecording(false); setDictInterimText(''); };
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
    setDictFinalText('');
    setDictInterimText('');
  };

  const stopDictation = () => {
    recognitionRef.current?.stop();
    setRecording(false);
    setDictInterimText('');
  };

  const saveDictation = async () => {
    const raw = dictFinalText.trim();
    if (!raw) { setDictFinalText(''); return; }
    stopDictation();
    setDictTidying(true);
    try {
      const combined = notes ? `${notes.trim()}\n\n${raw}` : raw;
      const res = await fetch('/api/leads/ai/tidy-dictation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combined, fieldLabel: 'Conversation Notes' }),
      });
      const json = await res.json();
      setNotes(json.tidied || combined);
    } catch {
      setNotes(notes ? `${notes.trim()}\n\n${raw}` : raw);
    } finally {
      setDictTidying(false);
      setDictFinalText('');
    }
  };

  const discardDictation = () => {
    stopDictation();
    setDictFinalText('');
    setDictInterimText('');
  };

  const resetDictation = () => {
    stopDictation();
    setDictFinalText('');
    setDictInterimText('');
    setDictTidying(false);
  };

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
    setAiSuggestion(null);
    resetDictation();
    setShowLogDialog(true);
    if (type === 'attempt') {
      generateAttemptSuggestion('call');
    }
  };

  const handleChannelChange = (ch: ConversationChannel) => {
    setChannel(ch);
    if (logType === 'attempt') {
      generateAttemptSuggestion(ch);
    }
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

      const capturedNextStep = nextStep;
      setShowLogDialog(false);

      // AI: parse next step into a task suggestion (fire-and-forget, non-blocking)
      if (capturedNextStep.trim()) {
        fetch('/api/leads/ai/parse-next-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nextStep: capturedNextStep.trim(),
            leadName: lead.contactName || lead.companyName,
            companyName: lead.companyName,
          }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.title) setPendingTaskSuggestion(data);
          })
          .catch(() => {});
      }
    } catch (error) {
      console.error('Error logging conversation:', error);
      toast({ title: 'Error', description: 'Failed to log conversation', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const outcomes = logType === 'attempt' ? ATTEMPT_OUTCOMES : CONVERSATION_OUTCOMES;

  const acceptTaskSuggestion = async () => {
    if (!pendingTaskSuggestion || !orgId || !user?.uid) return;
    setIsCreatingTask(true);
    try {
      const dueDate = new Date(pendingTaskSuggestion.dueDate);
      const planDateKey = format(dueDate, 'yyyy-MM-dd');
      const planDate = format(dueDate, 'dd-MM-yyyy');
      await createPlanTask(orgId, {
        userId: user.uid,
        leadId: lead.id,
        title: pendingTaskSuggestion.title,
        taskType: pendingTaskSuggestion.taskType,
        notes: pendingTaskSuggestion.notes || undefined,
        dueAt: dueDate,
        planDate,
        planDateKey,
        status: 'pending',
        createdAt: new Date(),
      }, authReady);
      toast({
        title: 'Task created',
        description: `${pendingTaskSuggestion.title} · due ${format(dueDate, 'dd MMM yyyy')}`,
      });
      setPendingTaskSuggestion(null);
    } catch {
      toast({ title: 'Error', description: 'Could not create task', variant: 'destructive' });
    } finally {
      setIsCreatingTask(false);
    }
  };

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
          <div className="space-y-2 pt-1" data-testid="recent-conversations-list">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recent</p>
            {recentLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="rounded border bg-background/60 px-2 py-1.5 space-y-1 text-[11px]">
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-px"
                    style={{ backgroundColor: CONVERSATION_STAGE_COLORS[log.conversationStageAfter] }}
                  />
                  <span className="font-medium text-foreground truncate">
                    {log.type === 'conversation' ? 'Conv' : 'Attempt'} via {log.channel}
                    {log.outcome ? ` — ${CONVERSATION_OUTCOME_LABELS[log.outcome]}` : ''}
                  </span>
                  <span className="shrink-0 ml-auto text-muted-foreground">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {log.notes && (
                  <p className="text-muted-foreground pl-3.5 leading-relaxed line-clamp-3" data-testid={`text-log-notes-${log.id}`}>
                    {log.notes}
                  </p>
                )}
                {log.nextStep && (
                  <p className="text-blue-600 dark:text-blue-400 pl-3.5 flex items-start gap-1" data-testid={`text-log-nextstep-${log.id}`}>
                    <ArrowRight className="h-3 w-3 mt-px shrink-0" />
                    <span>{log.nextStep}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI Task Suggestion Card */}
        {pendingTaskSuggestion && (
          <div
            className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 dark:border-violet-800/40 dark:bg-violet-950/20 px-3 py-2.5 space-y-2"
            data-testid="card-task-suggestion"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-0.5">AI Suggested Task</p>
                  <p className="text-sm font-medium text-foreground leading-snug">{pendingTaskSuggestion.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <CalendarPlus className="h-3 w-3" />
                    Due {format(new Date(pendingTaskSuggestion.dueDate), 'EEE dd MMM yyyy')}
                    {pendingTaskSuggestion.daysFromNow === 0 ? ' (today)' : pendingTaskSuggestion.daysFromNow === 1 ? ' (tomorrow)' : ` (in ${pendingTaskSuggestion.daysFromNow} days)`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingTaskSuggestion(null)}
                className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                data-testid="button-dismiss-task-suggestion"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white flex-1"
                onClick={acceptTaskSuggestion}
                disabled={isCreatingTask}
                data-testid="button-accept-task-suggestion"
              >
                {isCreatingTask
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <CheckCircle2 className="h-3 w-3" />}
                {isCreatingTask ? 'Creating…' : 'Add to Tasks'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setPendingTaskSuggestion(null)}
                data-testid="button-decline-task-suggestion"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col" data-testid="dialog-log-conversation">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {logType === 'conversation' ? (
                <><MessageCircle className="h-5 w-5" /> Log Conversation</>
              ) : (
                <><PhoneMissed className="h-5 w-5" /> Log Attempt</>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-1">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => handleChannelChange(v as ConversationChannel)}>
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

            {/* AI Suggestion Card — shown in attempt mode */}
            {logType === 'attempt' && (
              <div className="rounded-lg border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/20 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-violet-200/60 dark:border-violet-800/30">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                      AI {channel === 'call' ? 'Call Opener' : channel === 'sms' ? 'SMS Suggestion' : channel === 'email' ? 'Email Draft' : 'Message Suggestion'}
                    </span>
                  </div>
                  <button
                    onClick={() => generateAttemptSuggestion(channel)}
                    disabled={isGeneratingSuggestion}
                    className="text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 disabled:opacity-40"
                    title="Regenerate"
                    data-testid="button-regenerate-ai-suggestion"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingSuggestion ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="p-3 space-y-2.5">
                  {isGeneratingSuggestion && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                      Crafting a {aiSuggestion ? 'new ' : ''}suggestion…
                    </div>
                  )}

                  {!isGeneratingSuggestion && aiSuggestion && (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-700 dark:text-violet-300 dark:border-violet-700">
                          {aiSuggestion.framework}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground leading-tight">{aiSuggestion.frameworkReason}</span>
                      </div>

                      {/* Call opener */}
                      {channel === 'call' && (aiSuggestion.openingLine || aiSuggestion.firstQuestion) && (
                        <div className="space-y-1.5">
                          {aiSuggestion.openingLine && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Opening Line</p>
                              <p className="text-sm leading-snug bg-background/70 rounded px-2.5 py-1.5 border border-violet-100 dark:border-violet-900/40">{aiSuggestion.openingLine}</p>
                            </div>
                          )}
                          {aiSuggestion.firstQuestion && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">First Question</p>
                              <p className="text-sm leading-snug bg-background/70 rounded px-2.5 py-1.5 border border-violet-100 dark:border-violet-900/40">{aiSuggestion.firstQuestion}</p>
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px] px-2 gap-1 border-violet-200 dark:border-violet-800"
                            onClick={() => {
                              const txt = [aiSuggestion.openingLine, aiSuggestion.firstQuestion].filter(Boolean).join('\n\n');
                              navigator.clipboard.writeText(txt);
                              toast({ title: 'Copied', description: 'Call script copied to clipboard' });
                            }}
                            data-testid="button-copy-call-script"
                          >
                            <Copy className="h-3 w-3" /> Copy Script
                          </Button>
                        </div>
                      )}

                      {/* SMS */}
                      {channel === 'sms' && aiSuggestion.message && (
                        <div className="space-y-1.5">
                          <p className="text-sm leading-snug bg-background/70 rounded px-2.5 py-1.5 border border-violet-100 dark:border-violet-900/40">{aiSuggestion.message}</p>
                          <p className="text-[10px] text-muted-foreground">{aiSuggestion.message.length} chars</p>
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px] px-2 gap-1 border-violet-200 dark:border-violet-800"
                              onClick={() => { navigator.clipboard.writeText(aiSuggestion.message!); toast({ title: 'Copied' }); }}
                              data-testid="button-copy-sms"
                            >
                              <Copy className="h-3 w-3" /> Copy
                            </Button>
                            {lead.phone && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 gap-1 border-violet-200 dark:border-violet-800"
                                onClick={() => window.open(`sms:${lead.phone}?body=${encodeURIComponent(aiSuggestion.message!)}`, '_self')}
                                data-testid="button-open-sms"
                              >
                                <ExternalLink className="h-3 w-3" /> Open in Messages
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Email */}
                      {channel === 'email' && (aiSuggestion.subject || aiSuggestion.body) && (
                        <div className="space-y-1.5">
                          {aiSuggestion.subject && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Subject</p>
                              <p className="text-sm font-medium bg-background/70 rounded px-2.5 py-1.5 border border-violet-100 dark:border-violet-900/40">{aiSuggestion.subject}</p>
                            </div>
                          )}
                          {aiSuggestion.body && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Body</p>
                              <p className="text-sm leading-relaxed bg-background/70 rounded px-2.5 py-1.5 border border-violet-100 dark:border-violet-900/40 whitespace-pre-wrap">{aiSuggestion.body}</p>
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px] px-2 gap-1 border-violet-200 dark:border-violet-800"
                              onClick={() => { navigator.clipboard.writeText(`Subject: ${aiSuggestion.subject}\n\n${aiSuggestion.body}`); toast({ title: 'Copied' }); }}
                              data-testid="button-copy-email"
                            >
                              <Copy className="h-3 w-3" /> Copy
                            </Button>
                            {lead.email && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 gap-1 border-violet-200 dark:border-violet-800"
                                onClick={() => window.open(`mailto:${lead.email}?subject=${encodeURIComponent(aiSuggestion.subject || '')}&body=${encodeURIComponent(aiSuggestion.body || '')}`, '_self')}
                                data-testid="button-open-email"
                              >
                                <ExternalLink className="h-3 w-3" /> Open in Email
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Other channels (meeting, dropin, video) */}
                      {!['call', 'sms', 'email'].includes(channel) && aiSuggestion.message && (
                        <div className="space-y-1.5">
                          <p className="text-sm leading-snug bg-background/70 rounded px-2.5 py-1.5 border border-violet-100 dark:border-violet-900/40">{aiSuggestion.message}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px] px-2 gap-1 border-violet-200 dark:border-violet-800"
                            onClick={() => { navigator.clipboard.writeText(aiSuggestion.message!); toast({ title: 'Copied' }); }}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

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
              <div className="space-y-1.5">
                <div className="relative group">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={recording ? 'Listening…' : 'What was discussed...'}
                    rows={3}
                    className={`text-sm resize-none pr-9 transition-all ${recording ? 'ring-2 ring-red-400 border-red-300' : ''}`}
                    data-testid="textarea-conversation-notes"
                  />
                  {srSupported && (
                    <button
                      type="button"
                      onClick={recording ? stopDictation : startDictation}
                      title={recording ? 'Stop dictation' : 'Start dictation'}
                      data-testid="mic-conversation-notes"
                      className={`absolute top-2 right-2 p-1.5 rounded-md transition-all ${
                        recording
                          ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
                          : 'opacity-0 group-hover:opacity-100 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>

                {(dictFinalText || dictInterimText) && (
                  <div className="rounded-lg border border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900/40 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      {recording
                        ? <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-red-600 uppercase tracking-wider"><Mic className="h-3 w-3 animate-pulse" /> Recording</span>
                        : <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Transcript captured — ready to save</span>
                      }
                    </div>
                    <p className="text-sm leading-relaxed">
                      <span className="text-foreground">{dictFinalText}</span>
                      {dictInterimText && <span className="text-muted-foreground italic"> {dictInterimText}</span>}
                    </p>
                    {!recording && dictFinalText && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                          onClick={saveDictation}
                          disabled={dictTidying}
                          data-testid="save-dictation-notes"
                        >
                          {dictTidying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                          {dictTidying ? 'Tidying…' : 'Save & Tidy with AI'}
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={discardDictation}>
                          Discard
                        </Button>
                      </div>
                    )}
                    {dictTidying && (
                      <p className="text-[11px] text-muted-foreground">AI is cleaning up the transcript…</p>
                    )}
                  </div>
                )}
              </div>
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

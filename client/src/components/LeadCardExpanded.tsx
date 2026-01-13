import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { ChevronDown, ChevronUp, Phone, Mail, Copy, ExternalLink, Mic, MicOff, Archive, Trash2, Heart, HeartOff, Loader2, Globe, MessageSquare, Send, CalendarIcon, Sparkles, RotateCcw } from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { addDays, addWeeks, addMonths } from 'date-fns';
import { Lead, Stage, STAGE_LABELS, STAGE_ORDER, ActivityType, getTrafficLightStatus, NURTURE_STATUS_LABELS } from '@/lib/types';
import { updateLead, updateLeadStage, addActivity, archiveLead, deleteLead, enrollInNurture, removeFromNurture } from '@/store';
import TrafficLight from './TrafficLight';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/contexts/AuthContext';
import { deleteLeadFromFirestore, logPipelineAction, updateLeadInFirestore, fetchTaskLoadByDateRange } from '@/lib/firestoreService';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AIMessageModal } from './AIMessageModal';
import { OutreachScriptsDialog } from './OutreachScriptsDialog';

const NEPQ_LABELS = [
  'Situation Aware',
  'Problem Aware',
  'Consequence Aware',
  'Solution Aware',
  'Commitment Ready',
];

interface LeadCardExpandedProps {
  lead: Lead;
  isExpanded: boolean;
  onToggle: () => void;
}

function NurtureEnrollmentSection({ lead }: { lead: Lead }) {
  const dispatch = useDispatch();
  const cadences = useSelector((state: RootState) => state.app.cadences);
  const [selectedCadenceId, setSelectedCadenceId] = useState<string>('');
  
  const activeCadences = cadences.filter(c => c.mode === 'active');
  const passiveCadences = cadences.filter(c => c.mode === 'passive');
  const currentCadence = lead.nurtureCadenceId ? cadences.find(c => c.id === lead.nurtureCadenceId) : null;

  const handleEnroll = (mode: 'active' | 'passive') => {
    const cadenceList = mode === 'active' ? activeCadences : passiveCadences;
    const selectedCadence = cadences.find(c => c.id === selectedCadenceId);
    const cadenceId = (selectedCadence && selectedCadence.mode === mode) 
      ? selectedCadenceId 
      : cadenceList[0]?.id;
    if (cadenceId) {
      dispatch(enrollInNurture({ leadId: lead.id, mode, cadenceId }));
      setSelectedCadenceId('');
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Nurture</Label>
      {lead.nurtureMode === 'none' ? (
        <div className="space-y-2">
          <Select value={selectedCadenceId} onValueChange={setSelectedCadenceId}>
            <SelectTrigger className="h-9" data-testid={`select-cadence-${lead.id}`}>
              <SelectValue placeholder="Select a cadence..." />
            </SelectTrigger>
            <SelectContent>
              {activeCadences.length > 0 && (
                <>
                  <SelectItem value="header-active" disabled className="text-xs text-muted-foreground font-medium">Active Cadences</SelectItem>
                  {activeCadences.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </>
              )}
              {passiveCadences.length > 0 && (
                <>
                  <SelectItem value="header-passive" disabled className="text-xs text-muted-foreground font-medium">Passive Cadences</SelectItem>
                  {passiveCadences.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800"
              onClick={() => handleEnroll('active')}
              disabled={!selectedCadenceId && activeCadences.length === 0}
              data-testid={`button-enroll-active-${lead.id}`}
            >
              <Heart className="h-3 w-3" />
              Enroll Active
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800"
              onClick={() => handleEnroll('passive')}
              disabled={!selectedCadenceId && passiveCadences.length === 0}
              data-testid={`button-enroll-passive-${lead.id}`}
            >
              <Heart className="h-3 w-3" />
              Enroll Passive
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant="secondary"
              className={lead.nurtureMode === 'active' 
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' 
                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'}
            >
              {currentCadence?.name || (lead.nurtureMode === 'active' ? 'Active Nurture' : 'Passive Nurture')}
            </Badge>
            {lead.nurtureStatus && (
              <Badge variant="outline" className="text-xs">
                {NURTURE_STATUS_LABELS[lead.nurtureStatus] || lead.nurtureStatus}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => dispatch(removeFromNurture(lead.id))}
              data-testid={`button-remove-nurture-${lead.id}`}
            >
              <HeartOff className="h-3 w-3" />
              Remove
            </Button>
          </div>
          {lead.nextTouchAt && (
            <p className="text-xs text-muted-foreground">
              Next touch: {format(new Date(lead.nextTouchAt), 'dd/MM/yyyy')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeadCardExpanded({ lead, isExpanded, onToggle }: LeadCardExpandedProps) {
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const activities = useSelector((state: RootState) => state.app.activities);
  const [lastLoggedActivity, setLastLoggedActivity] = useState<{ type: ActivityType; id: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoggingActivity, setIsLoggingActivity] = useState<ActivityType | null>(null);
  const [aiMessageModalOpen, setAiMessageModalOpen] = useState(false);
  const [aiMessageChannel, setAiMessageChannel] = useState<'sms' | 'email'>('sms');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [outreachScriptsOpen, setOutreachScriptsOpen] = useState(false);
  const [contactReason, setContactReason] = useState(lead.nextContactReason || '');
  const [isSavingDate, setIsSavingDate] = useState(false);

  const openAiMessageModal = (channel: 'sms' | 'email') => {
    setAiMessageChannel(channel);
    setAiMessageModalOpen(true);
  };

  const handleSetNextContactDate = async (date: Date, source: 'ai' | 'manual' = 'manual', reason?: string) => {
    if (!orgId || !authReady) return;
    
    setIsSavingDate(true);
    try {
      const updates = {
        nextContactDate: date,
        nextContactSource: source,
        nextContactReason: reason || (source === 'manual' ? contactReason : undefined),
        updatedAt: new Date()
      };
      
      dispatch(updateLead({ ...lead, ...updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady);
      
      toast({
        title: 'Next contact date updated',
        description: `Set to ${format(date, 'dd/MM/yyyy')}${source === 'manual' ? ' (manual)' : ' (AI suggested)'}`,
      });
      setIsDatePickerOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update date', variant: 'destructive' });
    } finally {
      setIsSavingDate(false);
    }
  };

  const handleQuickAdjust = (adjustment: string) => {
    const baseDate = lead.nextContactDate ? new Date(lead.nextContactDate) : new Date();
    let newDate: Date;
    
    switch (adjustment) {
      case '+1w': newDate = addWeeks(baseDate, 1); break;
      case '+2w': newDate = addWeeks(baseDate, 2); break;
      case '+1m': newDate = addMonths(baseDate, 1); break;
      case '+2m': newDate = addMonths(baseDate, 2); break;
      default: newDate = baseDate;
    }
    
    handleSetNextContactDate(newDate, 'manual');
  };

  const handleRevertToAI = async () => {
    if (!orgId || !authReady) return;
    
    setIsSavingDate(true);
    try {
      const updates = {
        nextContactSource: 'ai' as const,
        nextContactReason: undefined,
        updatedAt: new Date()
      };
      
      dispatch(updateLead({ ...lead, ...updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady);
      setContactReason('');
      
      toast({
        title: 'Reverted to AI scheduling',
        description: 'Future activities will auto-schedule the next contact date',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to revert', variant: 'destructive' });
    } finally {
      setIsSavingDate(false);
    }
  };

  const leadActivityHistory = activities
    .filter(a => a.leadId === lead.id)
    .slice(0, 5)
    .map(a => `${a.type}: ${a.notes || 'No notes'}`);
  
  const handleDictationResult = useCallback((transcript: string) => {
    const currentNotes = lead.notes || '';
    const separator = currentNotes && !currentNotes.endsWith(' ') ? ' ' : '';
    const newNotes = currentNotes + separator + transcript;
    dispatch(updateLead({ ...lead, notes: newNotes, updatedAt: new Date() }));
  }, [lead, dispatch]);
  
  const { isListening, startListening, stopListening, isSupported: dictationSupported } = useSpeechRecognition(handleDictationResult);

  const activityCounts = activities
    .filter(a => a.leadId === lead.id)
    .reduce((counts, a) => {
      counts[a.type] = (counts[a.type] || 0) + 1;
      return counts;
    }, {} as Record<ActivityType, number>);
  
  const trafficStatus = getTrafficLightStatus(lead);

  const handleStageChange = (stage: Stage) => {
    dispatch(updateLeadStage({ leadId: lead.id, stage }));
  };

  const handleMoveStage = (direction: 'left' | 'right') => {
    const currentIndex = STAGE_ORDER.indexOf(lead.stage);
    const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < STAGE_ORDER.length) {
      dispatch(updateLeadStage({ leadId: lead.id, stage: STAGE_ORDER[newIndex] }));
    }
  };

  const handleLogActivity = async (type: ActivityType) => {
    if (!orgId || !authReady) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return;
    }
    
    setIsLoggingActivity(type);
    try {
      // Use logPipelineAction to create both activity AND task for Daily Plan
      const { activity: savedActivity } = await logPipelineAction(orgId, {
        userId: lead.userId,
        leadId: lead.id,
        type,
        leadName: lead.companyName || lead.contactName,
      }, authReady);
      
      dispatch(addActivity(savedActivity));
      setLastLoggedActivity({ type, id: savedActivity.id });
      setTimeout(() => setLastLoggedActivity(null), 5000);
      
      // Invalidate all Daily Plan queries for this org (partial match)
      queryClient.invalidateQueries({ queryKey: ['/plan-tasks', orgId] });
      
      // Smart scheduling: auto-set next contact date (only if not manually overridden)
      if (lead.nextContactSource === 'manual') {
        // Respect manual override - don't auto-reschedule
        dispatch(updateLead({ 
          ...lead, 
          lastActivityAt: new Date(),
          updatedAt: new Date() 
        }));
        await updateLeadInFirestore(orgId, lead.id, { 
          lastActivityAt: new Date(),
          updatedAt: new Date()
        }, authReady);
        
        toast({ 
          title: `${type.charAt(0).toUpperCase() + type.slice(1)} logged`, 
          description: `Manual follow-up date preserved: ${lead.nextContactDate ? format(new Date(lead.nextContactDate), 'dd/MM/yyyy') : 'Not set'}`
        });
      } else {
        try {
          // Fetch real task load for the next 30 days
          const startDate = new Date();
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + 30);
          const taskLoadByDate = await fetchTaskLoadByDateRange(
            orgId, 
            lead.userId, 
            startDate, 
            endDate, 
            authReady
          );
          
          const scheduleResponse = await fetch('/api/scheduling/suggest-next-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadStage: lead.stage,
              activityType: type,
              taskLoadByDate,
              maxTasksPerDay: 8, // TODO: Could be user preference
              preferredDays: [1, 2, 3, 4, 5], // Mon-Fri
              leadPriority: 'normal'
            })
          });
          
          if (scheduleResponse.ok) {
            const scheduleData = await scheduleResponse.json();
            const nextContactDate = new Date(scheduleData.suggestedDate);
            
            // Update lead with smart-scheduled next contact date
            dispatch(updateLead({ 
              ...lead, 
              nextContactDate,
              nextContactSource: 'ai',
              lastActivityAt: new Date(),
              updatedAt: new Date() 
            }));
            
            // Also update in Firestore
            await updateLeadInFirestore(orgId, lead.id, { 
              nextContactDate,
              nextContactSource: 'ai',
              lastActivityAt: new Date(),
              updatedAt: new Date()
            }, authReady);
            
            toast({ 
              title: `${type.charAt(0).toUpperCase() + type.slice(1)} logged`, 
              description: `Next follow-up: ${scheduleData.displayDate} (${scheduleData.reason})`
            });
          } else {
            toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} logged`, description: 'Task added to Daily Plan' });
          }
        } catch (schedError) {
          console.error('[LeadCardExpanded] Smart scheduling failed:', schedError);
          toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} logged`, description: 'Task added to Daily Plan' });
        }
      }
    } catch (error) {
      console.error('[LeadCardExpanded] Error logging activity:', error);
      toast({ title: 'Error', description: 'Failed to log activity', variant: 'destructive' });
    } finally {
      setIsLoggingActivity(null);
    }
  };

  const handleUpdateField = (field: keyof Lead, value: any) => {
    dispatch(updateLead({ ...lead, [field]: value, updatedAt: new Date() }));
  };

  const handleArchive = () => {
    dispatch(archiveLead(lead.id));
  };

  const handleDelete = async () => {
    if (!orgId || !authReady) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteLeadFromFirestore(orgId, lead.id, authReady);
      dispatch(deleteLead(lead.id));
      toast({ title: 'Deleted', description: 'Deal deleted successfully' });
    } catch (error) {
      console.error('[LeadCardExpanded] Error deleting lead:', error);
      toast({ title: 'Error', description: 'Failed to delete deal', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleRecording = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const ActivityButton = ({ type, label }: { type: ActivityType; label: string }) => {
    const count = activityCounts[type] || 0;
    const justLogged = lastLoggedActivity?.type === type;
    const isLoading = isLoggingActivity === type;
    
    const colorClasses: Record<string, string> = {
      call: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
      email: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      sms: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
      meeting: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
      meeting_booked: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
      dropin: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
    };

    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 ${colorClasses[type] || ''}`}
          onClick={() => handleLogActivity(type)}
          disabled={isLoading}
          data-testid={`button-log-${type}-${lead.id}`}
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : label}
          <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-1">
            {count}
          </Badge>
        </Button>
        {justLogged && (
          <button 
            className="text-xs text-muted-foreground underline"
            onClick={() => setLastLoggedActivity(null)}
          >
            Undo
          </button>
        )}
      </div>
    );
  };

  return (
    <Card 
      className={`transition-all duration-200 ${isExpanded ? 'ring-2 ring-primary' : ''}`}
      data-testid={`card-lead-${lead.id}`}
    >
      {/* Collapsed Header - Always Visible */}
      <div 
        className="p-3 cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`lead-header-${lead.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h3 className="font-semibold text-sm break-words">{lead.companyName}</h3>
              <TrafficLight status={trafficStatus} size="sm" className="shrink-0 mt-0.5" />
            </div>
            {lead.territory && (
              <p className="text-xs text-muted-foreground truncate">{lead.territory}</p>
            )}
          </div>
          {lead.nextContactDate && (
            <Badge variant="outline" className="text-xs shrink-0">
              Next: {format(new Date(lead.nextContactDate), 'dd/MM/yyyy')}
            </Badge>
          )}
        </div>
        {!isExpanded && lead.lastActivityAt && (
          <p className="text-xs text-muted-foreground mt-1">
            {lead.lastActivityAt && `Call`} - {lead.lastActivityAt && format(new Date(lead.lastActivityAt), 'dd/MM/yyyy')}
          </p>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-4 border-t pt-3">
          {/* Stage */}
          <div className="space-y-1">
            <Label className="text-xs">Stage</Label>
            <Select value={lead.stage} onValueChange={(val) => handleStageChange(val as Stage)}>
              <SelectTrigger className="h-9" data-testid={`select-stage-${lead.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Next Contact Date Editor */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-md">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3" />
                Next Contact
                {lead.nextContactSource === 'manual' ? (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                    Manual
                  </Badge>
                ) : lead.nextContactDate ? (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300">
                    <Sparkles className="h-2 w-2 mr-0.5" />
                    AI
                  </Badge>
                ) : null}
              </Label>
              {lead.nextContactSource === 'manual' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={handleRevertToAI}
                  disabled={isSavingDate}
                  data-testid={`button-revert-ai-${lead.id}`}
                >
                  <RotateCcw className="h-3 w-3" />
                  Revert to AI
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8"
                    disabled={isSavingDate}
                    data-testid={`button-pick-date-${lead.id}`}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    {lead.nextContactDate ? format(new Date(lead.nextContactDate), 'dd/MM/yyyy') : 'Set date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={lead.nextContactDate ? new Date(lead.nextContactDate) : undefined}
                    onSelect={(date) => date && handleSetNextContactDate(date, 'manual')}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handleQuickAdjust('+1w')}
                  disabled={isSavingDate}
                  data-testid={`button-add-1w-${lead.id}`}
                >
                  +1 wk
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handleQuickAdjust('+2w')}
                  disabled={isSavingDate}
                  data-testid={`button-add-2w-${lead.id}`}
                >
                  +2 wk
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handleQuickAdjust('+1m')}
                  disabled={isSavingDate}
                  data-testid={`button-add-1m-${lead.id}`}
                >
                  +1 mo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handleQuickAdjust('+2m')}
                  disabled={isSavingDate}
                  data-testid={`button-add-2m-${lead.id}`}
                >
                  +2 mo
                </Button>
              </div>
            </div>
            
            {lead.nextContactSource === 'manual' && (
              <div className="space-y-1">
                <Input
                  value={contactReason}
                  onChange={(e) => setContactReason(e.target.value)}
                  placeholder="Reason (e.g., 'Client asked to call in 2 months')"
                  className="h-7 text-xs"
                  onBlur={async () => {
                    if (contactReason !== lead.nextContactReason && orgId && authReady) {
                      await updateLeadInFirestore(orgId, lead.id, { nextContactReason: contactReason }, authReady);
                      dispatch(updateLead({ ...lead, nextContactReason: contactReason }));
                    }
                  }}
                  data-testid={`input-contact-reason-${lead.id}`}
                />
              </div>
            )}
            
            {lead.nextContactReason && lead.nextContactSource === 'manual' && (
              <p className="text-xs text-muted-foreground italic">"{lead.nextContactReason}"</p>
            )}
          </div>

          {/* MRR */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">MRR: ${lead.mrr || 0}/mo</span>
            <span className="text-muted-foreground">- Weighted: $0</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={lead.mrr || ''}
              onChange={(e) => handleUpdateField('mrr', e.target.value ? Number(e.target.value) : undefined)}
              className="h-8 w-20"
              placeholder="0"
              data-testid={`input-mrr-${lead.id}`}
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => console.log('Save MRR')}
              data-testid={`button-save-mrr-${lead.id}`}
            >
              Save MRR
            </Button>
          </div>

          {/* Activity Buttons */}
          <div className="space-y-2">
            <ActivityButton type="call" label="Log Call" />
            <ActivityButton type="email" label="Log Email" />
            <ActivityButton type="sms" label="Log SMS" />
            <ActivityButton type="meeting" label="Log Meeting" />
            <ActivityButton type="meeting_booked" label="Meeting Booked" />
            <ActivityButton type="dropin" label="Log Drop-in" />
          </div>

          {/* Playbooks */}
          <div className="p-3 bg-muted/50 rounded-md">
            <p className="text-sm font-medium">Playbooks (stage-aware templates)</p>
          </div>

          {/* NEPQ Label */}
          <div className="space-y-1">
            <Label className="text-xs">NEPQ label</Label>
            <Select value={lead.nepqLabel || 'none'} onValueChange={(val) => handleUpdateField('nepqLabel', val === 'none' ? undefined : val)}>
              <SelectTrigger className="h-9" data-testid={`select-nepq-${lead.id}`}>
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">--</SelectItem>
                {NEPQ_LABELS.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Nurture Enrollment */}
          <NurtureEnrollmentSection lead={lead} />

          {/* Primary Contact */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Primary contact</Label>
            <Input
              value={lead.contactName || ''}
              onChange={(e) => handleUpdateField('contactName', e.target.value)}
              placeholder="Name"
              className="h-8"
              data-testid={`input-contact-${lead.id}`}
            />
            <Input
              value={lead.phone || ''}
              onChange={(e) => handleUpdateField('phone', e.target.value)}
              placeholder="Phone"
              className="h-8"
              data-testid={`input-phone-${lead.id}`}
            />
            <Input
              value={lead.email || ''}
              onChange={(e) => handleUpdateField('email', e.target.value)}
              placeholder="Email"
              className="h-8"
              data-testid={`input-email-${lead.id}`}
            />
            <Input
              value={lead.website || ''}
              onChange={(e) => handleUpdateField('website', e.target.value)}
              placeholder="Website URL"
              className="h-8"
              data-testid={`input-website-${lead.id}`}
            />
            <div className="grid grid-cols-3 gap-2">
              <div className="relative">
                <SiFacebook className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-600" />
                <Input
                  value={lead.facebookUrl || ''}
                  onChange={(e) => handleUpdateField('facebookUrl', e.target.value)}
                  placeholder="Facebook"
                  className="h-8 pl-8 text-xs"
                  data-testid={`input-facebook-${lead.id}`}
                />
              </div>
              <div className="relative">
                <SiInstagram className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-pink-600" />
                <Input
                  value={lead.instagramUrl || ''}
                  onChange={(e) => handleUpdateField('instagramUrl', e.target.value)}
                  placeholder="Instagram"
                  className="h-8 pl-8 text-xs"
                  data-testid={`input-instagram-${lead.id}`}
                />
              </div>
              <div className="relative">
                <SiLinkedin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-700" />
                <Input
                  value={lead.linkedinUrl || ''}
                  onChange={(e) => handleUpdateField('linkedinUrl', e.target.value)}
                  placeholder="LinkedIn"
                  className="h-8 pl-8 text-xs"
                  data-testid={`input-linkedin-${lead.id}`}
                />
              </div>
            </div>
            {(lead.website || lead.facebookUrl || lead.instagramUrl || lead.linkedinUrl) && (
              <div className="flex items-center gap-2 flex-wrap">
                {lead.website && (
                  <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                    <Globe className="h-4 w-4" />
                  </a>
                )}
                {lead.facebookUrl && (
                  <a href={lead.facebookUrl.startsWith('http') ? lead.facebookUrl : `https://facebook.com/${lead.facebookUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                    <SiFacebook className="h-4 w-4" />
                  </a>
                )}
                {lead.instagramUrl && (
                  <a href={lead.instagramUrl.startsWith('http') ? lead.instagramUrl : `https://instagram.com/${lead.instagramUrl}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:text-pink-700">
                    <SiInstagram className="h-4 w-4" />
                  </a>
                )}
                {lead.linkedinUrl && (
                  <a href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://linkedin.com/company/${lead.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-800">
                    <SiLinkedin className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
            {/* Quick Send Actions with AI */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                Quick Actions
                <Badge variant="outline" className="text-[10px] h-4 px-1 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300">
                  AI
                </Badge>
              </Label>
              <div className="flex items-center gap-2 flex-wrap">
                {lead.phone && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      asChild
                      data-testid={`button-call-${lead.id}`}
                    >
                      <a href={`tel:${lead.phone}`}>
                        <Phone className="h-3 w-3" />
                        Call
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
                      asChild
                      data-testid={`button-sms-${lead.id}`}
                    >
                      <a href={`sms:${lead.phone}`}>
                        <MessageSquare className="h-3 w-3" />
                        Text
                      </a>
                    </Button>
                  </>
                )}
                {lead.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                    onClick={() => openAiMessageModal('email')}
                    data-testid={`button-email-${lead.id}`}
                  >
                    <Mail className="h-3 w-3" />
                    Email
                  </Button>
                )}
                {!lead.phone && !lead.email && (
                  <span className="text-xs text-muted-foreground">Add phone or email to enable quick actions</span>
                )}
                {/* Outreach Scripts button for all pipeline stages */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                  onClick={() => setOutreachScriptsOpen(true)}
                  data-testid={`button-outreach-scripts-${lead.id}`}
                >
                  <Sparkles className="h-3 w-3" />
                  Outreach Scripts
                </Button>
              </div>
            </div>
          </div>

          {/* CRM Link */}
          <div className="space-y-2">
            <Label className="text-xs">Salesforce link (local)</Label>
            <Input
              value={lead.crmLink || ''}
              onChange={(e) => handleUpdateField('crmLink', e.target.value)}
              placeholder="https://... (paste here)"
              className="h-8"
              data-testid={`input-crm-${lead.id}`}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => console.log('Save')}>Save</Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => lead.crmLink && navigator.clipboard.writeText(lead.crmLink)}
              >
                Copy
              </Button>
              {lead.crmLink && (
                <Button variant="outline" size="sm" asChild>
                  <a href={lead.crmLink} target="_blank" rel="noopener noreferrer">Open</a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Stored per-deal in your browser (local). No CRM writeback.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={lead.notes || ''}
              onChange={(e) => handleUpdateField('notes', e.target.value)}
              placeholder="Call notes, objections, next steps..."
              rows={3}
              className="text-sm"
              data-testid={`textarea-notes-${lead.id}`}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => console.log('Save notes')}>
                Save notes
              </Button>
              {dictationSupported && (
                <Button
                  variant={isListening ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleRecording}
                  className={`gap-1 ${isListening ? 'animate-pulse' : ''}`}
                >
                  {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  {isListening ? 'Stop dictation' : 'Start dictation'}
                </Button>
              )}
            </div>
          </div>

          {/* Move Stage Controls */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <button 
              className="text-sm underline text-muted-foreground"
              onClick={() => handleMoveStage('left')}
              disabled={STAGE_ORDER.indexOf(lead.stage) === 0}
            >
              Move left
            </button>
            <span className="text-sm text-muted-foreground">{STAGE_LABELS[lead.stage]}</span>
            <button 
              className="text-sm underline text-muted-foreground"
              onClick={() => handleMoveStage('right')}
              disabled={STAGE_ORDER.indexOf(lead.stage) === STAGE_ORDER.length - 1}
            >
              Move right
            </button>
          </div>

          {/* Archive/Delete */}
          <div className="flex items-center gap-4 pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-sm underline text-muted-foreground">Archive</button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will move the lead to the archive.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-sm underline text-red-600" disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      
      {/* AI Message Modal */}
      <AIMessageModal
        open={aiMessageModalOpen}
        onOpenChange={setAiMessageModalOpen}
        channel={aiMessageChannel}
        lead={lead}
        activityHistory={leadActivityHistory}
      />

      {/* Outreach Scripts Dialog */}
      <OutreachScriptsDialog
        lead={lead}
        open={outreachScriptsOpen}
        onOpenChange={setOutreachScriptsOpen}
        notes={lead.notes}
        activityHistory={activities
          .filter(a => a.leadId === lead.id)
          .slice(0, 10)
          .map(a => ({
            type: a.type,
            date: a.createdAt,
            notes: a.notes || ''
          }))}
        activityCounts={activityCounts}
      />
    </Card>
  );
}

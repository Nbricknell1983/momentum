import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { format } from 'date-fns';
import { Phone, Mail, MessageSquare, Clock, ArrowRight, Check, MoreHorizontal, Filter, X, Sparkles, Copy, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { RootState, setNurtureTab, updateNurtureStatus, logNurtureTouch, snoozeNurtureTouch, moveToPipeline, updateLead, addActivity } from '@/store';
import { Lead, NurtureStatus, NURTURE_STATUS_LABELS, NURTURE_STATUS_ORDER, TouchChannel, CADENCES, Activity } from '@/lib/types';
import { updateLeadInFirestore, createActivity } from '@/lib/firestoreService';

interface OutreachScripts {
  textScript: string;
  emailScript: string;
  callScript: string;
}

function NurtureCard({ lead, onAction, onOpen }: { lead: Lead; onAction: (action: string, data?: unknown) => void; onOpen: () => void }) {
  const nextTouchDate = lead.nextTouchAt ? new Date(lead.nextTouchAt) : null;
  const lastTouchDate = lead.lastTouchAt ? new Date(lead.lastTouchAt) : null;
  const isOverdue = nextTouchDate && nextTouchDate < new Date();
  const isDueToday = nextTouchDate && format(nextTouchDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <Card 
      className="mb-2 cursor-pointer hover-elevate" 
      data-testid={`nurture-card-${lead.id}`}
      onClick={onOpen}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate" data-testid={`text-company-${lead.id}`}>{lead.companyName}</h4>
            <p className="text-xs text-muted-foreground">{lead.territory}</p>
          </div>
          {lead.mrr && lead.mrr > 0 && (
            <Badge variant="secondary" className="text-xs shrink-0">
              ${lead.mrr.toLocaleString()}/mo
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {nextTouchDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 dark:text-red-400' : isDueToday ? 'text-amber-600 dark:text-amber-400' : ''}`}>
              <Clock className="h-3 w-3" />
              {format(nextTouchDate, 'MMM d')}
            </span>
          )}
          {lead.lastTouchChannel && lastTouchDate && (
            <span className="flex items-center gap-1">
              {lead.lastTouchChannel === 'call' && <Phone className="h-3 w-3" />}
              {lead.lastTouchChannel === 'email' && <Mail className="h-3 w-3" />}
              {lead.lastTouchChannel === 'sms' && <MessageSquare className="h-3 w-3" />}
              {format(lastTouchDate, 'MMM d')}
            </span>
          )}
          {lead.touchesNoResponse > 0 && (
            <Badge variant="outline" className="text-xs">
              {lead.touchesNoResponse} no response
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => onAction('call')} data-testid={`button-call-${lead.id}`}>
            <Phone className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction('sms')} data-testid={`button-sms-${lead.id}`}>
            <MessageSquare className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction('email')} data-testid={`button-email-${lead.id}`}>
            <Mail className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction('response')} data-testid={`button-response-${lead.id}`}>
            <Check className="h-3 w-3" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" data-testid={`button-more-${lead.id}`}>
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onAction('snooze', 1)}>Snooze 1 day</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction('snooze', 3)}>Snooze 3 days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction('snooze', 7)}>Snooze 7 days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction('toPipeline')}>
                <ArrowRight className="h-4 w-4 mr-2" />
                Move to Pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function NurtureColumn({ status, leads, onDrop, onAction, onOpenLead }: { 
  status: NurtureStatus; 
  leads: Lead[]; 
  onDrop: (leadId: string, status: NurtureStatus) => void;
  onAction: (leadId: string, action: string, data?: unknown) => void;
  onOpenLead: (leadId: string) => void;
}) {
  const statusLabel = status ? NURTURE_STATUS_LABELS[status] : 'Unknown';
  
  return (
    <div 
      className="flex flex-col w-72 shrink-0 bg-muted/30 rounded-lg"
      data-testid={`nurture-column-${status}`}
    >
      <div className="p-3 border-b">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-sm truncate">{statusLabel}</h3>
          <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
        </div>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {leads.map(lead => (
            <div key={lead.id} data-id={lead.id}>
              <NurtureCard 
                lead={lead} 
                onAction={(action, data) => onAction(lead.id, action, data)}
                onOpen={() => onOpenLead(lead.id)}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TodayQueue({ leads, onAction, onOpenLead }: { 
  leads: Lead[]; 
  onAction: (leadId: string, action: string, data?: unknown) => void;
  onOpenLead: (leadId: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | TouchChannel>('all');

  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');

  const filteredLeads = leads
    .filter(lead => {
      if (!lead.nextTouchAt) return false;
      const touchDate = new Date(lead.nextTouchAt);
      const touchDay = format(touchDate, 'yyyy-MM-dd');
      
      if (filter === 'overdue') return touchDate < now && touchDay !== today;
      if (filter === 'today') return touchDay === today;
      return touchDate <= now || touchDay === today;
    })
    .filter(lead => {
      if (channelFilter === 'all') return true;
      const cadence = CADENCES.find(c => c.id === lead.nurtureCadenceId);
      if (!cadence || lead.nurtureStepIndex === null) return false;
      const currentStep = cadence.steps[lead.nurtureStepIndex];
      return currentStep?.channel === channelFilter;
    })
    .sort((a, b) => {
      const dateA = a.nextTouchAt ? new Date(a.nextTouchAt).getTime() : Infinity;
      const dateB = b.nextTouchAt ? new Date(b.nextTouchAt).getTime() : Infinity;
      if (dateA !== dateB) return dateA - dateB;
      return b.nurturePriorityScore - a.nurturePriorityScore;
    });

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-lg">Today's Nurture Queue</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-32" data-testid="select-queue-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Due</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as typeof channelFilter)}>
              <SelectTrigger className="w-32" data-testid="select-channel-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredLeads.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No touches due</p>
        ) : (
          <div className="space-y-2">
            {filteredLeads.slice(0, 10).map(lead => {
              const nextTouchDate = lead.nextTouchAt ? new Date(lead.nextTouchAt) : null;
              const isOverdue = nextTouchDate && nextTouchDate < now && format(nextTouchDate, 'yyyy-MM-dd') !== today;
              const cadence = CADENCES.find(c => c.id === lead.nurtureCadenceId);
              const currentStep = cadence && lead.nurtureStepIndex !== null ? cadence.steps[lead.nurtureStepIndex] : null;
              
              return (
                <div 
                  key={lead.id} 
                  className="flex items-center gap-3 p-2 rounded-md bg-muted/50 cursor-pointer hover-elevate"
                  data-testid={`queue-item-${lead.id}`}
                  onClick={() => onOpenLead(lead.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{lead.companyName}</span>
                      {isOverdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{lead.territory}</span>
                      {nextTouchDate && <span>{format(nextTouchDate, 'MMM d')}</span>}
                      {currentStep && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {currentStep.channel}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => onAction(lead.id, 'call')} data-testid={`queue-call-${lead.id}`}>
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction(lead.id, 'sms')} data-testid={`queue-sms-${lead.id}`}>
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction(lead.id, 'email')} data-testid={`queue-email-${lead.id}`}>
                      <Mail className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onAction(lead.id, 'response')} data-testid={`queue-response-${lead.id}`}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" data-testid={`queue-more-${lead.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => onAction(lead.id, 'snooze', 1)}>Snooze 1 day</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(lead.id, 'snooze', 3)}>Snooze 3 days</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(lead.id, 'snooze', 7)}>Snooze 7 days</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(lead.id, 'toPipeline')}>
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Move to Pipeline
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NurtureDrawer({ 
  lead, 
  open, 
  onClose, 
  onAction 
}: { 
  lead: Lead | null; 
  open: boolean; 
  onClose: () => void; 
  onAction: (leadId: string, action: string, data?: unknown) => void;
}) {
  const { orgId, user, authReady } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();
  const activities = useSelector((state: RootState) => state.app.activities);
  
  const [activeScriptTab, setActiveScriptTab] = useState<'text' | 'email' | 'call'>('text');
  const [outreachScripts, setOutreachScripts] = useState<OutreachScripts | null>(null);
  const [isGeneratingScripts, setIsGeneratingScripts] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const leadActivities = lead ? activities.filter(a => a.leadId === lead.id).slice(0, 5) : [];

  const generateOutreachScripts = async () => {
    if (!lead) return;
    
    setIsGeneratingScripts(true);
    
    try {
      const businessSignals: string[] = [];
      if (lead.touchesNoResponse > 0) businessSignals.push(`${lead.touchesNoResponse} previous touches with no response`);
      if (lead.nurtureStatus === 'warming') businessSignals.push('Lead is warming up to engagement');
      if (lead.nurtureStatus === 'engaged') businessSignals.push('Lead has shown engagement');
      if (lead.website) businessSignals.push('Has website presence');

      const relationshipContext = [
        lead.notes ? `Notes: ${lead.notes}` : null,
        leadActivities.length > 0 ? `Recent activities: ${leadActivities.map(a => `${a.type} on ${format(new Date(a.date), 'MMM d')}`).join(', ')}` : null,
        lead.lastTouchChannel ? `Last contact via ${lead.lastTouchChannel}` : null,
      ].filter(Boolean).join('\n');

      const response = await fetch('/api/leads/generate-outreach-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: lead.companyName,
          businessType: lead.territory,
          location: lead.address || lead.territory,
          phone: lead.phone,
          website: lead.website,
          source: 'nurture',
          addedReason: `Nurturing lead - currently in ${lead.nurtureStatus || 'new'} status with ${lead.touchesNoResponse} touches without response`,
          businessSignals,
          stage: 'nurture',
          relationshipContext,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate scripts');
      }

      const scripts = await response.json();
      setOutreachScripts(scripts);
    } catch (err) {
      console.error('Error generating scripts:', err);
      toast({
        title: 'Error',
        description: 'Failed to generate outreach scripts',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingScripts(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: `${type} script copied to clipboard`,
    });
  };

  const logTouchAndUpdate = async (channel: TouchChannel, notes?: string) => {
    if (!lead || !orgId || !user) return;
    
    setIsLogging(true);
    
    try {
      const now = new Date();
      
      const activity: Omit<Activity, 'id'> = {
        leadId: lead.id,
        userId: user.uid,
        type: channel,
        date: now,
        notes: notes || `Nurture ${channel} touch`,
      };
      
      const savedActivity = await createActivity(orgId, activity, authReady);
      dispatch(addActivity(savedActivity));
      
      const updatedLead: Partial<Lead> = {
        lastTouchAt: now,
        lastTouchChannel: channel,
        touchesNoResponse: (lead.touchesNoResponse || 0) + 1,
        updatedAt: now,
      };
      
      await updateLeadInFirestore(orgId, lead.id, updatedLead, authReady);
      dispatch(updateLead({ ...lead, ...updatedLead }));
      
      dispatch(logNurtureTouch({ leadId: lead.id, channel, responseReceived: false }));
      
      toast({
        title: 'Touch logged',
        description: `${channel.charAt(0).toUpperCase() + channel.slice(1)} touch recorded`,
      });
    } catch (err) {
      console.error('Error logging touch:', err);
      toast({
        title: 'Error',
        description: 'Failed to log touch',
        variant: 'destructive',
      });
    } finally {
      setIsLogging(false);
    }
  };

  const markResponse = async () => {
    if (!lead || !orgId) return;
    
    setIsLogging(true);
    
    try {
      const now = new Date();
      
      const updatedLead: Partial<Lead> = {
        touchesNoResponse: 0,
        nurtureStatus: 'engaged' as NurtureStatus,
        updatedAt: now,
      };
      
      await updateLeadInFirestore(orgId, lead.id, updatedLead, authReady);
      dispatch(updateLead({ ...lead, ...updatedLead }));
      dispatch(updateNurtureStatus({ leadId: lead.id, status: 'engaged' }));
      
      toast({
        title: 'Response recorded',
        description: 'Lead marked as engaged! Consider moving back to pipeline.',
      });
    } catch (err) {
      console.error('Error marking response:', err);
      toast({
        title: 'Error',
        description: 'Failed to record response',
        variant: 'destructive',
      });
    } finally {
      setIsLogging(false);
    }
  };

  const moveBackToPipeline = () => {
    if (!lead) return;
    onAction(lead.id, 'toPipeline');
    onClose();
  };

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span className="truncate">{lead.companyName}</span>
            <Badge variant="outline" className="shrink-0 capitalize">
              {lead.nurtureStatus || 'new'}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{lead.territory}</span>
              {lead.phone && (
                <>
                  <span>|</span>
                  <a href={`tel:${lead.phone}`} className="hover:underline flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {lead.phone}
                  </a>
                </>
              )}
            </div>
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {lead.email}
              </a>
            )}
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Website
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={lead.touchesNoResponse > 3 ? 'destructive' : 'secondary'}>
              {lead.touchesNoResponse || 0} touches no response
            </Badge>
            {lead.lastTouchAt && (
              <Badge variant="outline">
                Last: {format(new Date(lead.lastTouchAt), 'MMM d')}
              </Badge>
            )}
            {lead.nextTouchAt && (
              <Badge variant="outline">
                Next: {format(new Date(lead.nextTouchAt), 'MMM d')}
              </Badge>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">Quick Actions</h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Button 
                variant="outline" 
                className="flex flex-col h-auto py-3 gap-1"
                onClick={() => logTouchAndUpdate('call')}
                disabled={isLogging}
                data-testid="drawer-action-call"
              >
                <Phone className="h-5 w-5" />
                <span className="text-xs">Call</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex flex-col h-auto py-3 gap-1"
                onClick={() => logTouchAndUpdate('sms')}
                disabled={isLogging}
                data-testid="drawer-action-sms"
              >
                <MessageSquare className="h-5 w-5" />
                <span className="text-xs">Text</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex flex-col h-auto py-3 gap-1"
                onClick={() => logTouchAndUpdate('email')}
                disabled={isLogging}
                data-testid="drawer-action-email"
              >
                <Mail className="h-5 w-5" />
                <span className="text-xs">Email</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex flex-col h-auto py-3 gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
                onClick={markResponse}
                disabled={isLogging}
                data-testid="drawer-action-response"
              >
                <Check className="h-5 w-5" />
                <span className="text-xs">Response!</span>
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Outreach Scripts
              </h3>
              <Button 
                size="sm" 
                variant="outline"
                onClick={generateOutreachScripts}
                disabled={isGeneratingScripts}
                data-testid="button-generate-scripts"
              >
                {isGeneratingScripts ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Generating...
                  </>
                ) : outreachScripts ? (
                  'Regenerate'
                ) : (
                  'Generate Scripts'
                )}
              </Button>
            </div>

            {outreachScripts && (
              <Tabs value={activeScriptTab} onValueChange={(v) => setActiveScriptTab(v as typeof activeScriptTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="text" data-testid="tab-text-script">
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="email" data-testid="tab-email-script">
                    <Mail className="h-4 w-4 mr-1" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger value="call" data-testid="tab-call-script">
                    <Phone className="h-4 w-4 mr-1" />
                    Call
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="mt-3">
                  <div className="relative">
                    <Textarea 
                      value={outreachScripts.textScript} 
                      readOnly 
                      className="min-h-[150px] text-sm"
                      data-testid="script-text"
                    />
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(outreachScripts.textScript, 'Text')}
                      data-testid="button-copy-text"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button 
                    className="w-full mt-2" 
                    onClick={() => {
                      copyToClipboard(outreachScripts.textScript, 'Text');
                      logTouchAndUpdate('sms', outreachScripts.textScript);
                    }}
                    disabled={isLogging}
                    data-testid="button-send-text"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Copy & Log Text
                  </Button>
                </TabsContent>
                <TabsContent value="email" className="mt-3">
                  <div className="relative">
                    <Textarea 
                      value={outreachScripts.emailScript} 
                      readOnly 
                      className="min-h-[200px] text-sm"
                      data-testid="script-email"
                    />
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(outreachScripts.emailScript, 'Email')}
                      data-testid="button-copy-email"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button 
                    className="w-full mt-2" 
                    onClick={() => {
                      copyToClipboard(outreachScripts.emailScript, 'Email');
                      logTouchAndUpdate('email', outreachScripts.emailScript);
                    }}
                    disabled={isLogging}
                    data-testid="button-send-email"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Copy & Log Email
                  </Button>
                </TabsContent>
                <TabsContent value="call" className="mt-3">
                  <div className="relative">
                    <Textarea 
                      value={outreachScripts.callScript} 
                      readOnly 
                      className="min-h-[250px] text-sm"
                      data-testid="script-call"
                    />
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(outreachScripts.callScript, 'Call')}
                      data-testid="button-copy-call"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {lead.phone && (
                    <Button 
                      className="w-full mt-2" 
                      onClick={() => {
                        window.location.href = `tel:${lead.phone}`;
                        logTouchAndUpdate('call', 'Called using AI script');
                      }}
                      disabled={isLogging}
                      data-testid="button-call-now"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Call Now & Log
                    </Button>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {!outreachScripts && !isGeneratingScripts && (
              <div className="text-center py-6 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Generate AI-powered outreach scripts</p>
                <p className="text-xs">Using NEPQ, Jeb Blount & Chris Voss frameworks</p>
              </div>
            )}
          </div>

          {lead.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Notes</Label>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
              </div>
            </>
          )}

          {leadActivities.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Recent Activity</Label>
                <div className="space-y-2">
                  {leadActivities.map(activity => (
                    <div key={activity.id} className="flex items-center gap-2 text-sm">
                      {activity.type === 'call' && <Phone className="h-3 w-3" />}
                      {activity.type === 'email' && <Mail className="h-3 w-3" />}
                      {activity.type === 'sms' && <MessageSquare className="h-3 w-3" />}
                      <span className="capitalize">{activity.type}</span>
                      <span className="text-muted-foreground">
                        {format(new Date(activity.date), 'MMM d, yyyy')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => onAction(lead.id, 'snooze', 7)}
              data-testid="button-snooze-7"
            >
              <Clock className="h-4 w-4 mr-2" />
              Snooze 7 days
            </Button>
            <Button 
              className="flex-1"
              onClick={moveBackToPipeline}
              data-testid="button-to-pipeline"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Back to Pipeline
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function NurturePage() {
  const dispatch = useDispatch();
  const leads = useSelector((state: RootState) => state.app.leads);
  const nurtureTab = useSelector((state: RootState) => state.app.nurtureTab);
  const { toast } = useToast();
  
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const nurtureLeads = leads.filter(lead => 
    lead.nurtureMode === nurtureTab && !lead.archived
  );
  
  const selectedLead = selectedLeadId ? leads.find(l => l.id === selectedLeadId) || null : null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const status = over.id as NurtureStatus;
      if (NURTURE_STATUS_ORDER.includes(status)) {
        dispatch(updateNurtureStatus({ leadId: active.id as string, status }));
      }
    }
  };

  const handleOpenLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    setDrawerOpen(true);
  };

  const handleAction = (leadId: string, action: string, data?: unknown) => {
    switch (action) {
      case 'call':
        dispatch(logNurtureTouch({ leadId, channel: 'call', responseReceived: false }));
        toast({ title: 'Call logged', description: 'Touch recorded' });
        break;
      case 'sms':
        dispatch(logNurtureTouch({ leadId, channel: 'sms', responseReceived: false }));
        toast({ title: 'Text logged', description: 'Touch recorded' });
        break;
      case 'email':
        dispatch(logNurtureTouch({ leadId, channel: 'email', responseReceived: false }));
        toast({ title: 'Email logged', description: 'Touch recorded' });
        break;
      case 'response':
        const lead = leads.find(l => l.id === leadId);
        dispatch(logNurtureTouch({ 
          leadId, 
          channel: lead?.lastTouchChannel || 'call', 
          responseReceived: true 
        }));
        toast({ title: 'Response recorded!', description: 'Lead is now engaged' });
        break;
      case 'snooze':
        dispatch(snoozeNurtureTouch({ leadId, days: data as number }));
        toast({ title: 'Snoozed', description: `Next touch in ${data} days` });
        break;
      case 'toPipeline':
        dispatch(moveToPipeline({ leadId, stage: 'suspect' }));
        toast({ title: 'Moved to Pipeline', description: 'Lead is back in your sales pipeline' });
        break;
    }
  };

  const getLeadsByStatus = (status: NurtureStatus) => {
    return nurtureLeads.filter(lead => lead.nurtureStatus === status);
  };

  return (
    <div className="flex flex-col h-full p-4">
      <Tabs value={nurtureTab} onValueChange={(v) => dispatch(setNurtureTab(v as 'active' | 'passive'))}>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="active" data-testid="tab-active-nurture">Active Nurture</TabsTrigger>
            <TabsTrigger value="passive" data-testid="tab-passive-nurture">Passive Nurture (Parking)</TabsTrigger>
          </TabsList>
          <div className="text-sm text-muted-foreground">
            {nurtureLeads.length} leads in {nurtureTab === 'active' ? 'Active' : 'Passive'} Nurture
          </div>
        </div>

        <TabsContent value="active" className="mt-0 flex-1 flex flex-col">
          <TodayQueue 
            leads={leads.filter(l => l.nurtureMode === 'active' && !l.archived)} 
            onAction={handleAction}
            onOpenLead={handleOpenLead}
          />
          <ScrollArea className="flex-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 min-w-max pb-4">
                {NURTURE_STATUS_ORDER.filter(s => s !== null).map(status => (
                  <NurtureColumn
                    key={status}
                    status={status}
                    leads={getLeadsByStatus(status)}
                    onDrop={(leadId, newStatus) => dispatch(updateNurtureStatus({ leadId, status: newStatus }))}
                    onAction={handleAction}
                    onOpenLead={handleOpenLead}
                  />
                ))}
              </div>
            </DndContext>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="passive" className="mt-0 flex-1 flex flex-col">
          <TodayQueue 
            leads={leads.filter(l => l.nurtureMode === 'passive' && !l.archived)} 
            onAction={handleAction}
            onOpenLead={handleOpenLead}
          />
          <ScrollArea className="flex-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 min-w-max pb-4">
                {NURTURE_STATUS_ORDER.filter(s => s !== null).map(status => (
                  <NurtureColumn
                    key={status}
                    status={status}
                    leads={getLeadsByStatus(status)}
                    onDrop={(leadId, newStatus) => dispatch(updateNurtureStatus({ leadId, status: newStatus }))}
                    onAction={handleAction}
                    onOpenLead={handleOpenLead}
                  />
                ))}
              </div>
            </DndContext>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <NurtureDrawer 
        lead={selectedLead}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLeadId(null);
        }}
        onAction={handleAction}
      />
    </div>
  );
}

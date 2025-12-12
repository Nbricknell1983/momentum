import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { format } from 'date-fns';
import { Phone, Mail, MessageSquare, Clock, ArrowRight, Check, MoreHorizontal, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { RootState, setNurtureTab, updateNurtureStatus, logNurtureTouch, snoozeNurtureTouch, moveToPipeline } from '@/store';
import { Lead, NurtureStatus, NURTURE_STATUS_LABELS, NURTURE_STATUS_ORDER, TouchChannel, CADENCES } from '@/lib/types';

function NurtureCard({ lead, onAction }: { lead: Lead; onAction: (action: string, data?: unknown) => void }) {
  const nextTouchDate = lead.nextTouchAt ? new Date(lead.nextTouchAt) : null;
  const lastTouchDate = lead.lastTouchAt ? new Date(lead.lastTouchAt) : null;
  const isOverdue = nextTouchDate && nextTouchDate < new Date();
  const isDueToday = nextTouchDate && format(nextTouchDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <Card className="mb-2 cursor-pointer" data-testid={`nurture-card-${lead.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate" data-testid={`text-company-${lead.id}`}>{lead.companyName}</h4>
            <p className="text-xs text-muted-foreground">{lead.territory}</p>
          </div>
          {lead.mrr && (
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
          <Badge variant="outline" className="text-xs">
            Score: {lead.nurturePriorityScore}
          </Badge>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
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
              <DropdownMenuItem onClick={() => onAction('toPipeline')}>Move to Pipeline</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function NurtureColumn({ status, leads, onDrop }: { status: NurtureStatus; leads: Lead[]; onDrop: (leadId: string, status: NurtureStatus) => void }) {
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
                onAction={(action, data) => {
                  // Handle actions here - passed up to parent
                }}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TodayQueue({ leads, onAction }: { leads: Lead[]; onAction: (leadId: string, action: string, data?: unknown) => void }) {
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
                  className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                  data-testid={`queue-item-${lead.id}`}
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
                  <div className="flex items-center gap-1">
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

export default function NurturePage() {
  const dispatch = useDispatch();
  const leads = useSelector((state: RootState) => state.app.leads);
  const nurtureTab = useSelector((state: RootState) => state.app.nurtureTab);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Filter leads by nurture mode
  const nurtureLeads = leads.filter(lead => 
    lead.nurtureMode === nurtureTab && !lead.archived
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const status = over.id as NurtureStatus;
      if (NURTURE_STATUS_ORDER.includes(status)) {
        dispatch(updateNurtureStatus({ leadId: active.id as string, status }));
      }
    }
  };

  const handleAction = (leadId: string, action: string, data?: unknown) => {
    switch (action) {
      case 'call':
        dispatch(logNurtureTouch({ leadId, channel: 'call', responseReceived: false }));
        break;
      case 'sms':
        dispatch(logNurtureTouch({ leadId, channel: 'sms', responseReceived: false }));
        break;
      case 'email':
        dispatch(logNurtureTouch({ leadId, channel: 'email', responseReceived: false }));
        break;
      case 'response':
        // Mark response received - find last touch channel or default to call
        const lead = leads.find(l => l.id === leadId);
        dispatch(logNurtureTouch({ 
          leadId, 
          channel: lead?.lastTouchChannel || 'call', 
          responseReceived: true 
        }));
        break;
      case 'snooze':
        dispatch(snoozeNurtureTouch({ leadId, days: data as number }));
        break;
      case 'toPipeline':
        dispatch(moveToPipeline({ leadId, stage: 'suspect' }));
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
                  />
                ))}
              </div>
            </DndContext>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  Target, Clock, CheckCircle2, Sparkles, Play, Lock, MapPin, 
  Phone, Building2, MessageSquare, Calendar, Users, RefreshCw,
  ChevronRight, X, AlertTriangle, Zap, Trophy
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RootState } from '@/store';
import { 
  completeAction, skipAction, completeRouteStop, addRouteStop, addActionToQueue,
  removeRouteStop, submitDebrief, setDailyPlanSummary, markQueuesInitialized 
} from '@/store';
import { 
  DailyPlan, DailyPlanSummary, ActionQueueItem, TimeBlock, RouteStop,
  TIME_BLOCK_LABELS, ACTION_TYPE_LABELS, URGENCY_LABELS, BATTLE_SCORE_POINTS,
  getTrafficLightStatus, Lead
} from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function DailyPlanPage() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const dailyPlan = useSelector((state: RootState) => state.app.dailyPlan);
  const leads = useSelector((state: RootState) => state.app.leads);
  
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  const [isGeneratingDebrief, setIsGeneratingDebrief] = useState(false);
  const [debriefResult, setDebriefResult] = useState<{
    aiReview?: string;
    improvements?: string[];
    tomorrowsFocus?: string;
  } | null>(null);

  if (!dailyPlan) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading daily plan...</p>
      </div>
    );
  }

  useEffect(() => {
    if (!dailyPlan || dailyPlan.isQueuesInitialized || leads.length === 0) {
      return;
    }
    
    const priorityLeads = leads
      .filter(lead => !lead.archived && getTrafficLightStatus(lead) !== 'green')
      .slice(0, 8);
    priorityLeads.forEach(lead => {
      dispatch(addActionToQueue({
        id: `action-${lead.id}`,
        type: 'call',
        leadId: lead.id,
        title: `Call ${lead.companyName}`,
        subtitle: lead.contactName || undefined,
        urgency: getTrafficLightStatus(lead) === 'red' ? 'high' : 'medium',
        priorityScore: (lead.mrr || 0) + (getTrafficLightStatus(lead) === 'red' ? 100 : 0),
        status: 'pending',
        battleScorePoints: BATTLE_SCORE_POINTS.call,
      }));
    });
    
    const routeLeads = leads
      .filter(lead => !lead.archived && lead.address && getTrafficLightStatus(lead) !== 'green')
      .slice(0, 5);
    routeLeads.forEach((lead, i) => {
      dispatch(addRouteStop({
        id: `stop-${lead.id}`,
        leadId: lead.id,
        companyName: lead.companyName,
        address: lead.address || '',
        priority: i + 1,
        completed: false,
      }));
    });
    
    dispatch(markQueuesInitialized());
  }, [dailyPlan?.isQueuesInitialized, leads.length, dispatch]);

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const priorityLeads = leads
        .filter(lead => !lead.archived && lead.nextContactDate)
        .filter(lead => getTrafficLightStatus(lead) !== 'green')
        .slice(0, 5)
        .map(l => ({ name: l.companyName, stage: l.stage, mrr: l.mrr }));

      const response = await fetch('/api/daily-plan/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: priorityLeads,
          metrics: {
            calls: dailyPlan.targets.prospecting.calls.completed,
            doors: dailyPlan.targets.prospecting.doors.completed,
            meetings: dailyPlan.targets.prospecting.meetingsBooked.completed,
          },
          targets: {
            calls: dailyPlan.targets.prospecting.calls.target,
            doors: dailyPlan.targets.prospecting.doors.target,
            meetings: dailyPlan.targets.prospecting.meetingsBooked.target,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to generate summary');
      
      const data = await response.json();
      dispatch(setDailyPlanSummary({
        todaysFocus: data.todaysFocus,
        nonNegotiableActions: data.nonNegotiableActions || [],
        riskAreas: data.riskAreas || [],
        generatedAt: new Date(),
      }));
      
      toast({ title: 'Daily plan generated', description: 'Your AI-powered daily plan is ready.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate daily plan summary.', variant: 'destructive' });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleGenerateDebrief = async () => {
    setIsGeneratingDebrief(true);
    try {
      const completedActions = dailyPlan.actionQueue.filter(a => a.status === 'completed').length;
      
      const response = await fetch('/api/daily-plan/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: dailyPlan.targets,
          completedActions,
          battleScore: dailyPlan.battleScoreEarned,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate debrief');
      
      const data = await response.json();
      setDebriefResult(data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate debrief.', variant: 'destructive' });
    } finally {
      setIsGeneratingDebrief(false);
    }
  };

  const handleSubmitDebrief = () => {
    if (debriefResult) {
      const planned = dailyPlan.actionQueue.length;
      const completed = dailyPlan.actionQueue.filter(a => a.status === 'completed').length;
      dispatch(submitDebrief({
        completed: true,
        aiReview: debriefResult.aiReview,
        plannedVsCompleted: {
          planned,
          completed,
          percentage: planned > 0 ? Math.round((completed / planned) * 100) : 0,
        },
        improvements: debriefResult.improvements,
        tomorrowsFocus: debriefResult.tomorrowsFocus,
        submittedAt: new Date(),
      }));
      setIsDebriefOpen(false);
      toast({ title: 'Debrief submitted', description: 'Great work today!' });
    }
  };

  const handleCompleteAction = (actionId: string) => {
    dispatch(completeAction(actionId));
    toast({ title: 'Action completed', description: 'Battle score updated!' });
  };

  const handleSkipAction = (actionId: string) => {
    dispatch(skipAction(actionId));
  };

  const handleCompleteRouteStop = (stopId: string) => {
    dispatch(completeRouteStop(stopId));
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'door': return <Building2 className="h-4 w-4" />;
      case 'email': return <MessageSquare className="h-4 w-4" />;
      case 'meeting': return <Calendar className="h-4 w-4" />;
      case 'follow_up': return <RefreshCw className="h-4 w-4" />;
      case 'check_in': return <Users className="h-4 w-4" />;
      default: return <CheckCircle2 className="h-4 w-4" />;
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-amber-500';
      case 'low': return 'text-muted-foreground';
      default: return '';
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-daily-plan-title">Daily Plan</h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="gap-2 text-base py-1 px-3" data-testid="badge-battle-score">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="font-mono font-bold">{dailyPlan.battleScoreEarned}</span>
            <span className="text-muted-foreground">Battle Score</span>
          </Badge>
        </div>
      </div>

      {/* AI Summary Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h2 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Daily Brief
          </h2>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            data-testid="button-generate-summary"
          >
            {isGeneratingSummary ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {dailyPlan.summary ? 'Regenerate' : 'Generate Plan'}
              </>
            )}
          </Button>
        </div>
        
        {dailyPlan.summary ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Today's Focus</p>
              <p className="font-medium" data-testid="text-todays-focus">{dailyPlan.summary.todaysFocus}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                  <Zap className="h-3 w-3" />
                  Non-Negotiables
                </p>
                <ul className="space-y-1">
                  {dailyPlan.summary.nonNegotiableActions.map((action, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3" />
                  Risk Areas
                </p>
                <ul className="space-y-1">
                  {dailyPlan.summary.riskAreas.map((risk, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            Click "Generate Plan" to get your AI-powered daily brief based on your leads and targets.
          </p>
        )}
      </Card>

      {/* Calendar View */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Today's Schedule
        </h2>
        <div className="relative" data-testid="calendar-view">
          {/* Time axis */}
          <div className="flex">
            <div className="w-16 shrink-0" />
            <div className="flex-1 grid grid-cols-9 gap-0 text-xs text-muted-foreground mb-2">
              {['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm'].map(time => (
                <div key={time} className="text-center">{time}</div>
              ))}
            </div>
          </div>
          
          {/* Schedule rows */}
          <div className="space-y-2">
            {/* Time blocks row */}
            <div className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-xs text-muted-foreground">Blocks</div>
              <div className="flex-1 relative h-12 bg-muted/30 rounded-md overflow-hidden">
                {dailyPlan.timeBlocks.map(block => {
                  const startHour = parseInt(block.startTime.split(':')[0]);
                  const endHour = parseInt(block.endTime.split(':')[0]);
                  const startOffset = ((startHour - 9) / 8) * 100;
                  const width = ((endHour - startHour) / 8) * 100;
                  
                  const blockColors: Record<string, string> = {
                    prospecting_calls: 'bg-blue-500/20 border-blue-500/40',
                    prospecting_doors: 'bg-green-500/20 border-green-500/40',
                    client_management: 'bg-purple-500/20 border-purple-500/40',
                    meetings: 'bg-amber-500/20 border-amber-500/40',
                    admin: 'bg-gray-500/20 border-gray-500/40',
                  };
                  
                  return (
                    <div
                      key={block.id}
                      className={`absolute top-1 bottom-1 rounded border ${blockColors[block.type] || 'bg-muted border-muted-foreground/20'} flex items-center justify-center px-2`}
                      style={{ left: `${startOffset}%`, width: `${width}%` }}
                      title={`${block.name}: ${block.startTime} - ${block.endTime}`}
                    >
                      <span className="text-xs font-medium truncate flex items-center gap-1">
                        {block.isLocked && <Lock className="h-3 w-3" />}
                        {block.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Current time indicator */}
            <div className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-xs text-muted-foreground">Now</div>
              <div className="flex-1 relative h-6">
                {(() => {
                  const now = new Date();
                  const currentHour = now.getHours() + now.getMinutes() / 60;
                  if (currentHour >= 9 && currentHour <= 17) {
                    const position = ((currentHour - 9) / 8) * 100;
                    return (
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                        style={{ left: `${position}%` }}
                      >
                        <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-red-500" />
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-dashed border-muted-foreground/30" />
                </div>
              </div>
            </div>
            
            {/* Actions timeline */}
            <div className="flex items-start gap-2">
              <div className="w-16 shrink-0 text-xs text-muted-foreground pt-1">Actions</div>
              <div className="flex-1 flex flex-wrap gap-1">
                {dailyPlan.actionQueue.slice(0, 6).map(action => (
                  <Badge 
                    key={action.id} 
                    variant={action.status === 'completed' ? 'secondary' : 'outline'}
                    className={`text-xs ${action.status === 'completed' ? 'opacity-60' : ''}`}
                  >
                    {getActionIcon(action.type)}
                    <span className="ml-1 truncate max-w-20">{action.title.replace('Call ', '')}</span>
                  </Badge>
                ))}
                {dailyPlan.actionQueue.length > 6 && (
                  <Badge variant="outline" className="text-xs">
                    +{dailyPlan.actionQueue.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Targets & Time Blocks */}
        <div className="space-y-6">
          {/* Daily Targets - Prospecting */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Prospecting Targets
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Calls', data: dailyPlan.targets.prospecting.calls },
                { label: 'Door Knocks', data: dailyPlan.targets.prospecting.doors },
                { label: 'Conversations', data: dailyPlan.targets.prospecting.conversations },
                { label: 'Meetings Booked', data: dailyPlan.targets.prospecting.meetingsBooked },
              ].map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{item.label}</span>
                    <span className="font-mono">
                      {item.data.completed} / {item.data.target}
                    </span>
                  </div>
                  <Progress 
                    value={Math.min((item.data.completed / item.data.target) * 100, 100)} 
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Daily Targets - Clients */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Client Targets
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Check-ins', data: dailyPlan.targets.clients.checkIns },
                { label: 'Upsell Conversations', data: dailyPlan.targets.clients.upsellConversations },
                { label: 'Renewal Actions', data: dailyPlan.targets.clients.renewalActions },
                { label: 'Follow-ups', data: dailyPlan.targets.clients.followUps },
              ].map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{item.label}</span>
                    <span className="font-mono">
                      {item.data.completed} / {item.data.target}
                    </span>
                  </div>
                  <Progress 
                    value={Math.min((item.data.completed / item.data.target) * 100, 100)} 
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Time Blocks */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Time Blocks
            </h2>
            <div className="space-y-3">
              {dailyPlan.timeBlocks.map(block => (
                <div 
                  key={block.id} 
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    block.isLocked ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'
                  }`}
                  data-testid={`timeblock-${block.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {block.isLocked && <Lock className="h-3 w-3 text-primary" />}
                      <p className="font-medium text-sm">{block.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {block.startTime} - {block.endTime}
                    </p>
                    {block.activityTarget > 0 && (
                      <div className="mt-2">
                        <Progress 
                          value={Math.min((block.activitiesCompleted / block.activityTarget) * 100, 100)} 
                          className="h-1.5"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {block.activitiesCompleted} / {block.activityTarget} activities
                        </p>
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {TIME_BLOCK_LABELS[block.type]}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Center Column - Action Queue */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Action Queue
            </h2>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 pr-4">
                {dailyPlan.actionQueue.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No actions in queue
                  </p>
                ) : (
                  dailyPlan.actionQueue.map(action => (
                    <div 
                      key={action.id} 
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        action.status === 'completed' ? 'bg-muted/30 opacity-60' :
                        action.status === 'skipped' ? 'bg-muted/30 opacity-40' : 'bg-muted/50'
                      }`}
                      data-testid={`action-${action.id}`}
                    >
                      <div className={`shrink-0 ${getUrgencyColor(action.urgency)}`}>
                        {getActionIcon(action.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${
                          action.status !== 'pending' ? 'line-through' : ''
                        }`}>
                          {action.title}
                        </p>
                        {action.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{action.subtitle}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        +{action.battleScorePoints}
                      </Badge>
                      {action.status === 'pending' && (
                        <div className="flex items-center gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => handleCompleteAction(action.id)}
                            data-testid={`button-complete-${action.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => handleSkipAction(action.id)}
                            data-testid={`button-skip-${action.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Right Column - Route Plan & Debrief */}
        <div className="space-y-6">
          {/* Route Plan */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Route Plan
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Door knocking route for today
            </p>
            <div className="space-y-2">
              {dailyPlan.routeStops.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No stops planned. Add leads with addresses to build a route.
                </p>
              ) : (
                dailyPlan.routeStops.map((stop, index) => (
                  <div 
                    key={stop.id} 
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      stop.completed ? 'bg-muted/30 opacity-60' : 'bg-muted/50'
                    }`}
                    data-testid={`route-stop-${stop.id}`}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${stop.completed ? 'line-through' : ''}`}>
                        {stop.companyName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{stop.address}</p>
                    </div>
                    {!stop.completed && (
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => handleCompleteRouteStop(stop.id)}
                        data-testid={`button-complete-stop-${stop.id}`}
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* End of Day Debrief */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <h2 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                End of Day Debrief
              </h2>
            </div>
            {dailyPlan.debrief.completed ? (
              <div className="space-y-3">
                <p className="text-sm">{dailyPlan.debrief.aiReview}</p>
                {dailyPlan.debrief.plannedVsCompleted && (
                  <Badge variant="outline">
                    {dailyPlan.debrief.plannedVsCompleted.percentage}% completed
                  </Badge>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Get AI-powered insights on your day's activities and plan for tomorrow.
                </p>
                <Button 
                  className="w-full gap-2" 
                  variant="outline" 
                  onClick={() => setIsDebriefOpen(true)}
                  data-testid="button-debrief"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Debrief
                </Button>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Debrief Dialog */}
      <Dialog open={isDebriefOpen} onOpenChange={setIsDebriefOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              End of Day Debrief
            </DialogTitle>
            <DialogDescription>
              Let's review your performance today and plan for tomorrow.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{dailyPlan.battleScoreEarned}</p>
                <p className="text-xs text-muted-foreground">Battle Score</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">
                  {dailyPlan.actionQueue.filter(a => a.status === 'completed').length}
                </p>
                <p className="text-xs text-muted-foreground">Actions Done</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">
                  {dailyPlan.targets.prospecting.calls.completed}
                </p>
                <p className="text-xs text-muted-foreground">Calls Made</p>
              </div>
            </div>

            <Separator />

            {debriefResult ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">AI Review</p>
                  <p className="text-sm">{debriefResult.aiReview}</p>
                </div>
                {debriefResult.improvements && debriefResult.improvements.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Improvements for Tomorrow</p>
                    <ul className="space-y-1">
                      {debriefResult.improvements.map((item, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {debriefResult.tomorrowsFocus && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Tomorrow's Focus</p>
                    <p className="text-sm font-medium">{debriefResult.tomorrowsFocus}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Button 
                  onClick={handleGenerateDebrief}
                  disabled={isGeneratingDebrief}
                  data-testid="button-generate-debrief"
                >
                  {isGeneratingDebrief ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Analyzing your day...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate AI Review
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDebriefOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitDebrief}
              disabled={!debriefResult}
              data-testid="button-submit-debrief"
            >
              Submit Debrief
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

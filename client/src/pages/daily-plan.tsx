import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Target, Clock, CheckCircle2, Sparkles, Play, Lock, MapPin, 
  Phone, Building2, MessageSquare, Calendar, Users, RefreshCw,
  ChevronRight, ChevronLeft, X, AlertTriangle, Zap, Trophy, Plus,
  Navigation, Trash2, GripVertical, Handshake, Brain, Loader2
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  fetchDailyPlan, upsertDailyPlan, fetchAIBrief, saveAIBrief,
  fetchPlanTasks, fetchActionRecommendations, fetchLeads, fetchClients,
  fetchAIDebrief, saveAIDebrief, fetchActivities, updatePlanTask
} from '@/lib/firestoreService';
import {
  DailyPlanDoc, AIBrief, AIDebrief, PlanTimeBlock, PlanActionRecommendation,
  formatDateDDMMYYYY, parseDateDDMMYYYY, getTodayDDMMYYYY,
  PLAN_BLOCK_CATEGORY_LABELS, DEFAULT_PLAN_TIME_BLOCKS, Lead, Client,
  Task, getTrafficLightStatus, Activity
} from '@/lib/types';

interface DateSelectorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

function DateSelector({ selectedDate, onDateChange }: DateSelectorProps) {
  const parsed = parseDateDDMMYYYY(selectedDate);
  
  const goToPreviousDay = () => {
    const prev = new Date(parsed);
    prev.setDate(prev.getDate() - 1);
    onDateChange(formatDateDDMMYYYY(prev));
  };
  
  const goToNextDay = () => {
    const next = new Date(parsed);
    next.setDate(next.getDate() + 1);
    onDateChange(formatDateDDMMYYYY(next));
  };
  
  const goToToday = () => {
    onDateChange(getTodayDDMMYYYY());
  };
  
  const isToday = selectedDate === getTodayDDMMYYYY();
  const dayName = parsed.toLocaleDateString('en-US', { weekday: 'long' });
  const formattedDate = parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  return (
    <div className="flex items-center gap-2" data-testid="date-selector">
      <Button
        variant="ghost"
        size="icon"
        onClick={goToPreviousDay}
        data-testid="button-prev-day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <div className="text-center min-w-[200px]">
        <div className="text-lg font-semibold" data-testid="text-day-name">{dayName}</div>
        <div className="text-sm text-muted-foreground" data-testid="text-date">{formattedDate}</div>
        <div className="text-xs text-muted-foreground font-mono" data-testid="text-date-ddmmyyyy">{selectedDate}</div>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={goToNextDay}
        data-testid="button-next-day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      
      {!isToday && (
        <Button
          variant="outline"
          size="sm"
          onClick={goToToday}
          className="ml-2"
          data-testid="button-go-today"
        >
          Today
        </Button>
      )}
    </div>
  );
}

interface AIBriefSectionProps {
  brief: AIBrief | null;
  isGenerating: boolean;
  onGenerate: () => void;
}

function AIBriefSection({ brief, isGenerating, onGenerate }: AIBriefSectionProps) {
  if (!brief && !isGenerating) {
    return (
      <Card className="p-4" data-testid="card-ai-brief-empty">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-medium">AI Daily Brief</span>
          </div>
          <Button onClick={onGenerate} size="sm" data-testid="button-generate-brief">
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Brief
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Get an AI-powered overview of your day with priorities and focus areas.
        </p>
      </Card>
    );
  }

  if (isGenerating) {
    return (
      <Card className="p-4" data-testid="card-ai-brief-loading">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Generating your daily brief...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4" data-testid="card-ai-brief">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <span className="font-medium">Today's Focus</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          AI Generated
        </Badge>
      </div>
      
      <p className="text-lg font-semibold mb-4" data-testid="text-todays-focus">
        {brief?.todaysFocus}
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <Target className="h-4 w-4" />
            Top 3 Priorities
          </h4>
          <ul className="space-y-1">
            {brief?.focusModeTop3?.map((priority, idx) => (
              <li key={idx} className="text-sm flex items-start gap-2" data-testid={`text-priority-${idx}`}>
                <span className="font-bold text-primary">{idx + 1}.</span>
                {priority}
              </li>
            ))}
          </ul>
        </div>
        
        {brief?.riskList && brief.riskList.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Risk Areas
            </h4>
            <ul className="space-y-1">
              {brief.riskList.slice(0, 3).map((risk, idx) => (
                <li key={idx} className="text-sm text-muted-foreground" data-testid={`text-risk-${idx}`}>
                  {risk.targetName}: {risk.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Time Allocation
          </h4>
          <ul className="space-y-1">
            {brief?.suggestedTimeAllocation?.slice(0, 3).map((block, idx) => (
              <li key={idx} className="text-sm text-muted-foreground" data-testid={`text-time-alloc-${idx}`}>
                {block.blockName}: {block.suggestedTasks} tasks
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

interface TimeBlockCardProps {
  block: PlanTimeBlock;
  tasks: Task[];
}

function TimeBlockCard({ block, tasks }: TimeBlockCardProps) {
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const progress = block.capacity > 0 ? Math.round((completedTasks / block.capacity) * 100) : 0;
  
  return (
    <Card className="p-3" data-testid={`card-time-block-${block.id}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {block.isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
          <span className="font-medium text-sm">{block.name}</span>
        </div>
        <Badge variant="outline">
          {block.startTime} - {block.endTime}
        </Badge>
      </div>
      
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span>{PLAN_BLOCK_CATEGORY_LABELS[block.category]}</span>
        <span>|</span>
        <span>{completedTasks}/{block.capacity} tasks</span>
      </div>
      
      <Progress value={progress} className="h-1.5" />
    </Card>
  );
}

interface TargetProgressProps {
  label: string;
  icon: React.ReactNode;
  target: number;
  completed: number;
}

function TargetProgress({ label, icon, target, completed }: TargetProgressProps) {
  const percentage = target > 0 ? Math.round((completed / target) * 100) : 0;
  const isComplete = completed >= target;
  
  return (
    <div className="flex items-center gap-3 p-2" data-testid={`target-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`p-2 rounded-md ${isComplete ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm font-bold">
            {completed}/{target}
          </span>
        </div>
        <Progress value={Math.min(percentage, 100)} className="h-1.5" />
      </div>
      {isComplete && <CheckCircle2 className="h-4 w-4 text-green-500" />}
    </div>
  );
}

export default function DailyPlanPage() {
  const { toast } = useToast();
  const { user, orgId, authReady } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.uid || '';
  
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDDMMYYYY());
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [isGeneratingDebrief, setIsGeneratingDebrief] = useState(false);
  const [isRollingForward, setIsRollingForward] = useState(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);
  
  const { data: dailyPlan, isLoading: planLoading } = useQuery({
    queryKey: ['/daily-plan', orgId, userId, selectedDate],
    queryFn: async () => {
      if (!orgId || !userId) return null;
      const plan = await fetchDailyPlan(orgId, userId, selectedDate, authReady);
      if (!plan) {
        return await upsertDailyPlan(orgId, userId, selectedDate, {}, authReady);
      }
      return plan;
    },
    enabled: !!orgId && !!userId && authReady,
  });
  
  const { data: aiBrief } = useQuery({
    queryKey: ['/ai-brief', orgId, userId, selectedDate],
    queryFn: async () => {
      if (!orgId || !userId) return null;
      return await fetchAIBrief(orgId, userId, selectedDate, authReady);
    },
    enabled: !!orgId && !!userId && authReady,
  });
  
  const { data: planTasks = [] } = useQuery({
    queryKey: ['/plan-tasks', orgId, userId, selectedDate],
    queryFn: async () => {
      if (!orgId || !userId) return [];
      return await fetchPlanTasks(orgId, userId, selectedDate, authReady);
    },
    enabled: !!orgId && !!userId && authReady,
  });
  
  const { data: leads = [] } = useQuery({
    queryKey: ['/api/leads', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return await fetchLeads(orgId, authReady);
    },
    enabled: !!orgId && authReady,
  });
  
  const { data: clients = [] } = useQuery({
    queryKey: ['/api/clients', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return await fetchClients(orgId, authReady);
    },
    enabled: !!orgId && authReady,
  });
  
  const { data: recommendations = [] } = useQuery({
    queryKey: ['/action-recommendations', orgId, userId, selectedDate],
    queryFn: async () => {
      if (!orgId || !userId) return [];
      return await fetchActionRecommendations(orgId, userId, selectedDate, authReady);
    },
    enabled: !!orgId && !!userId && authReady,
  });
  
  const { data: aiDebrief } = useQuery({
    queryKey: ['/ai-debrief', orgId, userId, selectedDate],
    queryFn: async () => {
      if (!orgId || !userId) return null;
      return await fetchAIDebrief(orgId, userId, selectedDate, authReady);
    },
    enabled: !!orgId && !!userId && authReady,
  });
  
  const { data: activities = [] } = useQuery({
    queryKey: ['/activities', orgId, selectedDate],
    queryFn: async () => {
      if (!orgId) return [];
      const allActivities = await fetchActivities(orgId, authReady);
      const dateStart = parseDateDDMMYYYY(selectedDate);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(dateStart);
      dateEnd.setHours(23, 59, 59, 999);
      return allActivities.filter(a => {
        const actDate = a.date instanceof Date ? a.date : new Date(a.date);
        return actDate >= dateStart && actDate <= dateEnd;
      });
    },
    enabled: !!orgId && authReady,
  });
  
  const timeBlocks = dailyPlan?.timeBlocks || DEFAULT_PLAN_TIME_BLOCKS;
  const targets = dailyPlan?.targets || {
    prospecting: {
      calls: { target: 25, completed: 0 },
      doors: { target: 5, completed: 0 },
      conversations: { target: 10, completed: 0 },
      meetingsBooked: { target: 2, completed: 0 },
    },
    clients: {
      checkIns: { target: 5, completed: 0 },
      upsellConversations: { target: 2, completed: 0 },
      renewalActions: { target: 3, completed: 0 },
      followUps: { target: 10, completed: 0 },
    },
  };
  
  const tasksByBlock = useMemo(() => {
    const byBlock: Record<string, Task[]> = {};
    timeBlocks.forEach(block => {
      byBlock[block.id] = planTasks.filter(t => t.planBlockId === block.id);
    });
    return byBlock;
  }, [planTasks, timeBlocks]);
  
  const battleScore = useMemo(() => {
    let score = 0;
    planTasks.forEach(task => {
      if (task.status === 'completed') {
        score += 10;
        if (task.outcome === 'meeting_booked') score += 25;
        if (task.outcome === 'conversation') score += 5;
      }
    });
    return score;
  }, [planTasks]);
  
  const handleGenerateBrief = async () => {
    if (!orgId || !userId) return;
    
    setIsGeneratingBrief(true);
    try {
      const response = await apiRequest('/api/daily-plan/generate-brief', {
        method: 'POST',
        body: JSON.stringify({
          planDate: selectedDate,
          targets,
          leads: leads.filter(l => !l.archived).slice(0, 15),
          clients: clients.filter(c => c.status === 'active').slice(0, 15),
          overdueTasks: planTasks.filter(t => t.status === 'pending'),
        }),
      });
      
      const brief: AIBrief = response as AIBrief;
      await saveAIBrief(orgId, userId, brief, authReady);
      
      queryClient.invalidateQueries({ queryKey: ['/ai-brief', orgId, userId, selectedDate] });
      toast({ title: 'Brief generated', description: 'Your AI daily brief is ready.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate brief.', variant: 'destructive' });
    } finally {
      setIsGeneratingBrief(false);
    }
  };
  
  const handleGenerateDebrief = async () => {
    if (!orgId || !userId) return;
    
    setIsGeneratingDebrief(true);
    try {
      const response = await apiRequest('/api/daily-plan/generate-debrief', {
        method: 'POST',
        body: JSON.stringify({
          planDate: selectedDate,
          tasks: planTasks,
          targets,
          activities: activities.slice(0, 30),
          brief: aiBrief,
        }),
      });
      
      const debrief: AIDebrief = {
        ...(response as AIDebrief),
        id: `${orgId}_${userId}_${selectedDate}`,
        planDate: selectedDate,
        generatedAt: new Date(),
        aiModelVersion: 'gpt-4o-mini',
      };
      await saveAIDebrief(orgId, userId, debrief, authReady);
      
      queryClient.invalidateQueries({ queryKey: ['/ai-debrief', orgId, userId, selectedDate] });
      toast({ title: 'Debrief generated', description: 'Your end-of-day review is ready.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate debrief.', variant: 'destructive' });
    } finally {
      setIsGeneratingDebrief(false);
    }
  };
  
  const handleRollForwardTasks = async () => {
    if (!orgId || !userId || !aiDebrief?.rollForwardTasks?.length) return;
    
    setIsRollingForward(true);
    try {
      const tomorrow = new Date(parseDateDDMMYYYY(selectedDate));
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = formatDateDDMMYYYY(tomorrow);
      
      const updatePromises = aiDebrief.rollForwardTasks.map(async (rollTask) => {
        const task = planTasks.find(t => t.id === rollTask.taskId);
        if (task) {
          await updatePlanTask(orgId, task.id, {
            planDate: tomorrowDate,
          }, authReady);
        }
      });
      
      await Promise.all(updatePromises);
      
      queryClient.invalidateQueries({ queryKey: ['/plan-tasks', orgId, userId, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['/plan-tasks', orgId, userId, tomorrowDate] });
      
      toast({ 
        title: 'Tasks rolled forward', 
        description: `${aiDebrief.rollForwardTasks.length} tasks moved to ${tomorrowDate}.` 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to roll forward tasks.', variant: 'destructive' });
    } finally {
      setIsRollingForward(false);
    }
  };
  
  const pendingTasks = planTasks.filter(t => t.status === 'pending');
  const completedTasks = planTasks.filter(t => t.status === 'completed');
  const completionPercentage = planTasks.length > 0 
    ? Math.round((completedTasks.length / planTasks.length) * 100) 
    : 0;
  
  const isToday = selectedDate === getTodayDDMMYYYY();
  
  if (!authReady || !orgId) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-muted-foreground">Please log in to view your daily plan.</p>
      </div>
    );
  }
  
  if (planLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto" data-testid="page-daily-plan">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Daily Plan</h1>
          <p className="text-muted-foreground">AI-managed schedule and targets</p>
        </div>
        
        <DateSelector
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
        
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-battle-score">
            <Trophy className="h-3 w-3" />
            {battleScore} pts
          </Badge>
          
          {isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDebriefOpen(true)}
              data-testid="button-open-debrief"
            >
              <Clock className="h-4 w-4 mr-2" />
              End of Day
            </Button>
          )}
        </div>
      </div>
      
      <AIBriefSection
        brief={aiBrief || null}
        isGenerating={isGeneratingBrief}
        onGenerate={handleGenerateBrief}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4" data-testid="card-schedule">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Schedule Timeline
              </h2>
              <Badge variant="outline">
                {selectedDate}
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {timeBlocks.map(block => (
                <TimeBlockCard
                  key={block.id}
                  block={block}
                  tasks={tasksByBlock[block.id] || []}
                />
              ))}
            </div>
          </Card>
          
          <Card className="p-4" data-testid="card-action-queue">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Action Queue
              </h2>
              <Button size="sm" variant="outline" data-testid="button-generate-actions">
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Actions
              </Button>
            </div>
            
            {recommendations.length === 0 && planTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Zap className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No actions yet. Generate your AI brief to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recommendations.slice(0, 10).map((rec, idx) => (
                  <div
                    key={rec.id}
                    className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                    data-testid={`action-rec-${idx}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{rec.targetName}</div>
                      <div className="text-xs text-muted-foreground">{rec.reason}</div>
                    </div>
                    <Badge variant="outline">{rec.taskType}</Badge>
                    <Badge variant="secondary">{rec.priorityScore}</Badge>
                    <Button size="icon" variant="ghost" data-testid={`button-accept-rec-${idx}`}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        
        <div className="space-y-4">
          <Card className="p-4" data-testid="card-prospecting-targets">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="h-5 w-5" />
              Prospecting Targets
            </h2>
            
            <div className="space-y-1">
              <TargetProgress
                label="Calls"
                icon={<Phone className="h-4 w-4" />}
                target={targets.prospecting.calls.target}
                completed={targets.prospecting.calls.completed}
              />
              <TargetProgress
                label="Door Knocks"
                icon={<Building2 className="h-4 w-4" />}
                target={targets.prospecting.doors.target}
                completed={targets.prospecting.doors.completed}
              />
              <TargetProgress
                label="Conversations"
                icon={<MessageSquare className="h-4 w-4" />}
                target={targets.prospecting.conversations.target}
                completed={targets.prospecting.conversations.completed}
              />
              <TargetProgress
                label="Meetings Booked"
                icon={<Calendar className="h-4 w-4" />}
                target={targets.prospecting.meetingsBooked.target}
                completed={targets.prospecting.meetingsBooked.completed}
              />
            </div>
          </Card>
          
          <Card className="p-4" data-testid="card-client-targets">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Client Targets
            </h2>
            
            <div className="space-y-1">
              <TargetProgress
                label="Check-ins"
                icon={<CheckCircle2 className="h-4 w-4" />}
                target={targets.clients.checkIns.target}
                completed={targets.clients.checkIns.completed}
              />
              <TargetProgress
                label="Upsell Convos"
                icon={<Handshake className="h-4 w-4" />}
                target={targets.clients.upsellConversations.target}
                completed={targets.clients.upsellConversations.completed}
              />
              <TargetProgress
                label="Renewal Actions"
                icon={<RefreshCw className="h-4 w-4" />}
                target={targets.clients.renewalActions.target}
                completed={targets.clients.renewalActions.completed}
              />
              <TargetProgress
                label="Follow-ups"
                icon={<ChevronRight className="h-4 w-4" />}
                target={targets.clients.followUps.target}
                completed={targets.clients.followUps.completed}
              />
            </div>
          </Card>
          
          <Card className="p-4" data-testid="card-route-plan">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Route Plan
              </h2>
              <Button size="icon" variant="ghost" data-testid="button-add-route-stop">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {(dailyPlan?.routeStops?.length || 0) === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Navigation className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No route stops planned</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dailyPlan?.routeStops?.map((stop, idx) => (
                  <div
                    key={stop.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                    data-testid={`route-stop-${idx}`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{idx + 1}.</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{stop.companyName}</div>
                      <div className="text-xs text-muted-foreground">{stop.address}</div>
                    </div>
                    {stop.completed && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      
      <Dialog open={isDebriefOpen} onOpenChange={setIsDebriefOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              End of Day Debrief
            </DialogTitle>
            <DialogDescription>
              Review your day and get AI-powered insights for tomorrow.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-md">
                <div className="text-center flex-1">
                  <Trophy className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <div className="text-2xl font-bold" data-testid="text-debrief-score">{battleScore}</div>
                  <p className="text-xs text-muted-foreground">Battle Score</p>
                </div>
                <Separator orientation="vertical" className="h-16" />
                <div className="text-center flex-1">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <div className="text-2xl font-bold" data-testid="text-debrief-completed">{completedTasks.length}</div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <Separator orientation="vertical" className="h-16" />
                <div className="text-center flex-1">
                  <Target className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <div className="text-2xl font-bold" data-testid="text-debrief-total">{planTasks.length}</div>
                  <p className="text-xs text-muted-foreground">Planned</p>
                </div>
                <Separator orientation="vertical" className="h-16" />
                <div className="text-center flex-1">
                  <div className="h-8 flex items-center justify-center mb-2">
                    <span className={`text-xl font-bold ${completionPercentage >= 80 ? 'text-green-500' : completionPercentage >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {completionPercentage}%
                    </span>
                  </div>
                  <Progress value={completionPercentage} className="h-2 mb-1" />
                  <p className="text-xs text-muted-foreground">Completion</p>
                </div>
              </div>
              
              {isGeneratingDebrief && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
                  <span>Generating your AI debrief...</span>
                </div>
              )}
              
              {aiDebrief && !isGeneratingDebrief && (
                <>
                  <div className="p-4 bg-primary/5 rounded-md border border-primary/20">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Brain className="h-4 w-4 text-primary" />
                      AI Coach Review
                    </h4>
                    <p className="text-sm" data-testid="text-ai-review">{aiDebrief.aiReview}</p>
                  </div>
                  
                  {aiDebrief.whatSlipped && aiDebrief.whatSlipped.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-4 w-4" />
                        What Slipped ({aiDebrief.whatSlipped.length})
                      </h4>
                      <div className="space-y-2">
                        {aiDebrief.whatSlipped.slice(0, 5).map((item, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                            data-testid={`item-slipped-${idx}`}
                          >
                            <span className="text-sm">{item.title}</span>
                            <Badge variant="outline">{item.reason}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {aiDebrief.tomorrowPriorities && aiDebrief.tomorrowPriorities.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Tomorrow's Priorities
                      </h4>
                      <ul className="space-y-1">
                        {aiDebrief.tomorrowPriorities.slice(0, 5).map((priority, idx) => (
                          <li 
                            key={idx} 
                            className="text-sm flex items-start gap-2"
                            data-testid={`text-tomorrow-priority-${idx}`}
                          >
                            <span className="font-bold text-primary">{idx + 1}.</span>
                            {priority}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {aiDebrief.improvements && aiDebrief.improvements.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Improvement Suggestions
                      </h4>
                      <ul className="space-y-1">
                        {aiDebrief.improvements.slice(0, 3).map((improvement, idx) => (
                          <li 
                            key={idx} 
                            className="text-sm text-muted-foreground"
                            data-testid={`text-improvement-${idx}`}
                          >
                            {improvement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {aiDebrief.rollForwardTasks && aiDebrief.rollForwardTasks.length > 0 && (
                    <div className="p-4 bg-muted/50 rounded-md">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" />
                          Roll Forward to Tomorrow ({aiDebrief.rollForwardTasks.length})
                        </h4>
                        <Button
                          size="sm"
                          onClick={handleRollForwardTasks}
                          disabled={isRollingForward}
                          data-testid="button-roll-forward"
                        >
                          {isRollingForward ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <ChevronRight className="h-4 w-4 mr-2" />
                          )}
                          Roll Forward
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {aiDebrief.rollForwardTasks.slice(0, 5).map((task, idx) => (
                          <div 
                            key={idx} 
                            className="text-sm text-muted-foreground"
                            data-testid={`text-roll-task-${idx}`}
                          >
                            {task.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {!aiDebrief && !isGeneratingDebrief && pendingTasks.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                  <h4 className="font-medium mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    Incomplete Tasks ({pendingTasks.length})
                  </h4>
                  <div className="space-y-1">
                    {pendingTasks.slice(0, 5).map((task, idx) => (
                      <div 
                        key={task.id} 
                        className="text-sm text-amber-700 dark:text-amber-400"
                        data-testid={`text-pending-task-${idx}`}
                      >
                        {task.title || task.description}
                      </div>
                    ))}
                    {pendingTasks.length > 5 && (
                      <p className="text-sm text-muted-foreground">
                        +{pendingTasks.length - 5} more...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsDebriefOpen(false)}>
              Close
            </Button>
            <Button 
              onClick={handleGenerateDebrief}
              disabled={isGeneratingDebrief}
              data-testid="button-generate-debrief"
            >
              {isGeneratingDebrief ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {aiDebrief ? 'Regenerate Debrief' : 'Generate AI Debrief'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

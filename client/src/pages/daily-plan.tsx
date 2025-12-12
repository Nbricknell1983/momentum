import { useSelector } from 'react-redux';
import { Target, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import TrafficLight from '@/components/TrafficLight';
import { RootState } from '@/store';
import { getTrafficLightStatus, STAGE_LABELS } from '@/lib/types';
import { isToday } from 'date-fns';

export default function DailyPlanPage() {
  const user = useSelector((state: RootState) => state.app.user);
  const leads = useSelector((state: RootState) => state.app.leads);
  const dailyMetrics = useSelector((state: RootState) => state.app.dailyMetrics);
  const tasks = useSelector((state: RootState) => state.app.tasks);

  const targets = user?.targets || { calls: 25, doors: 5, meetings: 3, followups: 15, proposals: 2, deals: 1 };
  
  const todayMetrics = dailyMetrics.find(m => isToday(new Date(m.date))) || {
    calls: 0, doors: 0, meetings: 0, followups: 0, proposals: 0, deals: 0, momentumScore: 0
  };

  // Get priority leads (due today + overdue, sorted by value)
  const priorityLeads = leads
    .filter(lead => {
      if (lead.archived || !lead.nextContactDate) return false;
      const status = getTrafficLightStatus(lead);
      return status === 'red' || status === 'amber';
    })
    .sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
    .slice(0, 8);

  // Get today's tasks
  const todayTasks = tasks.filter(t => t.status === 'pending' && isToday(new Date(t.dueAt)));

  // Time blocks
  const timeBlocks = [
    { name: 'Prospecting', time: '9:00 - 11:00', description: 'Cold outreach and new leads' },
    { name: 'Follow-ups', time: '11:00 - 12:00', description: 'Existing pipeline nurture' },
    { name: 'Meetings', time: '1:00 - 3:00', description: 'Discovery and demos' },
    { name: 'Admin', time: '3:00 - 4:00', description: 'CRM updates and prep' },
  ];

  const progressItems = [
    { label: 'Calls', current: todayMetrics.calls, target: targets.calls },
    { label: 'Drop-ins', current: todayMetrics.doors, target: targets.doors },
    { label: 'Meetings', current: todayMetrics.meetings, target: targets.meetings },
    { label: 'Follow-ups', current: todayMetrics.followups, target: targets.followups },
    { label: 'Proposals', current: todayMetrics.proposals, target: targets.proposals },
  ];

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
        <Badge variant="outline" className="gap-2 text-base py-1 px-3">
          <Target className="h-4 w-4" />
          <span className="font-mono font-bold">{todayMetrics.momentumScore}</span>
          <span className="text-muted-foreground">Today's Score</span>
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Progress */}
        <div className="space-y-6">
          {/* Targets Progress */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Daily Targets
            </h2>
            <div className="space-y-4">
              {progressItems.map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-mono">
                      {item.current} / {item.target}
                    </span>
                  </div>
                  <Progress 
                    value={Math.min((item.current / item.target) * 100, 100)} 
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
              {timeBlocks.map(block => (
                <div key={block.name} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{block.name}</p>
                    <p className="text-xs text-muted-foreground">{block.time}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {block.description}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Center Column - Focus List */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold mb-4">Today's Focus</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Priority leads requiring attention
            </p>
            <div className="space-y-2">
              {priorityLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No priority leads for today
                </p>
              ) : (
                priorityLeads.map(lead => (
                  <div 
                    key={lead.id} 
                    className="flex items-center gap-3 p-3 rounded-lg hover-elevate"
                    data-testid={`focus-lead-${lead.id}`}
                  >
                    <TrafficLight status={getTrafficLightStatus(lead)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{lead.companyName}</p>
                      <p className="text-xs text-muted-foreground">{STAGE_LABELS[lead.stage]}</p>
                    </div>
                    {lead.mrr && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        ${lead.mrr}
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Today's Tasks */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Today's Tasks
            </h2>
            <div className="space-y-2">
              {todayTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No tasks scheduled for today
                </p>
              ) : (
                todayTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-2">
                    <Checkbox id={task.id} />
                    <label htmlFor={task.id} className="text-sm flex-1 cursor-pointer">
                      {task.title}
                    </label>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right Column - Checklist & Debrief */}
        <div className="space-y-6">
          {/* Daily Checklist */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4">Daily Checklist</h2>
            <div className="space-y-3">
              {[
                'Complete morning prospecting block',
                'Follow up on all overdue leads',
                'Send at least one proposal',
                'Update CRM notes',
                'Prepare for tomorrow',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Checkbox id={`checklist-${i}`} />
                  <label htmlFor={`checklist-${i}`} className="text-sm cursor-pointer">
                    {item}
                  </label>
                </div>
              ))}
            </div>
          </Card>

          {/* End of Day Debrief */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                End of Day Debrief
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Get AI-powered insights on your day's activities and plan for tomorrow.
            </p>
            <Button className="w-full gap-2" variant="outline" data-testid="button-debrief">
              <Sparkles className="h-4 w-4" />
              Generate Debrief
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RootState, completeTask, snoozeTask, addTask, selectLead } from '@/store';
import TaskItem from '@/components/TaskItem';
import LeadDrawer from '@/components/LeadDrawer';
import { Task } from '@/lib/types';
import { isToday, isPast, isFuture, addDays, isThisWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export default function TasksPage() {
  const dispatch = useDispatch();
  const tasks = useSelector((state: RootState) => state.app.tasks);
  const leads = useSelector((state: RootState) => state.app.leads);
  const user = useSelector((state: RootState) => state.app.user);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskLeadId, setNewTaskLeadId] = useState<string>('');

  const getLeadName = (leadId?: string) => {
    if (!leadId) return undefined;
    return leads.find(l => l.id === leadId)?.companyName;
  };

  const handleComplete = (taskId: string) => {
    dispatch(completeTask(taskId));
  };

  const handleSnooze = (taskId: string) => {
    dispatch(snoozeTask({ taskId, dueAt: addDays(new Date(), 1) }));
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    
    const newTask: Task = {
      id: uuidv4(),
      userId: user?.id || 'demo',
      leadId: newTaskLeadId || undefined,
      title: newTaskTitle,
      dueAt: new Date(),
      status: 'pending',
      createdAt: new Date(),
    };
    
    dispatch(addTask(newTask));
    setNewTaskTitle('');
    setNewTaskLeadId('');
    setIsAddDialogOpen(false);
  };

  const handleTaskClick = (task: Task) => {
    if (task.leadId) {
      dispatch(selectLead(task.leadId));
    }
  };

  // Filter tasks by status
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  
  const overdueTasks = pendingTasks.filter(t => isPast(new Date(t.dueAt)) && !isToday(new Date(t.dueAt)));
  const todayTasks = pendingTasks.filter(t => isToday(new Date(t.dueAt)));
  const thisWeekTasks = pendingTasks.filter(t => isThisWeek(new Date(t.dueAt)) && !isToday(new Date(t.dueAt)) && !isPast(new Date(t.dueAt)));
  const upcomingTasks = pendingTasks.filter(t => isFuture(new Date(t.dueAt)) && !isThisWeek(new Date(t.dueAt)));

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-tasks-title">Tasks</h1>
          <p className="text-muted-foreground">{pendingTasks.length} pending tasks</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-task">
              <Plus className="h-4 w-4" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">Task</Label>
                <Input
                  id="task-title"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  data-testid="input-new-task"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-lead">Link to Lead (Optional)</Label>
                <Select
                  value={newTaskLeadId || 'none'}
                  onValueChange={(v) => setNewTaskLeadId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger data-testid="select-task-lead">
                    <SelectValue placeholder="Select a lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lead</SelectItem>
                    {leads.filter(l => !l.archived).map(lead => (
                      <SelectItem key={lead.id} value={lead.id}>{lead.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddTask} className="w-full" data-testid="button-confirm-add-task">
                Add Task
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Task Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">
            All
            <Badge variant="secondary" className="ml-2">{pendingTasks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue" data-testid="tab-overdue">
            Overdue
            <Badge variant="destructive" className="ml-2">{overdueTasks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="today" data-testid="tab-today">
            Today
            <Badge variant="default" className="ml-2">{todayTasks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="week" data-testid="tab-week">
            This Week
            <Badge variant="secondary" className="ml-2">{thisWeekTasks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="divide-y">
            {pendingTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No pending tasks</p>
            ) : (
              pendingTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  leadName={getLeadName(task.leadId)}
                  onComplete={() => handleComplete(task.id)}
                  onSnooze={() => handleSnooze(task.id)}
                  onClick={() => handleTaskClick(task)}
                />
              ))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="overdue">
          <Card className="divide-y">
            {overdueTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No overdue tasks</p>
            ) : (
              overdueTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  leadName={getLeadName(task.leadId)}
                  onComplete={() => handleComplete(task.id)}
                  onSnooze={() => handleSnooze(task.id)}
                  onClick={() => handleTaskClick(task)}
                />
              ))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="today">
          <Card className="divide-y">
            {todayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No tasks due today</p>
            ) : (
              todayTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  leadName={getLeadName(task.leadId)}
                  onComplete={() => handleComplete(task.id)}
                  onSnooze={() => handleSnooze(task.id)}
                  onClick={() => handleTaskClick(task)}
                />
              ))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="week">
          <Card className="divide-y">
            {thisWeekTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No tasks due this week</p>
            ) : (
              thisWeekTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  leadName={getLeadName(task.leadId)}
                  onComplete={() => handleComplete(task.id)}
                  onSnooze={() => handleSnooze(task.id)}
                  onClick={() => handleTaskClick(task)}
                />
              ))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card className="divide-y">
            {completedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No completed tasks</p>
            ) : (
              completedTasks.slice(0, 10).map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  leadName={getLeadName(task.leadId)}
                  onComplete={() => handleComplete(task.id)}
                  onSnooze={() => handleSnooze(task.id)}
                  onClick={() => handleTaskClick(task)}
                />
              ))
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <LeadDrawer />
    </div>
  );
}

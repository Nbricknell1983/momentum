import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Play, Pause, CheckCircle, Clock, Target, Zap } from 'lucide-react';
import { 
  DailyTimeBlock, 
  DailyTimeBlockStatus, 
  TaskTimeSlot, 
  DAILY_TIME_BLOCK_LABELS, 
  DAILY_TIME_BLOCK_RANGES,
  Task,
  calculateBlockFocusScore,
  getCurrentTimeSlot
} from '@/lib/types';

interface TimeBlockCardProps {
  block: DailyTimeBlock;
  tasks: Task[];
  onStart: () => void;
  onPause: () => void;
  onEnd: () => void;
  isCurrentSlot: boolean;
}

export default function TimeBlockCard({ 
  block, 
  tasks, 
  onStart, 
  onPause, 
  onEnd,
  isCurrentSlot 
}: TimeBlockCardProps) {
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  const focusScore = block.focusScore ?? calculateBlockFocusScore(
    completedTasks,
    totalTasks,
    block.totalActiveMinutes
  );
  
  const getStatusBadge = () => {
    switch (block.status) {
      case 'active':
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case 'paused':
        return <Badge variant="secondary">Paused</Badge>;
      case 'completed':
        return <Badge variant="outline">Completed</Badge>;
      default:
        return isCurrentSlot ? <Badge variant="outline">Ready</Badge> : null;
    }
  };
  
  const getStatusColor = () => {
    switch (block.status) {
      case 'active':
        return 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20';
      case 'paused':
        return 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20';
      case 'completed':
        return 'border-muted bg-muted/30';
      default:
        return isCurrentSlot ? 'border-primary/30' : '';
    }
  };

  return (
    <Card 
      className={`p-4 transition-colors ${getStatusColor()}`}
      data-testid={`card-timeblock-${block.slot}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm">{DAILY_TIME_BLOCK_LABELS[block.slot]}</h3>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-muted-foreground">{DAILY_TIME_BLOCK_RANGES[block.slot]}</p>
        </div>
        
        <div className="flex items-center gap-1">
          {block.status === 'not_started' && (
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={onStart}
              disabled={!isCurrentSlot}
              data-testid={`button-start-block-${block.slot}`}
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          
          {block.status === 'active' && (
            <>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onPause}
                data-testid={`button-pause-block-${block.slot}`}
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onEnd}
                data-testid={`button-end-block-${block.slot}`}
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            </>
          )}
          
          {block.status === 'paused' && (
            <>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onStart}
                data-testid={`button-resume-block-${block.slot}`}
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onEnd}
                data-testid={`button-end-block-${block.slot}`}
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Target className="h-3 w-3" />
            {totalTasks === 0
              ? <span>No tasks scheduled</span>
              : <span>{completedTasks}/{totalTasks} tasks</span>
            }
          </div>
          {totalTasks > 0 && <span className="font-medium">{completionPercent}%</span>}
        </div>
        <Progress value={completionPercent} className="h-1.5" />
        
        {block.status !== 'not_started' && (
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{block.totalActiveMinutes} min active</span>
            </div>
            {block.status === 'completed' && (
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-500" />
                <span className="font-medium">Focus: {focusScore}</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {totalTasks > 0 && block.status !== 'completed' && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-2">Next up:</p>
          <div className="space-y-1">
            {tasks
              .filter(t => t.status === 'pending')
              .slice(0, 2)
              .map(task => (
                <div 
                  key={task.id} 
                  className="text-xs p-2 rounded-md bg-muted/50 truncate"
                >
                  {task.title}
                </div>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}

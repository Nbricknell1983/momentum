import { Check, Clock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Task } from '@/lib/types';
import { format, isToday, isPast, isTomorrow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TaskItemProps {
  task: Task;
  leadName?: string;
  onComplete: () => void;
  onSnooze: () => void;
  onClick?: () => void;
}

export default function TaskItem({ task, leadName, onComplete, onSnooze, onClick }: TaskItemProps) {
  const isOverdue = isPast(new Date(task.dueAt)) && !isToday(new Date(task.dueAt));
  const isDueToday = isToday(new Date(task.dueAt));
  const isDueTomorrow = isTomorrow(new Date(task.dueAt));

  const getDueBadgeVariant = () => {
    if (isOverdue) return 'destructive';
    if (isDueToday) return 'default';
    return 'secondary';
  };

  const getDueLabel = () => {
    if (isOverdue) return 'Overdue';
    if (isDueToday) return 'Today';
    if (isDueTomorrow) return 'Tomorrow';
    return format(new Date(task.dueAt), 'MMM d');
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg hover-elevate',
        task.status === 'completed' && 'opacity-50'
      )}
      data-testid={`task-item-${task.id}`}
    >
      <Checkbox
        checked={task.status === 'completed'}
        onCheckedChange={() => onComplete()}
        data-testid={`checkbox-task-${task.id}`}
      />
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        <p className={cn(
          'text-sm font-medium truncate',
          task.status === 'completed' && 'line-through'
        )}>
          {task.title}
        </p>
        {leadName && (
          <p className="text-xs text-muted-foreground truncate">{leadName}</p>
        )}
      </div>
      <Badge variant={getDueBadgeVariant()} className="text-xs shrink-0">
        {getDueLabel()}
      </Badge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" data-testid={`button-task-menu-${task.id}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onComplete}>
            <Check className="h-4 w-4 mr-2" />
            Mark Complete
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSnooze}>
            <Clock className="h-4 w-4 mr-2" />
            Snooze 1 Day
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

import { cn } from '@/lib/utils';
import { TrafficLightStatus } from '@/lib/types';

interface TrafficLightProps {
  status: TrafficLightStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function TrafficLight({ status, size = 'sm', className }: TrafficLightProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const statusClasses = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <span
      className={cn(
        'inline-block rounded-full shrink-0',
        sizeClasses[size],
        statusClasses[status],
        className
      )}
      title={`Status: ${status}`}
      data-testid={`status-light-${status}`}
    />
  );
}

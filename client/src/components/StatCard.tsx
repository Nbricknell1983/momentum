import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number | string;
  target?: number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
}

export default function StatCard({ title, value, target, change, changeLabel, icon }: StatCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <Card className="p-6" data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-2">{title}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-bold font-mono" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {target !== undefined && (
              <span className="text-sm text-muted-foreground">
                / {target}
              </span>
            )}
          </div>
          {change !== undefined && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs',
              isPositive && 'text-emerald-600 dark:text-emerald-400',
              isNegative && 'text-red-600 dark:text-red-400',
              !isPositive && !isNegative && 'text-muted-foreground'
            )}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : null}
              <span>{isPositive ? '+' : ''}{change}%</span>
              {changeLabel && <span className="text-muted-foreground">{changeLabel}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

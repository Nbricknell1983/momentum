import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Activity, RefreshCw, BarChart3 } from 'lucide-react';
import type { MomentumResult } from '@/lib/momentumEngine';

interface MomentumScoreCardProps {
  momentum: MomentumResult;
  showBreakdown?: boolean;
}

export default function MomentumScoreCard({ momentum, showBreakdown = true }: MomentumScoreCardProps) {
  const { score, status, statusLabel, statusColor, breakdown, constraint, trend } = momentum;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground';

  const getStatusBadgeVariant = () => {
    switch (status) {
      case 'healthy': return 'default';
      case 'stable': return 'secondary';
      case 'at_risk': return 'outline';
      case 'critical': return 'destructive';
    }
  };

  const getConstraintMessage = () => {
    switch (constraint) {
      case 'replacement':
        return "You're removing deals faster than you're replacing them.";
      case 'activity':
        return 'Momentum is falling due to insufficient daily inputs.';
      case 'pipeline':
        return 'Your pipeline is active but not moving forward.';
      default:
        return null;
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: statusColor }}
            data-testid="momentum-score-circle"
          >
            {score}
          </div>
          <div>
            <h2 className="font-semibold text-lg">Momentum Score</h2>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusBadgeVariant()} data-testid="momentum-status-badge">
                {statusLabel}
              </Badge>
              <TrendIcon className={`h-4 w-4 ${trendColor}`} />
            </div>
          </div>
        </div>
      </div>

      {constraint && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 mb-4" data-testid="momentum-constraint-alert">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm">{getConstraintMessage()}</p>
        </div>
      )}

      {showBreakdown && (
        <div className="space-y-4">
          <div className="space-y-2" data-testid="replacement-score-section">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Replacement (40%)</span>
              </div>
              <span className="text-sm font-mono">{breakdown.replacementScore}/100</span>
            </div>
            <Progress value={breakdown.replacementScore} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Rate: {breakdown.replacementRate}% (New: {breakdown.newDealsCreated}, Removed: {breakdown.dealsRemoved})
            </p>
          </div>

          <div className="space-y-2" data-testid="activity-score-section">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Activity (35%)</span>
              </div>
              <span className="text-sm font-mono">{breakdown.activityScore}/100</span>
            </div>
            <Progress value={breakdown.activityScore} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Index: {breakdown.activityIndex} / {breakdown.targetActivityIndex} target
            </p>
          </div>

          <div className="space-y-2" data-testid="pipeline-health-section">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Pipeline Health (25%)</span>
              </div>
              <span className="text-sm font-mono">{breakdown.pipelineHealthScore}/100</span>
            </div>
            <Progress value={breakdown.pipelineHealthScore} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Early: {breakdown.earlyStagePercent}% | Late: {breakdown.lateStagePercent}%
            </p>
            {breakdown.adjustments.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {breakdown.adjustments.map((adj, i) => (
                  <li key={i}>{adj}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

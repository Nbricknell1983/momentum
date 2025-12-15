import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, Sparkles, RefreshCw } from 'lucide-react';
import { RootState } from '@/store';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { MomentumResult, CoachingContext } from '@/lib/momentumEngine';
import { buildCoachingPrompt } from '@/lib/momentumEngine';
import type { Stage } from '@/lib/types';

interface MomentumCoachProps {
  momentum: MomentumResult;
}

export default function MomentumCoach({ momentum }: MomentumCoachProps) {
  const [coachingAdvice, setCoachingAdvice] = useState<string | null>(null);
  
  const user = useSelector((state: RootState) => state.app.user);
  const leads = useSelector((state: RootState) => state.app.leads);
  const activities = useSelector((state: RootState) => state.app.activities);
  const dailyPlan = useSelector((state: RootState) => state.app.dailyPlan);

  const coachingContext = useMemo((): CoachingContext => {
    const now = new Date();
    const targets = user?.targets || { calls: 25, doors: 5, meetings: 3, followups: 15, proposals: 2, deals: 1 };
    
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayActivities = activities.filter(a => new Date(a.createdAt) >= todayStart);
    const todayCalls = todayActivities.filter(a => a.type === 'call').length;
    const todaySms = todayActivities.filter(a => a.type === 'sms').length;
    
    const callsRemaining = Math.max(0, targets.calls - todayCalls);
    const smsRemaining = Math.max(0, targets.followups - todaySms);
    
    const activeLeads = leads.filter(l => !l.archived && l.stage !== 'lost' && l.stage !== 'won' && l.stage !== 'nurture');
    const stuckLeads = activeLeads
      .map(l => {
        const lastActivity = l.lastActivityAt ? new Date(l.lastActivityAt) : new Date(l.createdAt);
        const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        return { companyName: l.companyName, stage: l.stage as Stage, daysSinceActivity };
      })
      .filter(l => l.daysSinceActivity > 14)
      .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
    
    const dormantLeads = leads.filter(l => l.nurtureStatus === 'dormant' || l.stage === 'nurture');
    
    return {
      momentumResult: momentum,
      callsRemaining,
      smsRemaining,
      stuckLeads,
      dormantLeadsCount: dormantLeads.length,
    };
  }, [momentum, user, leads, activities]);

  const coachMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest('POST', '/api/momentum/coach', { prompt });
      return response.json();
    },
    onSuccess: (data) => {
      setCoachingAdvice(data.advice);
    },
  });

  const handleGetCoaching = () => {
    const prompt = buildCoachingPrompt(coachingContext);
    coachMutation.mutate(prompt);
  };

  const getCoachTone = () => {
    switch (momentum.status) {
      case 'critical': return 'urgent';
      case 'at_risk': return 'concerned';
      case 'stable': return 'encouraging';
      case 'healthy': return 'supportive';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Momentum Coach</h2>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" />
          Jeb Blount Style
        </Badge>
      </div>

      {!coachingAdvice && !coachMutation.isPending && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-4">
            Get personalized coaching advice based on your current Momentum score and pipeline health.
          </p>
          <Button onClick={handleGetCoaching} data-testid="button-get-coaching">
            <Sparkles className="h-4 w-4 mr-2" />
            Get Coaching Advice
          </Button>
        </div>
      )}

      {coachMutation.isPending && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Analyzing your pipeline...</span>
        </div>
      )}

      {coachingAdvice && (
        <div className="space-y-4">
          <div 
            className="prose prose-sm dark:prose-invert max-w-none"
            data-testid="coaching-advice-content"
          >
            {coachingAdvice.split('\n').map((line, i) => {
              if (line.startsWith('- ') || line.startsWith('• ')) {
                return <li key={i} className="ml-4">{line.slice(2)}</li>;
              }
              if (line.match(/^\d+\./)) {
                return <li key={i} className="ml-4 font-medium">{line}</li>;
              }
              if (line.trim() === '') {
                return <br key={i} />;
              }
              return <p key={i} className="mb-2">{line}</p>;
            })}
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t gap-4">
            <p className="text-xs text-muted-foreground">
              Coach tone: {getCoachTone()}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGetCoaching}
              disabled={coachMutation.isPending}
              data-testid="button-refresh-coaching"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      )}

      {coachMutation.isError && (
        <div className="text-center py-4">
          <p className="text-sm text-red-500 mb-2">Failed to get coaching advice</p>
          <Button variant="outline" size="sm" onClick={handleGetCoaching}>
            Try Again
          </Button>
        </div>
      )}
    </Card>
  );
}

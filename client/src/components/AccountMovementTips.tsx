import { useState } from 'react';
import { Sparkles, Target, AlertTriangle, ChevronRight, Loader2, RefreshCw, ArrowRight, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Client, ClientMovementTip, MovementAction, ClientBoardStage, CLIENT_BOARD_STAGE_LABELS, calculateClientHealth, HealthContributor } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { fetchClientActivities, fetchClientTasks } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';

interface AccountMovementTipsProps {
  client: Client;
  onActionTaken?: (action: MovementAction) => void;
  triggerVariant?: 'icon' | 'button';
}

const frameworkColors: Record<string, string> = {
  'NEPQ': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Jeb Blount': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'Chris Voss': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const confidenceColors: Record<string, string> = {
  'high': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'medium': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'low': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const stageColors: Record<ClientBoardStage, string> = {
  onboarding: 'bg-blue-500',
  steady_state: 'bg-green-500',
  growth_plays: 'bg-purple-500',
  watchlist: 'bg-amber-500',
  churned: 'bg-gray-400',
};

export function AccountMovementTips({ client, onActionTaken, triggerVariant = 'icon' }: AccountMovementTipsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tip, setTip] = useState<ClientMovementTip | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();

  const generateTip = async () => {
    if (!orgId || !authReady) return;
    
    setIsLoading(true);
    try {
      const [activities, tasks] = await Promise.all([
        fetchClientActivities(orgId, client.id, authReady),
        fetchClientTasks(orgId, client.id, authReady),
      ]);

      const healthResult = calculateClientHealth(client);
      const healthContributors = healthResult.healthContributors;

      const response = await fetch(`/api/clients/${client.id}/movement-tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client,
          activities,
          tasks,
          healthContributors,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate tip');
      }

      const data = await response.json();
      setTip(data);
    } catch (error) {
      console.error('Error generating movement tip:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate recommendations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpen = (open: boolean) => {
    setIsOpen(open);
    if (open && !tip) {
      generateTip();
    }
  };

  const handleRefresh = () => {
    setTip(null);
    generateTip();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {triggerVariant === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            data-testid={`button-movement-tips-${client.id}`}
          >
            <Lightbulb className="h-4 w-4 text-amber-500" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            data-testid={`button-movement-tips-${client.id}`}
          >
            <Sparkles className="h-3 w-3" />
            Get Tips
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Movement Strategy
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoading}
              data-testid="button-refresh-tips"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        {isLoading && !tip && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing account...</p>
          </div>
        )}

        {tip && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge className={`${stageColors[tip.currentStage as ClientBoardStage]} text-white`}>
                {CLIENT_BOARD_STAGE_LABELS[tip.currentStage as ClientBoardStage] || tip.currentStage}
              </Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge className={`${stageColors[tip.targetStage as ClientBoardStage]} text-white`}>
                {CLIENT_BOARD_STAGE_LABELS[tip.targetStage as ClientBoardStage] || tip.targetStage}
              </Badge>
            </div>

            <div>
              <h4 className="font-medium text-sm mb-1">{tip.headline}</h4>
              <p className="text-sm text-muted-foreground">{tip.reasoning}</p>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Recommended Actions
              </h4>
              
              {tip.actions.map((action, idx) => (
                <Card key={idx} className="bg-muted/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                          {idx + 1}
                        </span>
                        <p className="text-sm font-medium">{action.action}</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground pl-7">
                      <ChevronRight className="h-3 w-3 inline mr-1" />
                      {action.outcome}
                    </p>
                    
                    <div className="flex items-center gap-2 pl-7">
                      {action.framework && (
                        <Badge variant="secondary" className={`text-xs ${frameworkColors[action.framework] || ''}`}>
                          {action.framework}
                        </Badge>
                      )}
                      <Badge variant="secondary" className={`text-xs ${confidenceColors[action.confidence] || ''}`}>
                        {action.confidence} confidence
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {tip.blockingFactors && tip.blockingFactors.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    Blocking Factors
                  </h4>
                  <ul className="space-y-1">
                    {tip.blockingFactors.map((factor, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground text-center pt-2">
              Tips refresh every 6 hours or on demand
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useDraggable } from '@dnd-kit/core';
import { format } from 'date-fns';
import { Phone, Mail, MessageSquare, DollarSign, Calendar, AlertCircle, CheckCircle, AlertTriangle, Sparkles, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Client, HealthStatus, HEALTH_STATUS_LABELS, ClientBoardStage } from '@/lib/types';

interface ClientKanbanCardProps {
  client: Client;
  onClick: () => void;
  onQuickAction?: (action: 'call' | 'email' | 'sms') => void;
}

const healthIcons: Record<HealthStatus, React.ReactNode> = {
  green: <CheckCircle className="h-3 w-3 text-green-500" />,
  amber: <AlertTriangle className="h-3 w-3 text-amber-500" />,
  red: <AlertCircle className="h-3 w-3 text-red-500" />,
};

const healthBgColors: Record<HealthStatus, string> = {
  green: 'bg-green-50 dark:bg-green-900/20',
  amber: 'bg-amber-50 dark:bg-amber-900/20',
  red: 'bg-red-50 dark:bg-red-900/20',
};

export default function ClientKanbanCard({ client, onClick, onQuickAction }: ClientKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : undefined,
  } : undefined;

  // Compute days since last contact
  const daysSinceContact = client.lastContactDate 
    ? Math.floor((new Date().getTime() - new Date(client.lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Get top health contributors for tooltip (filter to non-good status)
  const topContributors = (client.healthContributors || [])
    .filter(c => c.status !== 'good')
    .slice(0, 3);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-3 cursor-grab transition-shadow hover-elevate ${
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-primary' : ''
      } ${healthBgColors[client.healthStatus]}`}
      data-testid={`card-client-${client.id}`}
      {...attributes}
      {...listeners}
    >
      {/* Header: Business name + Health badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          <h4 className="font-semibold text-sm truncate">{client.businessName}</h4>
          {client.primaryContactName && (
            <p className="text-xs text-muted-foreground truncate">{client.primaryContactName}</p>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={`shrink-0 text-[10px] px-1.5 py-0.5 gap-1 ${
                client.healthStatus === 'green' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400' :
                client.healthStatus === 'amber' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400' :
                'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400'
              }`}
              data-testid={`badge-health-${client.id}`}
            >
              {healthIcons[client.healthStatus]}
              {HEALTH_STATUS_LABELS[client.healthStatus]}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium text-xs">Health Contributors</p>
              {topContributors.length > 0 ? (
                topContributors.map((c, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs">
                    {c.status === 'ok' ? <AlertTriangle className="h-3 w-3 text-amber-500" /> : <AlertCircle className="h-3 w-3 text-red-500" />}
                    <span>{c.label}{c.metricValue ? `: ${c.metricValue}` : ''}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">All healthy</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Metrics row: MRR + Days since contact */}
      <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          <span>${client.totalMRR || 0}/mo</span>
        </div>
        {daysSinceContact !== null && (
          <div className={`flex items-center gap-1 ${daysSinceContact > 30 ? 'text-amber-600' : ''}`}>
            <Calendar className="h-3 w-3" />
            <span>{daysSinceContact}d ago</span>
          </div>
        )}
      </div>

      {/* Next contact date */}
      {client.nextContactDate && (
        <div className="flex items-center gap-1 mb-2 text-xs">
          <Calendar className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">Next:</span>
          <span className="font-medium">{format(new Date(client.nextContactDate), 'dd/MM/yyyy')}</span>
        </div>
      )}

      {/* Upsell indicator */}
      {(client.upsellReadiness === 'ready' || client.upsellReadiness === 'hot') && (
        <Badge 
          variant="outline" 
          className="mb-2 text-[10px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400"
          data-testid={`badge-upsell-${client.id}`}
        >
          <Sparkles className="h-2.5 w-2.5 mr-1" />
          {client.upsellReadiness === 'hot' ? 'Hot Upsell' : 'Upsell Ready'}
        </Badge>
      )}

      {/* Quick action buttons */}
      <div className="flex items-center gap-1 pt-2 border-t">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onQuickAction?.('call'); }}
              data-testid={`button-call-${client.id}`}
            >
              <Phone className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Log Call</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onQuickAction?.('email'); }}
              data-testid={`button-email-${client.id}`}
            >
              <Mail className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Log Email</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onQuickAction?.('sms'); }}
              data-testid={`button-sms-${client.id}`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Log SMS</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          data-testid={`button-open-${client.id}`}
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

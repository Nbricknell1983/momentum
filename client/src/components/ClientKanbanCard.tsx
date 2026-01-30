import { useDraggable } from '@dnd-kit/core';
import { format } from 'date-fns';
import { Phone, Mail, MessageSquare, DollarSign, Calendar, AlertCircle, CheckCircle, AlertTriangle, Sparkles, ChevronRight, Lightbulb, GripVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Client, HealthStatus, HEALTH_STATUS_LABELS, ClientBoardStage, ClientPainPoint } from '@/lib/types';
import { AccountMovementTips } from './AccountMovementTips';

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
      className={`p-3 transition-shadow hover-elevate ${
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-primary' : ''
      } ${healthBgColors[client.healthStatus]}`}
      data-testid={`card-client-${client.id}`}
    >
      {/* Header: Drag handle + Business name + Health badge */}
      <div className="flex items-start gap-2 mb-2">
        {/* Drag handle */}
        <div 
          className="flex-shrink-0 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onClick}
        >
          <h4 className="font-semibold text-sm break-words">{client.businessName}</h4>
          {client.primaryContactName && (
            <p className="text-xs text-muted-foreground break-words">{client.primaryContactName}</p>
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

      {/* Pain Points / Blockers - Prominent Display */}
      {client.painPoints && client.painPoints.length > 0 && (
        <div className="mb-2 space-y-1.5 p-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800" data-testid={`painpoints-${client.id}`}>
          <div className="flex items-center gap-1 text-[10px] font-semibold text-orange-700 dark:text-orange-400 uppercase">
            <AlertCircle className="h-3 w-3" />
            Current Focus
          </div>
          {client.painPoints.slice(0, 2).map((point) => (
            <div key={point.id} className="text-xs text-orange-800 dark:text-orange-300">
              <span className="font-medium">{point.description}</span>
              {point.budget && (
                <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 h-4 bg-orange-100 dark:bg-orange-900/30 border-orange-300 text-orange-700 dark:text-orange-400">
                  ${point.budget.toLocaleString()}
                </Badge>
              )}
            </div>
          ))}
          {client.painPoints.length > 2 && (
            <p className="text-[10px] text-orange-600 dark:text-orange-500">+{client.painPoints.length - 2} more</p>
          )}
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex items-center gap-1 pt-2 border-t">
        {client.phone && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  asChild
                  data-testid={`button-direct-call-${client.id}`}
                >
                  <a href={`tel:${client.phone}`} onClick={(e) => e.stopPropagation()}>
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Call</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  asChild
                  data-testid={`button-direct-sms-${client.id}`}
                >
                  <a href={`sms:${client.phone}`} onClick={(e) => e.stopPropagation()}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Text</TooltipContent>
            </Tooltip>
          </>
        )}
        {client.email && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                asChild
                data-testid={`button-direct-email-${client.id}`}
              >
                <a href={`mailto:${client.email}`} onClick={(e) => e.stopPropagation()}>
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Email</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span onClick={(e) => e.stopPropagation()}>
              <AccountMovementTips client={client} triggerVariant="icon" />
            </span>
          </TooltipTrigger>
          <TooltipContent>AI Movement Tips</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={onClick}
          data-testid={`button-open-${client.id}`}
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

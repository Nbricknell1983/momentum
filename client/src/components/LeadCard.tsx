import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lead, getTrafficLightStatus, ACTIVITY_LABELS } from '@/lib/types';
import TrafficLight from './TrafficLight';
import { MapPin, Phone, Calendar, DollarSign } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
  isDragging?: boolean;
}

export default function LeadCard({ lead, onClick, isDragging }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const trafficStatus = getTrafficLightStatus(lead);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-4 cursor-pointer hover-elevate active-elevate-2 ${
        isDragging ? 'opacity-50' : ''
      }`}
      onClick={onClick}
      data-testid={`card-lead-${lead.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-base truncate" data-testid={`text-company-${lead.id}`}>
          {lead.companyName}
        </h3>
        <TrafficLight status={trafficStatus} size="sm" />
      </div>

      {lead.contactName && (
        <p className="text-sm text-muted-foreground mb-2 truncate">
          {lead.contactName}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {lead.territory && (
          <div className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.territory}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1 truncate">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.phone}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        {lead.nextContactDate && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(lead.nextContactDate), 'MMM d')}
          </Badge>
        )}
        {lead.mrr && (
          <Badge variant="outline" className="text-xs gap-1">
            <DollarSign className="h-3 w-3" />
            {lead.mrr.toLocaleString()}/mo
          </Badge>
        )}
        {lead.nepqLabel && (
          <Badge variant="outline" className="text-xs">
            {lead.nepqLabel}
          </Badge>
        )}
      </div>

      {lead.lastActivityAt && (
        <p className="text-xs text-muted-foreground mt-2">
          Last: {formatDistanceToNow(new Date(lead.lastActivityAt), { addSuffix: true })}
        </p>
      )}
    </Card>
  );
}

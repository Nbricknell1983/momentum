import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { Lead, Stage, STAGE_LABELS } from '@/lib/types';
import LeadCard from './LeadCard';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KanbanColumnProps {
  stage: Stage;
  leads: Lead[];
  onLeadClick: (leadId: string) => void;
  onAddLead?: () => void;
}

export default function KanbanColumn({ stage, leads, onLeadClick, onAddLead }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-80 max-w-96 bg-muted/50 rounded-lg ${
        isOver ? 'ring-2 ring-primary ring-dashed' : ''
      }`}
      data-testid={`column-${stage}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-3 bg-muted/80 backdrop-blur rounded-t-lg border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{STAGE_LABELS[stage]}</h3>
          <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full">
            {leads.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onAddLead}
          data-testid={`button-add-lead-${stage}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-3">
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onClick={() => onLeadClick(lead.id)}
              />
            ))}
            {leads.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No leads in this stage
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

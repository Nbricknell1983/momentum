import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { Lead, Stage, STAGE_LABELS } from '@/lib/types';
import LeadCardExpanded from './LeadCardExpanded';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KanbanColumnExpandableProps {
  stage: Stage;
  leads: Lead[];
  expandedLeadId: string | null;
  onLeadToggle: (leadId: string | null) => void;
  onAddLead?: () => void;
  onConvertToClient?: (lead: Lead) => void;
}

export default function KanbanColumnExpandable({ 
  stage, 
  leads, 
  expandedLeadId, 
  onLeadToggle, 
  onAddLead,
  onConvertToClient,
}: KanbanColumnExpandableProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-72 max-w-80 bg-muted/50 rounded-lg ${
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
        <div className="flex flex-col gap-3">
          {leads.map((lead) => (
            <LeadCardExpanded
              key={lead.id}
              lead={lead}
              isExpanded={expandedLeadId === lead.id}
              onToggle={() => onLeadToggle(expandedLeadId === lead.id ? null : lead.id)}
              onConvertToClient={onConvertToClient}
            />
          ))}
          {leads.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No leads in this stage
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

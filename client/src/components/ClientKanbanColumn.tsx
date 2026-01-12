import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Client, ClientBoardStage, CLIENT_BOARD_STAGE_LABELS, CLIENT_BOARD_STAGE_COLORS } from '@/lib/types';
import ClientKanbanCard from './ClientKanbanCard';

interface ClientKanbanColumnProps {
  stage: ClientBoardStage;
  clients: Client[];
  onClientClick: (clientId: string) => void;
  onQuickAction?: (clientId: string, action: 'call' | 'email' | 'sms') => void;
}

export default function ClientKanbanColumn({ 
  stage, 
  clients, 
  onClientClick,
  onQuickAction 
}: ClientKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  // Calculate total MRR for this column
  const totalMRR = clients.reduce((sum, c) => sum + (c.totalMRR || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-72 max-w-80 bg-muted/50 rounded-lg ${
        isOver ? 'ring-2 ring-primary ring-dashed' : ''
      }`}
      data-testid={`column-${stage}`}
    >
      {/* Column header */}
      <div className="sticky top-0 z-10 p-3 bg-muted/80 backdrop-blur rounded-t-lg border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${CLIENT_BOARD_STAGE_COLORS[stage]}`} />
            <h3 className="font-semibold text-sm">{CLIENT_BOARD_STAGE_LABELS[stage]}</h3>
            <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full">
              {clients.length}
            </Badge>
          </div>
        </div>
        {totalMRR > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            ${totalMRR.toLocaleString()}/mo
          </p>
        )}
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 p-3">
        <div className="flex flex-col gap-3">
          {clients.map((client) => (
            <ClientKanbanCard
              key={client.id}
              client={client}
              onClick={() => onClientClick(client.id)}
              onQuickAction={(action) => onQuickAction?.(client.id, action)}
            />
          ))}
          {clients.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No clients in this stage
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

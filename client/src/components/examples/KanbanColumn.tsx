import { DndContext } from '@dnd-kit/core';
import KanbanColumn from '../KanbanColumn';
import { mockLeads } from '@/lib/mockData';

export default function KanbanColumnExample() {
  const discoveryLeads = mockLeads.filter(l => l.stage === 'discovery');
  
  return (
    <div className="p-4 h-96">
      <DndContext>
        <KanbanColumn
          stage="discovery"
          leads={discoveryLeads}
          onLeadClick={(id) => console.log('Lead clicked:', id)}
          onAddLead={() => console.log('Add lead clicked')}
        />
      </DndContext>
    </div>
  );
}

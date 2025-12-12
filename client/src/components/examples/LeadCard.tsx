import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import LeadCard from '../LeadCard';
import { mockLeads } from '@/lib/mockData';

export default function LeadCardExample() {
  const lead = mockLeads[0];
  
  return (
    <div className="p-4 max-w-sm">
      <DndContext>
        <SortableContext items={[lead.id]}>
          <LeadCard 
            lead={lead} 
            onClick={() => console.log('Lead clicked:', lead.companyName)} 
          />
        </SortableContext>
      </DndContext>
    </div>
  );
}

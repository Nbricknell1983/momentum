import TaskItem from '../TaskItem';
import { mockTasks, mockLeads } from '@/lib/mockData';

export default function TaskItemExample() {
  const task = mockTasks[0];
  const lead = mockLeads.find(l => l.id === task.leadId);

  return (
    <div className="p-4 max-w-md space-y-2">
      <TaskItem
        task={task}
        leadName={lead?.companyName}
        onComplete={() => console.log('Task completed')}
        onSnooze={() => console.log('Task snoozed')}
        onClick={() => console.log('Task clicked')}
      />
      <TaskItem
        task={{ ...mockTasks[1], status: 'completed' }}
        leadName="DataPrime Inc"
        onComplete={() => {}}
        onSnooze={() => {}}
      />
    </div>
  );
}

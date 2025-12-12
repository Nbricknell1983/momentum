import StatCard from '../StatCard';
import { Phone, Users, FileText, DollarSign } from 'lucide-react';

export default function StatCardExample() {
  return (
    <div className="p-4 grid grid-cols-2 gap-4 max-w-2xl">
      <StatCard
        title="Calls Today"
        value={12}
        target={25}
        change={15}
        changeLabel="vs yesterday"
        icon={<Phone className="h-5 w-5" />}
      />
      <StatCard
        title="Meetings"
        value={3}
        target={5}
        change={-10}
        changeLabel="vs last week"
        icon={<Users className="h-5 w-5" />}
      />
      <StatCard
        title="Proposals"
        value={2}
        change={50}
        icon={<FileText className="h-5 w-5" />}
      />
      <StatCard
        title="Revenue (MRR)"
        value="$24,500"
        icon={<DollarSign className="h-5 w-5" />}
      />
    </div>
  );
}

import TrafficLight from '../TrafficLight';

export default function TrafficLightExample() {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex items-center gap-2">
        <TrafficLight status="green" size="sm" />
        <span className="text-sm">Green (On track)</span>
      </div>
      <div className="flex items-center gap-2">
        <TrafficLight status="amber" size="md" />
        <span className="text-sm">Amber (Due today)</span>
      </div>
      <div className="flex items-center gap-2">
        <TrafficLight status="red" size="lg" />
        <span className="text-sm">Red (Overdue)</span>
      </div>
    </div>
  );
}

import ActivityButton from '../ActivityButton';

export default function ActivityButtonExample() {
  return (
    <div className="p-4 max-w-xs space-y-2">
      <ActivityButton 
        type="call" 
        count={5} 
        onLog={() => console.log('Logged call')} 
        onUndo={() => console.log('Undo call')}
      />
      <ActivityButton 
        type="email" 
        count={2} 
        onLog={() => console.log('Logged email')} 
      />
      <ActivityButton 
        type="meeting" 
        count={0} 
        onLog={() => console.log('Logged meeting')} 
      />
    </div>
  );
}

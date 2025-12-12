import AgentPanel from '../AgentPanel';

export default function AgentPanelExample() {
  return (
    <div className="h-[600px] relative">
      <AgentPanel
        isOpen={true}
        onClose={() => console.log('Close agent')}
        context={{ type: 'dashboard' }}
      />
    </div>
  );
}

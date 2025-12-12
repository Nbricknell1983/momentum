import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, MessageSquare, Users, MapPin, Undo2 } from 'lucide-react';
import { ActivityType, ACTIVITY_LABELS } from '@/lib/types';
import { useState } from 'react';

const ACTIVITY_ICONS: Record<ActivityType, typeof Phone> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
  meeting: Users,
  dropin: MapPin,
  followup: Phone,
  proposal: Mail,
  deal: Users,
};

interface ActivityButtonProps {
  type: ActivityType;
  count: number;
  onLog: () => void;
  onUndo?: () => void;
}

export default function ActivityButton({ type, count, onLog, onUndo }: ActivityButtonProps) {
  const [justLogged, setJustLogged] = useState(false);
  const Icon = ACTIVITY_ICONS[type];

  const handleLog = () => {
    onLog();
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 3000);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        className="h-12 w-full justify-start gap-3"
        onClick={handleLog}
        data-testid={`button-log-${type}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Log {ACTIVITY_LABELS[type]}</span>
        {count > 0 && (
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        )}
      </Button>
      {justLogged && onUndo && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-background border"
          onClick={onUndo}
          data-testid={`button-undo-${type}`}
        >
          <Undo2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

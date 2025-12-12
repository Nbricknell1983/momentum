import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { ChevronDown, ChevronUp, Phone, Mail, Copy, ExternalLink, Mic, Archive, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Lead, Stage, STAGE_LABELS, STAGE_ORDER, ActivityType, getTrafficLightStatus } from '@/lib/types';
import { countActivitiesByType } from '@/lib/mockData';
import { updateLead, updateLeadStage, addActivity, archiveLead, deleteLead } from '@/store';
import TrafficLight from './TrafficLight';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const NEPQ_LABELS = [
  'Situation Aware',
  'Problem Aware',
  'Consequence Aware',
  'Solution Aware',
  'Commitment Ready',
];

interface LeadCardExpandedProps {
  lead: Lead;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function LeadCardExpanded({ lead, isExpanded, onToggle }: LeadCardExpandedProps) {
  const dispatch = useDispatch();
  const [isRecording, setIsRecording] = useState(false);
  const [lastLoggedActivity, setLastLoggedActivity] = useState<{ type: ActivityType; id: string } | null>(null);

  const activityCounts = countActivitiesByType(lead.id);
  const trafficStatus = getTrafficLightStatus(lead);

  const handleStageChange = (stage: Stage) => {
    dispatch(updateLeadStage({ leadId: lead.id, stage }));
  };

  const handleMoveStage = (direction: 'left' | 'right') => {
    const currentIndex = STAGE_ORDER.indexOf(lead.stage);
    const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < STAGE_ORDER.length) {
      dispatch(updateLeadStage({ leadId: lead.id, stage: STAGE_ORDER[newIndex] }));
    }
  };

  const handleLogActivity = (type: ActivityType) => {
    const activityId = uuidv4();
    dispatch(addActivity({
      id: activityId,
      userId: lead.userId,
      leadId: lead.id,
      type,
      createdAt: new Date(),
    }));
    setLastLoggedActivity({ type, id: activityId });
    setTimeout(() => setLastLoggedActivity(null), 5000);
  };

  const handleUpdateField = (field: keyof Lead, value: any) => {
    dispatch(updateLead({ ...lead, [field]: value, updatedAt: new Date() }));
  };

  const handleArchive = () => {
    dispatch(archiveLead(lead.id));
  };

  const handleDelete = () => {
    dispatch(deleteLead(lead.id));
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    console.log(isRecording ? 'Stopped recording' : 'Started recording');
  };

  const ActivityButton = ({ type, label }: { type: ActivityType; label: string }) => {
    const count = activityCounts[type];
    const justLogged = lastLoggedActivity?.type === type;
    
    const colorClasses: Record<string, string> = {
      call: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
      email: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      sms: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
      meeting: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
      dropin: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
    };

    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 ${colorClasses[type] || ''}`}
          onClick={() => handleLogActivity(type)}
          data-testid={`button-log-${type}-${lead.id}`}
        >
          {label}
          <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-1">
            {count}
          </Badge>
        </Button>
        {justLogged && (
          <button 
            className="text-xs text-muted-foreground underline"
            onClick={() => setLastLoggedActivity(null)}
          >
            Undo
          </button>
        )}
      </div>
    );
  };

  return (
    <Card 
      className={`transition-all duration-200 ${isExpanded ? 'ring-2 ring-primary' : ''}`}
      data-testid={`card-lead-${lead.id}`}
    >
      {/* Collapsed Header - Always Visible */}
      <div 
        className="p-3 cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`lead-header-${lead.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{lead.companyName}</h3>
              <TrafficLight status={trafficStatus} size="sm" />
            </div>
            {lead.territory && (
              <p className="text-xs text-muted-foreground truncate">{lead.territory}</p>
            )}
          </div>
          {lead.nextContactDate && (
            <Badge variant="outline" className="text-xs shrink-0">
              Next: {format(new Date(lead.nextContactDate), 'dd/MM/yyyy')}
            </Badge>
          )}
        </div>
        {!isExpanded && lead.lastActivityAt && (
          <p className="text-xs text-muted-foreground mt-1">
            {lead.lastActivityAt && `Call`} - {lead.lastActivityAt && format(new Date(lead.lastActivityAt), 'dd/MM/yyyy')}
          </p>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-4 border-t pt-3">
          {/* Stage */}
          <div className="space-y-1">
            <Label className="text-xs">Stage</Label>
            <Select value={lead.stage} onValueChange={(val) => handleStageChange(val as Stage)}>
              <SelectTrigger className="h-9" data-testid={`select-stage-${lead.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* MRR */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">MRR: ${lead.mrr || 0}/mo</span>
            <span className="text-muted-foreground">- Weighted: $0</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={lead.mrr || ''}
              onChange={(e) => handleUpdateField('mrr', e.target.value ? Number(e.target.value) : undefined)}
              className="h-8 w-20"
              placeholder="0"
              data-testid={`input-mrr-${lead.id}`}
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => console.log('Save MRR')}
              data-testid={`button-save-mrr-${lead.id}`}
            >
              Save MRR
            </Button>
          </div>

          {/* Activity Buttons */}
          <div className="space-y-2">
            <ActivityButton type="call" label="Log Call" />
            <ActivityButton type="email" label="Log Email" />
            <ActivityButton type="sms" label="Log SMS" />
            <ActivityButton type="meeting" label="Log Meeting" />
            <ActivityButton type="dropin" label="Log Drop-in" />
          </div>

          {/* Playbooks */}
          <div className="p-3 bg-muted/50 rounded-md">
            <p className="text-sm font-medium">Playbooks (stage-aware templates)</p>
          </div>

          {/* NEPQ Label */}
          <div className="space-y-1">
            <Label className="text-xs">NEPQ label</Label>
            <Select value={lead.nepqLabel || 'none'} onValueChange={(val) => handleUpdateField('nepqLabel', val === 'none' ? undefined : val)}>
              <SelectTrigger className="h-9" data-testid={`select-nepq-${lead.id}`}>
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">--</SelectItem>
                {NEPQ_LABELS.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Primary Contact */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Primary contact</Label>
            <Input
              value={lead.contactName || ''}
              onChange={(e) => handleUpdateField('contactName', e.target.value)}
              placeholder="Name"
              className="h-8"
              data-testid={`input-contact-${lead.id}`}
            />
            <Input
              value={lead.phone || ''}
              onChange={(e) => handleUpdateField('phone', e.target.value)}
              placeholder="Phone"
              className="h-8"
              data-testid={`input-phone-${lead.id}`}
            />
            <Input
              value={lead.email || ''}
              onChange={(e) => handleUpdateField('email', e.target.value)}
              placeholder="Email"
              className="h-8"
              data-testid={`input-email-${lead.id}`}
            />
            <div className="flex items-center gap-2 text-sm">
              <button className="underline text-muted-foreground" onClick={() => console.log('Save contact')}>
                Save contact
              </button>
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="underline text-muted-foreground">
                  Call
                </a>
              )}
            </div>
          </div>

          {/* CRM Link */}
          <div className="space-y-2">
            <Label className="text-xs">Salesforce link (local)</Label>
            <Input
              value={lead.crmLink || ''}
              onChange={(e) => handleUpdateField('crmLink', e.target.value)}
              placeholder="https://... (paste here)"
              className="h-8"
              data-testid={`input-crm-${lead.id}`}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => console.log('Save')}>Save</Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => lead.crmLink && navigator.clipboard.writeText(lead.crmLink)}
              >
                Copy
              </Button>
              {lead.crmLink && (
                <Button variant="outline" size="sm" asChild>
                  <a href={lead.crmLink} target="_blank" rel="noopener noreferrer">Open</a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Stored per-deal in your browser (local). No CRM writeback.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={lead.notes || ''}
              onChange={(e) => handleUpdateField('notes', e.target.value)}
              placeholder="Call notes, objections, next steps..."
              rows={3}
              className="text-sm"
              data-testid={`textarea-notes-${lead.id}`}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => console.log('Save notes')}>
                Save notes
              </Button>
              <Button
                variant={isRecording ? 'destructive' : 'outline'}
                size="sm"
                onClick={toggleRecording}
                className="gap-1"
              >
                <Mic className="h-3 w-3" />
                Start dictation
              </Button>
            </div>
          </div>

          {/* Move Stage Controls */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <button 
              className="text-sm underline text-muted-foreground"
              onClick={() => handleMoveStage('left')}
              disabled={STAGE_ORDER.indexOf(lead.stage) === 0}
            >
              Move left
            </button>
            <span className="text-sm text-muted-foreground">{STAGE_LABELS[lead.stage]}</span>
            <button 
              className="text-sm underline text-muted-foreground"
              onClick={() => handleMoveStage('right')}
              disabled={STAGE_ORDER.indexOf(lead.stage) === STAGE_ORDER.length - 1}
            >
              Move right
            </button>
          </div>

          {/* Archive/Delete */}
          <div className="flex items-center gap-4 pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-sm underline text-muted-foreground">Archive</button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will move the lead to the archive.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-sm underline text-red-600">Delete</button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </Card>
  );
}

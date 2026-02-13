import { useState, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, Phone, Mail, Copy, ExternalLink, Mic, MicOff, Loader2, Globe, MessageSquare, Send, GripVertical, FileText, Calendar, Link2, Clock, ClipboardCheck, BarChart3, Users } from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Client, ClientBoardStage, ActivityType, CLIENT_BOARD_STAGE_LABELS, Stage, getDefaultClientBoardStage,
  ClientTouchpointType, CLIENT_TOUCHPOINT_LABELS, CLIENT_CADENCE_OPTIONS,
  getClientTrafficLight, getClientDaysInfo, ClientTrafficLight,
} from '@/lib/types';
import { updateClient } from '@/store';
import { format, addWeeks, addMonths } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { updateClientInFirestore, logClientAction, createClientHistoryEntry } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';
import { OutreachScriptsDialog } from './OutreachScriptsDialog';

interface ClientPipelineCardProps {
  client: Client;
  isExpanded: boolean;
  onToggle: () => void;
}

const TRAFFIC_LIGHT_COLORS: Record<ClientTrafficLight, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  none: 'bg-muted-foreground/30',
};

const TRAFFIC_LIGHT_LABELS: Record<ClientTrafficLight, string> = {
  green: 'On track',
  amber: 'Due soon',
  red: 'Overdue',
  none: 'No schedule',
};

export default function ClientPipelineCard({ client, isExpanded, onToggle }: ClientPipelineCardProps) {
  const dispatch = useDispatch();
  const { orgId, authReady, user: authUser } = useAuth();
  const { toast } = useToast();
  const [isLoggingActivity, setIsLoggingActivity] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [outreachScriptsOpen, setOutreachScriptsOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [editingCrmLink, setEditingCrmLink] = useState(false);
  const [crmLinkValue, setCrmLinkValue] = useState(client.crmLink || '');

  useEffect(() => {
    if (!editingCrmLink) {
      setCrmLinkValue(client.crmLink || '');
    }
  }, [client.crmLink, editingCrmLink]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: client.id,
    data: { type: 'client', client },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleDictationResult = useCallback((transcript: string) => {
    setNewNote(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
  }, []);

  const { isListening, startListening, stopListening, isSupported: dictationSupported } = useSpeechRecognition(handleDictationResult);

  const trafficLight = getClientTrafficLight(client);
  const daysInfo = getClientDaysInfo(client);

  const handleCopyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${type} copied`, description: text });
  };

  const handleLogTouchpoint = async (type: ClientTouchpointType) => {
    if (!orgId || !authReady) return;
    setIsLoggingActivity(type);

    try {
      const now = new Date();
      const label = CLIENT_TOUCHPOINT_LABELS[type];

      await logClientAction(orgId, {
        userId: authUser?.uid || 'unknown',
        clientId: client.id,
        clientName: client.businessName,
        type: type === 'check_in' ? 'call' : type === 'report_sent' ? 'email' : 'meeting' as ActivityType,
        notes: `Touchpoint: ${label}`,
      }, authReady);

      const cadenceDays = client.preferredContactCadenceDays || 14;
      const nextDate = new Date(now.getTime() + cadenceDays * 24 * 60 * 60 * 1000);

      const updates = {
        lastContactDate: now,
        nextContactDate: nextDate,
        updatedAt: now,
      };

      dispatch(updateClient({ ...client, ...updates }));
      await updateClientInFirestore(orgId, client.id, updates, authReady);

      await createClientHistoryEntry(orgId, client.id, {
        clientId: client.id,
        type: 'activity',
        summary: `Touchpoint logged: ${label}`,
        userId: authUser?.uid,
        metadata: { touchpointType: type },
        createdAt: now,
      }, authReady);

      toast({ title: 'Touchpoint logged', description: `${label} recorded. Next touchpoint set for ${format(nextDate, 'dd/MM/yyyy')}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to log touchpoint', variant: 'destructive' });
    } finally {
      setIsLoggingActivity(null);
    }
  };

  const handleLogActivity = async (type: ActivityType) => {
    if (!orgId || !authReady) return;
    setIsLoggingActivity(type);

    try {
      const now = new Date();

      await logClientAction(orgId, {
        userId: authUser?.uid || 'unknown',
        clientId: client.id,
        clientName: client.businessName,
        type: type,
        notes: `Logged ${type}`,
      }, authReady);

      const updates = {
        lastContactDate: now,
        updatedAt: now,
      };

      dispatch(updateClient({ ...client, ...updates }));
      await updateClientInFirestore(orgId, client.id, updates, authReady);

      toast({ title: 'Activity logged', description: `${type} recorded for ${client.businessName}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to log activity', variant: 'destructive' });
    } finally {
      setIsLoggingActivity(null);
    }
  };

  const handleSaveNote = async () => {
    if (!orgId || !authReady || !newNote.trim()) return;
    setIsSavingNote(true);

    try {
      const now = new Date();
      const dateStr = format(now, 'dd-MM-yyyy HH:mm');
      const existingNotes = client.notes || '';
      const updatedNotes = existingNotes
        ? `${existingNotes}\n\n[${dateStr}]\n${newNote.trim()}`
        : `[${dateStr}]\n${newNote.trim()}`;

      await updateClientInFirestore(orgId, client.id, { notes: updatedNotes }, authReady);
      dispatch(updateClient({ ...client, notes: updatedNotes, updatedAt: now }));

      setNewNote('');
      toast({ title: 'Note saved', description: 'Note added to client record' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save note', variant: 'destructive' });
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleSaveCrmLink = async () => {
    if (!orgId || !authReady) return;
    try {
      const updates = { crmLink: crmLinkValue.trim() || undefined, updatedAt: new Date() };
      await updateClientInFirestore(orgId, client.id, updates, authReady);
      dispatch(updateClient({ ...client, ...updates }));
      setEditingCrmLink(false);
      toast({ title: 'Salesforce link saved' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save link', variant: 'destructive' });
    }
  };

  const handleSetNextContactDate = async (date: Date) => {
    if (!orgId || !authReady) return;

    try {
      const updates = { nextContactDate: date, updatedAt: new Date() };
      await updateClientInFirestore(orgId, client.id, updates, authReady);
      dispatch(updateClient({ ...client, ...updates }));
      setIsDatePickerOpen(false);
      toast({ title: 'Next touchpoint date set', description: format(date, 'dd/MM/yyyy') });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to set date', variant: 'destructive' });
    }
  };

  const handleQuickAdjust = (adjustment: string) => {
    const baseDate = client.nextContactDate ? new Date(client.nextContactDate) : new Date();
    let newDate: Date;

    switch (adjustment) {
      case '+1w': newDate = addWeeks(baseDate, 1); break;
      case '+2w': newDate = addWeeks(baseDate, 2); break;
      case '+1m': newDate = addMonths(baseDate, 1); break;
      case '+3m': newDate = addMonths(baseDate, 3); break;
      default: newDate = baseDate;
    }

    handleSetNextContactDate(newDate);
  };

  const handleCadenceChange = async (days: string) => {
    if (!orgId || !authReady) return;

    try {
      const cadenceDays = parseInt(days);
      const now = new Date();
      const nextDate = client.lastContactDate
        ? new Date(new Date(client.lastContactDate).getTime() + cadenceDays * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + cadenceDays * 24 * 60 * 60 * 1000);

      const updates = {
        preferredContactCadenceDays: cadenceDays,
        nextContactDate: nextDate,
        updatedAt: now,
      };

      dispatch(updateClient({ ...client, ...updates }));
      await updateClientInFirestore(orgId, client.id, updates, authReady);

      const option = CLIENT_CADENCE_OPTIONS.find(o => o.days === cadenceDays);
      toast({ title: 'Cadence updated', description: `Set to ${option?.label || cadenceDays + ' days'}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update cadence', variant: 'destructive' });
    }
  };

  const clientBoardStage = client.boardStage || getDefaultClientBoardStage(client);

  const mapClientStageToLeadStage = (stage: ClientBoardStage): Stage => {
    switch (stage) {
      case 'onboarding': return 'won';
      case 'steady_state': return 'won';
      case 'growth_plays': return 'proposal';
      case 'watchlist': return 'qualified';
      case 'churned': return 'lost';
      default: return 'won';
    }
  };

  const leadForScripts = {
    id: client.id,
    companyName: client.businessName,
    contactName: client.primaryContactName,
    phone: client.phone,
    email: client.email,
    website: client.website,
    address: client.address,
    territory: client.regionName,
    stage: mapClientStageToLeadStage(clientBoardStage),
    notes: client.notes,
    userId: client.userId,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    archived: false,
    activityCount: 0,
    favorite: false,
    nurtureMode: 'none' as const,
    nextContactSource: 'ai' as const,
    nurtureCadenceId: null,
    nurtureStatus: null,
    nurtureStepIndex: 0,
    enrolledInNurtureAt: null,
    nextTouchAt: null,
    touchesNoResponse: 0,
    lastTouchType: null,
    lastTouchAt: null,
    nurtureExitReason: null,
  } as any;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="overflow-visible" data-testid={`card-client-pipeline-${client.id}`}>
        <div className="p-3">
          <div className="flex items-start gap-2">
            <div
              {...attributes}
              {...listeners}
              className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              data-testid={`drag-handle-${client.id}`}
            >
              <GripVertical className="h-4 w-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${TRAFFIC_LIGHT_COLORS[trafficLight]}`}
                    title={TRAFFIC_LIGHT_LABELS[trafficLight]}
                    data-testid={`traffic-light-${client.id}`}
                  />
                  <h4 className="font-medium text-sm truncate">{client.businessName}</h4>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={onToggle}
                  data-testid={`button-toggle-${client.id}`}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground truncate">{client.primaryContactName}</p>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {client.totalMRR && client.totalMRR > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    ${client.totalMRR.toLocaleString()}/mo
                  </Badge>
                )}
                {daysInfo.daysSinceContact !== null && (
                  <span className="text-xs text-muted-foreground">
                    {daysInfo.daysSinceContact === 0 ? 'Contacted today' : `${daysInfo.daysSinceContact}d ago`}
                  </span>
                )}
                {daysInfo.daysUntilDue !== null && (
                  <span className={`text-xs ${daysInfo.daysUntilDue < 0 ? 'text-destructive font-medium' : daysInfo.daysUntilDue <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                    {daysInfo.daysUntilDue < 0
                      ? `${Math.abs(daysInfo.daysUntilDue)}d overdue`
                      : daysInfo.daysUntilDue === 0
                        ? 'Due today'
                        : `Due in ${daysInfo.daysUntilDue}d`}
                  </span>
                )}
              </div>

              {client.notes && !isExpanded && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1 break-words">{client.notes.split('\n')[0]}</p>
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t px-3 pb-3 pt-2 space-y-3">
            <div>
              <Label className="text-xs font-medium mb-2 block">Touchpoint Schedule</Label>
              <div className="flex items-center gap-2 mb-2">
                <Select
                  value={String(client.preferredContactCadenceDays || 14)}
                  onValueChange={handleCadenceChange}
                >
                  <SelectTrigger className="flex-1" data-testid={`select-cadence-${client.id}`}>
                    <SelectValue placeholder="Set cadence" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_CADENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.days} value={String(opt.days)}>
                        {opt.label} ({opt.days}d)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-1 shrink-0" data-testid={`button-set-date-${client.id}`}>
                      <Calendar className="h-3 w-3" />
                      {client.nextContactDate ? format(new Date(client.nextContactDate), 'dd/MM/yy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="single"
                      selected={client.nextContactDate ? new Date(client.nextContactDate) : undefined}
                      onSelect={(date) => date && handleSetNextContactDate(date)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex gap-1 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handleQuickAdjust('+1w')} data-testid={`button-adjust-1w-${client.id}`}>+1w</Button>
                <Button variant="outline" size="sm" onClick={() => handleQuickAdjust('+2w')} data-testid={`button-adjust-2w-${client.id}`}>+2w</Button>
                <Button variant="outline" size="sm" onClick={() => handleQuickAdjust('+1m')} data-testid={`button-adjust-1m-${client.id}`}>+1m</Button>
                <Button variant="outline" size="sm" onClick={() => handleQuickAdjust('+3m')} data-testid={`button-adjust-3m-${client.id}`}>+3m</Button>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs font-medium mb-2 block">Log Touchpoint</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(CLIENT_TOUCHPOINT_LABELS) as [ClientTouchpointType, string][]).map(([type, label]) => (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    className="gap-1 justify-start"
                    onClick={() => handleLogTouchpoint(type)}
                    disabled={isLoggingActivity !== null}
                    data-testid={`button-touchpoint-${type}-${client.id}`}
                  >
                    {isLoggingActivity === type ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        {type === 'check_in' && <Phone className="h-3 w-3" />}
                        {type === 'report_sent' && <BarChart3 className="h-3 w-3" />}
                        {type === 'strategy_review' && <ClipboardCheck className="h-3 w-3" />}
                        {type === 'qbr' && <Users className="h-3 w-3" />}
                        {type === 'ad_hoc' && <Clock className="h-3 w-3" />}
                      </>
                    )}
                    <span className="truncate text-xs">{label}</span>
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-1">
              {client.phone && (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => handleCopyToClipboard(client.phone!, 'Phone')}>
                  <Phone className="h-3 w-3" />
                  {client.phone}
                  <Copy className="h-3 w-3 ml-1" />
                </Button>
              )}
              {client.email && (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => handleCopyToClipboard(client.email!, 'Email')}>
                  <Mail className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{client.email}</span>
                  <Copy className="h-3 w-3 ml-1" />
                </Button>
              )}
              {client.website && (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
                  <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-3 w-3" />
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
              {client.facebookUrl && (
                <Button variant="ghost" size="icon" asChild>
                  <a href={client.facebookUrl} target="_blank" rel="noopener noreferrer"><SiFacebook className="h-3 w-3" /></a>
                </Button>
              )}
              {client.instagramUrl && (
                <Button variant="ghost" size="icon" asChild>
                  <a href={client.instagramUrl} target="_blank" rel="noopener noreferrer"><SiInstagram className="h-3 w-3" /></a>
                </Button>
              )}
              {client.linkedinUrl && (
                <Button variant="ghost" size="icon" asChild>
                  <a href={client.linkedinUrl} target="_blank" rel="noopener noreferrer"><SiLinkedin className="h-3 w-3" /></a>
                </Button>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <Label className="text-xs font-medium">Salesforce</Label>
                {!editingCrmLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => { setCrmLinkValue(client.crmLink || ''); setEditingCrmLink(true); }}
                    data-testid={`button-edit-crm-${client.id}`}
                  >
                    <Link2 className="h-3 w-3" />
                    {client.crmLink ? 'Edit' : 'Add link'}
                  </Button>
                )}
              </div>
              {client.crmLink && !editingCrmLink && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2 justify-start"
                    asChild
                    data-testid={`button-open-salesforce-${client.id}`}
                  >
                    <a href={client.crmLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      <span className="truncate text-sm">Open in Salesforce</span>
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyToClipboard(client.crmLink!, 'Salesforce link')}
                    data-testid={`button-copy-crm-${client.id}`}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {editingCrmLink && (
                <div className="flex items-center gap-2">
                  <Input
                    value={crmLinkValue}
                    onChange={(e) => setCrmLinkValue(e.target.value)}
                    placeholder="Paste Salesforce link..."
                    className="flex-1 text-sm"
                    data-testid={`input-crm-link-${client.id}`}
                  />
                  <Button size="sm" onClick={handleSaveCrmLink} data-testid={`button-save-crm-${client.id}`}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingCrmLink(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                className="flex-1 gap-2 justify-start"
                onClick={() => setOutreachScriptsOpen(true)}
                data-testid={`button-playbooks-client-${client.id}`}
              >
                <FileText className="h-4 w-4" />
                <span className="font-medium text-sm">Playbooks</span>
              </Button>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <Label className="text-xs font-medium">Quick Note</Label>
                {dictationSupported && (
                  <Button
                    variant={isListening ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1"
                    onClick={isListening ? stopListening : startListening}
                    data-testid={`button-dictate-${client.id}`}
                  >
                    {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                    {isListening ? 'Stop' : 'Dictate'}
                  </Button>
                )}
              </div>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
                className="min-h-[60px] text-sm"
                data-testid={`input-note-${client.id}`}
              />
              <Button
                variant="default"
                size="sm"
                className="w-full mt-2 gap-1"
                onClick={handleSaveNote}
                disabled={isSavingNote || !newNote.trim()}
                data-testid={`button-save-note-${client.id}`}
              >
                {isSavingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Save Note
              </Button>
            </div>

            {client.notes && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs font-medium mb-1 block">Notes</Label>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto break-words">
                    {client.notes}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <OutreachScriptsDialog
        lead={leadForScripts}
        open={outreachScriptsOpen}
        onOpenChange={setOutreachScriptsOpen}
        notes={client.notes}
      />
    </div>
  );
}

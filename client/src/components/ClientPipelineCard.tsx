import { useState, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, Phone, Mail, Copy, ExternalLink, Mic, MicOff, Loader2, Globe, MessageSquare, Send, GripVertical, FileText, Calendar, Link2 } from 'lucide-react';
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
import { Client, ClientBoardStage, ActivityType, CLIENT_BOARD_STAGE_LABELS, Stage, getDefaultClientBoardStage } from '@/lib/types';
import { updateClient, addActivity } from '@/store';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/contexts/AuthContext';
import { updateClientInFirestore, logClientAction } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';
import { OutreachScriptsDialog } from './OutreachScriptsDialog';

interface ClientPipelineCardProps {
  client: Client;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function ClientPipelineCard({ client, isExpanded, onToggle }: ClientPipelineCardProps) {
  const dispatch = useDispatch();
  const { orgId, authReady, user: authUser } = useAuth();
  const { toast } = useToast();
  const [isLoggingActivity, setIsLoggingActivity] = useState<ActivityType | null>(null);
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

  const handleCopyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${type} copied`, description: text });
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
      toast({ title: 'Next contact date set', description: format(date, 'dd/MM/yyyy') });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to set date', variant: 'destructive' });
    }
  };

  const ActivityButton = ({ type, label }: { type: ActivityType; label: string }) => (
    <Button
      variant="outline"
      size="sm"
      className="flex-1 gap-1"
      onClick={() => handleLogActivity(type)}
      disabled={isLoggingActivity !== null}
      data-testid={`button-log-${type}-${client.id}`}
    >
      {isLoggingActivity === type ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <>
          {type === 'call' && <Phone className="h-3 w-3" />}
          {type === 'email' && <Mail className="h-3 w-3" />}
          {type === 'meeting' && <Calendar className="h-3 w-3" />}
          {type === 'sms' && <MessageSquare className="h-3 w-3" />}
        </>
      )}
      {label}
    </Button>
  );

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
                <h4 className="font-medium text-sm truncate">{client.businessName}</h4>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={onToggle}
                  data-testid={`button-toggle-${client.id}`}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground truncate">{client.primaryContactName}</p>
              
              {client.totalMRR && client.totalMRR > 0 && (
                <Badge variant="secondary" className="mt-1 text-xs">
                  ${client.totalMRR.toLocaleString()}/mo
                </Badge>
              )}

              {client.notes && !isExpanded && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">{client.notes.split('\n')[0]}</p>
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t px-3 pb-3 pt-2 space-y-3">
            <div className="flex flex-wrap gap-1">
              {client.phone && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleCopyToClipboard(client.phone!, 'Phone')}>
                  <Phone className="h-3 w-3" />
                  {client.phone}
                  <Copy className="h-3 w-3 ml-1" />
                </Button>
              )}
              {client.email && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleCopyToClipboard(client.email!, 'Email')}>
                  <Mail className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{client.email}</span>
                  <Copy className="h-3 w-3 ml-1" />
                </Button>
              )}
              {client.website && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" asChild>
                  <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-3 w-3" />
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
              {client.facebookUrl && (
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={client.facebookUrl} target="_blank" rel="noopener noreferrer"><SiFacebook className="h-3 w-3" /></a>
                </Button>
              )}
              {client.instagramUrl && (
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={client.instagramUrl} target="_blank" rel="noopener noreferrer"><SiInstagram className="h-3 w-3" /></a>
                </Button>
              )}
              {client.linkedinUrl && (
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={client.linkedinUrl} target="_blank" rel="noopener noreferrer"><SiLinkedin className="h-3 w-3" /></a>
                </Button>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <Label className="text-xs font-medium">Salesforce</Label>
                {!editingCrmLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
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

            <div>
              <Label className="text-xs font-medium mb-2 block">Quick Actions</Label>
              <div className="grid grid-cols-2 gap-2">
                <ActivityButton type="call" label="Call" />
                <ActivityButton type="email" label="Email" />
                <ActivityButton type="sms" label="SMS" />
                <ActivityButton type="meeting" label="Meeting" />
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2 justify-start"
              onClick={() => setOutreachScriptsOpen(true)}
              data-testid={`button-playbooks-client-${client.id}`}
            >
              <FileText className="h-4 w-4" />
              <span className="font-medium">Playbooks</span>
              <Badge variant="secondary" className="ml-auto text-xs">Stage-aware</Badge>
            </Button>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">Next Contact</Label>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <Calendar className="h-3 w-3" />
                      {client.nextContactDate ? format(new Date(client.nextContactDate), 'dd/MM/yyyy') : 'Set date'}
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
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">Quick Note</Label>
                {dictationSupported && (
                  <Button
                    variant={isListening ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 gap-1"
                    onClick={isListening ? stopListening : startListening}
                    data-testid={`button-dictate-${client.id}`}
                  >
                    {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                    {isListening ? 'Stop' : 'Dictate'}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  className="min-h-[60px] text-sm"
                  data-testid={`input-note-${client.id}`}
                />
              </div>
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

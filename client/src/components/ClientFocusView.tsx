import { useState, useEffect, useCallback } from 'react';
import { X, ArrowLeft, ArrowRight, Phone, Mail, Globe, MapPin, Calendar, User, Loader2, Clock, DollarSign, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { updateClient } from '@/store';
import {
  Client, ClientBoardStage, CLIENT_BOARD_STAGE_ORDER, CLIENT_BOARD_STAGE_LABELS,
  CLIENT_BOARD_STAGE_COLORS, HEALTH_STATUS_LABELS, ActivityType,
} from '@/lib/types';
import { logClientAction, updateClientInFirestore, fetchClientActivities } from '@/lib/firestoreService';
import ClientGrowthIntelligencePanel from './ClientGrowthIntelligencePanel';
import AIClientGrowthEngine from './AIClientGrowthEngine';
import { format, addWeeks, addMonths } from 'date-fns';

const HEALTH_COLORS = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

const ACTIVITY_BUTTONS: { type: ActivityType; label: string; color: string }[] = [
  { type: 'call',            label: 'Log Call',     color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-500/20' },
  { type: 'email',           label: 'Log Email',    color: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800 hover:bg-violet-500/20' },
  { type: 'sms',             label: 'Log SMS',      color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-500/20' },
  { type: 'meeting',         label: 'Log Meeting',  color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-500/20' },
  { type: 'meeting_booked',  label: 'Review Booked',color: 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800 hover:bg-pink-500/20' },
  { type: 'dropin',          label: 'Log Drop-in',  color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-500/20' },
];

interface ClientFocusViewProps {
  client: Client;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function QuickAction({ icon: Icon, label, href, onClick }: { icon: typeof Phone; label: string; href?: string; onClick?: () => void }) {
  const cls = 'flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-muted/60 transition-colors text-xs text-muted-foreground cursor-pointer border border-transparent hover:border-border';
  if (href) return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      <Icon className="h-4 w-4" />{label}
    </a>
  );
  return <button onClick={onClick} className={cls}><Icon className="h-4 w-4" />{label}</button>;
}

function ClientLeftPanel({ client }: { client: Client }) {
  const { orgId, authReady, user } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();

  const [activityCounts, setActivityCounts] = useState<Record<string, number>>({});
  const [loggingType, setLoggingType] = useState<ActivityType | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [updatingNextContact, setUpdatingNextContact] = useState(false);
  const [localStage, setLocalStage] = useState<ClientBoardStage>(client.boardStage || 'steady_state');
  const [localNextContact, setLocalNextContact] = useState<Date | null>(
    client.nextContactDate ? new Date(client.nextContactDate) : null
  );

  useEffect(() => {
    setLocalStage(client.boardStage || 'steady_state');
    setLocalNextContact(client.nextContactDate ? new Date(client.nextContactDate) : null);
  }, [client.id, client.boardStage, client.nextContactDate]);

  useEffect(() => {
    if (!orgId || !authReady) return;
    fetchClientActivities(orgId, client.id, authReady).then(activities => {
      const counts: Record<string, number> = {};
      activities.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
      setActivityCounts(counts);
    });
  }, [orgId, authReady, client.id]);

  const logActivity = useCallback(async (type: ActivityType) => {
    if (!orgId || !authReady || !user) return;
    setLoggingType(type);
    try {
      await logClientAction(orgId, {
        userId: user.uid,
        clientId: client.id,
        type,
        clientName: client.businessName,
      }, authReady);
      setActivityCounts(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
      const now = new Date();
      dispatch(updateClient({ ...client, lastContactDate: now }));
      await updateClientInFirestore(orgId, client.id, { lastContactDate: now }, authReady);
      toast({ title: 'Activity logged', description: `${ACTIVITY_BUTTONS.find(b => b.type === type)?.label} logged for ${client.businessName}` });
    } catch {
      toast({ title: 'Failed to log activity', variant: 'destructive' });
    } finally {
      setLoggingType(null);
    }
  }, [orgId, authReady, user, client, dispatch, toast]);

  const updateStage = useCallback(async (stage: ClientBoardStage) => {
    if (!orgId || !authReady) return;
    setLocalStage(stage);
    setUpdatingStage(true);
    try {
      dispatch(updateClient({ ...client, boardStage: stage }));
      await updateClientInFirestore(orgId, client.id, { boardStage: stage }, authReady);
    } catch {
      toast({ title: 'Failed to update stage', variant: 'destructive' });
      setLocalStage(client.boardStage || 'steady_state');
    } finally {
      setUpdatingStage(false);
    }
  }, [orgId, authReady, client, dispatch, toast]);

  const setNextContact = useCallback(async (date: Date) => {
    if (!orgId || !authReady) return;
    setLocalNextContact(date);
    setUpdatingNextContact(true);
    try {
      dispatch(updateClient({ ...client, nextContactDate: date }));
      await updateClientInFirestore(orgId, client.id, { nextContactDate: date }, authReady);
    } catch {
      toast({ title: 'Failed to update next contact', variant: 'destructive' });
    } finally {
      setUpdatingNextContact(false);
    }
  }, [orgId, authReady, client, dispatch, toast]);

  const activeProducts = client.products?.filter(p => p.status === 'active') || [];
  const totalMRR = activeProducts.reduce((sum, p) => sum + (p.monthlyValue || 0), 0);
  const isOverdue = localNextContact && localNextContact < new Date();

  const formatDate = (d?: Date | string | null) => {
    if (!d) return '—';
    return format(new Date(d), 'dd/MM/yyyy');
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-1">
          {client.phone && <QuickAction icon={Phone} label="Call" href={`tel:${client.phone}`} />}
          {client.email && <QuickAction icon={Mail} label="Email" href={`mailto:${client.email}`} />}
          {client.website && <QuickAction icon={Globe} label="Website" href={client.website.startsWith('http') ? client.website : `https://${client.website}`} />}
          <QuickAction icon={Calendar} label="Schedule" />
        </div>

        <Separator />

        {/* Stage */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stage</p>
          <Select value={localStage} onValueChange={(v) => updateStage(v as ClientBoardStage)} disabled={updatingStage}>
            <SelectTrigger className="h-9 text-sm" data-testid="select-client-stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_BOARD_STAGE_ORDER.map(s => (
                <SelectItem key={s} value={s}>{CLIENT_BOARD_STAGE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Next Contact */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Next Contact
              {updatingNextContact && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
            </p>
            {localNextContact && (
              <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-foreground'}`}>
                {formatDate(localNextContact)}
                {isOverdue && ' ⚠'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '+1 wk', fn: () => setNextContact(addWeeks(new Date(), 1)) },
              { label: '+2 wk', fn: () => setNextContact(addWeeks(new Date(), 2)) },
              { label: '+1 mo', fn: () => setNextContact(addMonths(new Date(), 1)) },
              { label: '+2 mo', fn: () => setNextContact(addMonths(new Date(), 2)) },
            ].map(({ label, fn }) => (
              <button
                key={label}
                onClick={fn}
                disabled={updatingNextContact}
                className="text-xs px-2 py-1 rounded border border-border bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                data-testid={`button-next-contact-${label.replace(/[+ ]/g, '').toLowerCase()}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Account Value */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account Value</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${totalMRR.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">MRR</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{activeProducts.length}</p>
              <p className="text-[10px] text-muted-foreground">Services</p>
            </div>
          </div>
          {activeProducts.length > 0 && (
            <div className="space-y-1">
              {activeProducts.map((p, i) => (
                <div key={i} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
                  <span className="text-muted-foreground">{p.productType}</span>
                  <span className="font-medium">${p.monthlyValue}/mo</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Activity Logging */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Log Activity</p>
          <div className="grid grid-cols-2 gap-1.5">
            {ACTIVITY_BUTTONS.map(({ type, label, color }) => {
              const count = activityCounts[type] || 0;
              const isLogging = loggingType === type;
              return (
                <button
                  key={type}
                  onClick={() => logActivity(type)}
                  disabled={!!loggingType}
                  data-testid={`button-log-${type}`}
                  className={`flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60 ${color}`}
                >
                  <span className="flex items-center gap-1.5">
                    {isLogging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    {label}
                  </span>
                  {count > 0 && (
                    <span className="ml-auto bg-current/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none opacity-80">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Client Details */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client Details</p>
          <div className="space-y-2">
            {client.primaryContactName && (
              <div className="flex items-start gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Contact</p>
                  <p className="text-sm font-medium">{client.primaryContactName}</p>
                </div>
              </div>
            )}
            {client.phone && (
              <div className="flex items-start gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm">{client.phone}</p>
              </div>
            )}
            {client.email && (
              <div className="flex items-start gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm truncate">{client.email}</p>
              </div>
            )}
            {client.website && (
              <div className="flex items-start gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <a
                  href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
                >
                  {client.website}
                </a>
              </div>
            )}
            {(client.address || client.regionName || client.areaName) && (
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm">{client.address || [client.areaName, client.regionName].filter(Boolean).join(', ')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Relationship */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Relationship</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Last Contact</span>
              <span>{formatDate(client.lastContactDate)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Strategy Status</span>
              <span className="capitalize">{client.strategyStatus?.replace(/_/g, ' ') || 'Not started'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Source</span>
              <span className="capitalize">{client.sourceType || '—'}</span>
            </div>
          </div>
        </div>

        {/* Health Factors */}
        {client.healthReasons && client.healthReasons.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Health Factors</p>
              <div className="space-y-1.5">
                {client.healthReasons.map((reason, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="text-muted-foreground">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        {client.notes && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

export default function ClientFocusView({ client, onClose, onNavigate, hasPrev, hasNext }: ClientFocusViewProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (isEditable) return;
      if (e.key === 'ArrowLeft' && onNavigate && hasPrev) onNavigate('prev');
      if (e.key === 'ArrowRight' && onNavigate && hasNext) onNavigate('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate, hasPrev, hasNext]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const boardStageLabel = client.boardStage ? CLIENT_BOARD_STAGE_LABELS[client.boardStage] : 'Client';
  const healthColor = HEALTH_COLORS[client.healthStatus] || HEALTH_COLORS.amber;
  const stageColorClass = client.boardStage ? CLIENT_BOARD_STAGE_COLORS[client.boardStage] : 'bg-gray-400';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="client-focus-view">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost" size="icon" onClick={onClose}
            className="h-8 w-8 shrink-0" data-testid="button-close-client-focus"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold truncate" data-testid="text-client-focus-name">
                {client.businessName}
              </h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${healthColor}`}>
                {HEALTH_STATUS_LABELS[client.healthStatus]}
              </span>
              <Badge variant="outline" className="text-xs gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${stageColorClass}`} />
                {boardStageLabel}
              </Badge>
              {client.totalMRR > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <DollarSign className="h-2.5 w-2.5" />${client.totalMRR.toLocaleString()}/mo
                </Badge>
              )}
            </div>
            {(client.regionName || client.areaName || client.address) && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {client.address || [client.areaName, client.regionName].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onNavigate && (
            <>
              <Button variant="ghost" size="icon" onClick={() => onNavigate('prev')} disabled={!hasPrev} className="h-8 w-8" data-testid="button-client-focus-prev">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onNavigate('next')} disabled={!hasNext} className="h-8 w-8" data-testid="button-client-focus-next">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 3-Column Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left — Client Controls */}
        <div className="w-[340px] shrink-0 border-r">
          <ClientLeftPanel client={client} />
        </div>

        {/* Centre — Account Intelligence */}
        <div className="flex-1 border-r min-w-0">
          <ClientGrowthIntelligencePanel client={client} />
        </div>

        {/* Right — AI Client Growth Engine */}
        <div className="w-[380px] shrink-0 bg-muted/5">
          <AIClientGrowthEngine client={client} />
        </div>
      </div>
    </div>
  );
}

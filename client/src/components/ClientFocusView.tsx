import { useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, Phone, Mail, Globe, MapPin, DollarSign, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Client, CLIENT_BOARD_STAGE_LABELS, HEALTH_STATUS_LABELS,
} from '@/lib/types';
import ClientGrowthIntelligencePanel from './ClientGrowthIntelligencePanel';
import AIClientGrowthEngine from './AIClientGrowthEngine';

const HEALTH_COLORS = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

function QuickAction({ icon: Icon, label, href, onClick }: { icon: typeof Phone; label: string; href?: string; onClick?: () => void }) {
  const cls = 'flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-muted/60 transition-colors text-xs text-muted-foreground cursor-pointer border border-transparent hover:border-border';
  if (href) return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      <Icon className="h-4 w-4" />{label}
    </a>
  );
  return (
    <button onClick={onClick} className={cls}>
      <Icon className="h-4 w-4" />{label}
    </button>
  );
}

function ClientLeftPanel({ client }: { client: Client }) {
  const activeProducts = client.products?.filter(p => p.status === 'active') || [];
  const totalMRR = activeProducts.reduce((sum, p) => sum + (p.monthlyValue || 0), 0);

  const formatDate = (d?: Date | string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

        {/* Client Details */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client Details</p>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Primary Contact</p>
                <p className="text-sm font-medium">{client.primaryContactName || '—'}</p>
              </div>
            </div>
            {client.phone && (
              <div className="flex items-start gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{client.phone}</p>
                </div>
              </div>
            )}
            {client.email && (
              <div className="flex items-start gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{client.email}</p>
                </div>
              </div>
            )}
            {client.website && (
              <div className="flex items-start gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Website</p>
                  <a
                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block"
                  >
                    {client.website}
                  </a>
                </div>
              </div>
            )}
            {(client.regionName || client.areaName || client.address) && (
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="text-sm">{client.address || [client.areaName, client.regionName].filter(Boolean).join(', ')}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Account Value */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account Value</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${totalMRR.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">MRR</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{activeProducts.length}</p>
              <p className="text-[10px] text-muted-foreground">Active Services</p>
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

        {/* Relationship Management */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Relationship</p>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Last Contact</span>
              <span>{formatDate(client.lastContactDate)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Next Contact</span>
              <span className={client.nextContactDate && new Date(client.nextContactDate) < new Date() ? 'text-red-500 font-medium' : ''}>
                {formatDate(client.nextContactDate)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Strategy Status</span>
              <span className="capitalize">{client.strategyStatus?.replace(/_/g, ' ') || 'Not started'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Source</span>
              <span className="capitalize">{client.sourceType}</span>
            </div>
          </div>
        </div>

        {/* Account Health Factors */}
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

interface ClientFocusViewProps {
  client: Client;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
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
              <Badge variant="outline" className="text-xs">{boardStageLabel}</Badge>
              {client.totalMRR > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <DollarSign className="h-2.5 w-2.5" />${client.totalMRR.toLocaleString()}/mo
                </Badge>
              )}
            </div>
            {(client.regionName || client.areaName) && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {[client.areaName, client.regionName].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onNavigate && (
            <>
              <Button
                variant="ghost" size="icon"
                onClick={() => onNavigate('prev')} disabled={!hasPrev}
                className="h-8 w-8" data-testid="button-client-focus-prev"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon"
                onClick={() => onNavigate('next')} disabled={!hasNext}
                className="h-8 w-8" data-testid="button-client-focus-next"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 3-Column Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left — Client Context */}
        <div className="w-[360px] shrink-0 border-r">
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

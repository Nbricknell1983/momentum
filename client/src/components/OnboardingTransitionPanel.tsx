/**
 * OnboardingTransitionPanel
 *
 * 4-step guided panel: Scope → Capture → Readiness → Handoff
 * Bridges the gap between a shared strategy report and a provisioned tenant.
 * Lives in LeadFocusView as the "Onboarding" tab.
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronRight, ChevronDown, ChevronUp,
  Globe, Search, MapPin, Megaphone, FileText, Zap, BarChart2, Key, Sparkles,
  Loader2, Save, ArrowRight, ArrowLeft, Clock, ShieldCheck, Building2,
  User, MapPinned, Wrench, Lock, CheckSquare, Square, RefreshCw, ExternalLink,
  Info, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  OnboardingState, ProposalStatus, ModuleKey, ModuleTiming, ModuleSelection,
  MODULE_CATALOGUE, emptyCapture, emptyModuleSelections, deriveReadiness,
  OnboardingCapture, ReadinessCheck, OnboardingBlocker,
} from '@/lib/proposalAcceptanceTypes';
import { ProvisioningPanel } from './ProvisioningPanel';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return '—'; }
}

async function apiRequest(method: string, url: string, body?: unknown) {
  const auth = (window as any).__firebaseAuth;
  const token = auth ? await auth.currentUser?.getIdToken() : null;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ProposalStatus, { label: string; color: string; bg: string }> = {
  strategy_presented:     { label: 'Strategy Presented',    color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-950/40' },
  proposal_pending:       { label: 'Proposal Pending',      color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-50 dark:bg-amber-950/40' },
  proposal_accepted:      { label: 'Proposal Accepted',     color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  onboarding_in_progress: { label: 'Onboarding In Progress',color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
  onboarding_ready:       { label: 'Onboarding Ready',      color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  provisioning:           { label: 'Provisioning',          color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  provisioned:            { label: 'Provisioned ✓',         color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  onboarding_failed:      { label: 'Onboarding Failed',     color: 'text-red-700 dark:text-red-300',      bg: 'bg-red-50 dark:bg-red-950/40' },
};

const MODULE_ICON_MAP: Record<ModuleKey, typeof Globe> = {
  website:      Globe,
  seo:          Search,
  gbp:          MapPin,
  google_ads:   Megaphone,
  content:      FileText,
  local_seo:    MapPinned,
  telemetry:    BarChart2,
  autopilot:    Zap,
  portal_access: Key,
};

const TIMING_OPTIONS: { value: ModuleTiming; label: string; color: string; bg: string }[] = [
  { value: 'now',          label: 'Now',           color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800' },
  { value: 'later',        label: 'Later',         color: 'text-amber-700 dark:text-amber-300',    bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800' },
  { value: 'not_included', label: 'Not Included',  color: 'text-zinc-500 dark:text-zinc-400',      bg: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700' },
];

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepId = 'scope' | 'capture' | 'readiness' | 'handoff';

const STEPS: { id: StepId; label: string; icon: typeof Globe; shortLabel: string }[] = [
  { id: 'scope',     label: 'Scope & Modules',   icon: CheckSquare,  shortLabel: 'Scope' },
  { id: 'capture',   label: 'Onboarding Capture', icon: Building2,    shortLabel: 'Capture' },
  { id: 'readiness', label: 'Readiness Check',    icon: ShieldCheck,  shortLabel: 'Readiness' },
  { id: 'handoff',   label: 'Handoff & Provision', icon: Zap,         shortLabel: 'Handoff' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface OnboardingTransitionPanelProps {
  leadId: string;
  orgId: string;
  lead: any;
}

// ─── Sub-component: Step Header ───────────────────────────────────────────────

function StepHeader({
  steps, current, onChange,
}: {
  steps: typeof STEPS;
  current: StepId;
  onChange: (id: StepId) => void;
}) {
  const currentIdx = steps.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-0 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/60 rounded-t-lg overflow-hidden">
      {steps.map((step, idx) => {
        const isActive = step.id === current;
        const isDone = idx < currentIdx;
        const Icon = step.icon;
        return (
          <button
            key={step.id}
            data-testid={`onboarding-step-${step.id}`}
            onClick={() => onChange(step.id)}
            className={[
              'flex-1 flex flex-col items-center gap-1 py-3 px-2 text-xs font-medium transition-all border-b-2',
              isActive
                ? 'border-violet-500 text-violet-700 dark:text-violet-300 bg-white dark:bg-zinc-800'
                : isDone
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-white/60 dark:hover:bg-zinc-800/60 cursor-pointer'
                : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:bg-white/40 dark:hover:bg-zinc-800/40 cursor-pointer',
            ].join(' ')}
          >
            <div className={[
              'w-7 h-7 rounded-full flex items-center justify-center',
              isActive ? 'bg-violet-100 dark:bg-violet-900/50' : isDone ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-zinc-100 dark:bg-zinc-800',
            ].join(' ')}>
              {isDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Icon className={['w-3.5 h-3.5', isActive ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400 dark:text-zinc-500'].join(' ')} />
              )}
            </div>
            <span className="hidden sm:block">{step.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 1: Scope ────────────────────────────────────────────────────────────

function ScopeStep({
  modules, onChange, onSave, isSaving,
}: {
  modules: ModuleSelection[];
  onChange: (updated: ModuleSelection[]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const nowCount = modules.filter(m => m.timing === 'now').length;
  const laterCount = modules.filter(m => m.timing === 'later').length;

  function setTiming(key: ModuleKey, timing: ModuleTiming) {
    onChange(modules.map(m => m.key === key ? { ...m, timing } : m));
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Module Scope Selection</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Define which services are included now, deferred, or not part of this engagement.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        {nowCount > 0 && (
          <Badge className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-medium">
            {nowCount} module{nowCount !== 1 ? 's' : ''} starting now
          </Badge>
        )}
        {laterCount > 0 && (
          <Badge className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-medium">
            {laterCount} deferred
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {MODULE_CATALOGUE.map(def => {
          const selection = modules.find(m => m.key === def.key);
          const timing = selection?.timing || 'not_included';
          const Icon = MODULE_ICON_MAP[def.key] || Globe;
          return (
            <div
              key={def.key}
              data-testid={`module-row-${def.key}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{def.label}</span>
                  {def.isCore && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">Core</Badge>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{def.description}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {TIMING_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    data-testid={`module-${def.key}-timing-${opt.value}`}
                    onClick={() => setTiming(def.key, opt.value)}
                    className={[
                      'px-2 py-1 text-[11px] font-medium rounded border transition-all',
                      timing === opt.value
                        ? `${opt.bg} ${opt.color} font-semibold`
                        : 'bg-transparent text-zinc-400 dark:text-zinc-500 border-transparent hover:border-zinc-200 dark:hover:border-zinc-600',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          data-testid="scope-save-btn"
          onClick={onSave}
          disabled={isSaving || nowCount === 0}
          size="sm"
          className="gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {nowCount === 0 ? 'Select at least one module' : 'Save & Continue'}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Capture ──────────────────────────────────────────────────────────

type CaptureSection = 'contact' | 'business' | 'address' | 'web' | 'services' | 'gbp' | 'branding';

function CaptureStep({
  capture: captureInit, onChange, onSave, isSaving, lead,
}: {
  capture: Partial<OnboardingCapture>;
  onChange: (updated: Partial<OnboardingCapture>) => void;
  onSave: () => void;
  isSaving: boolean;
  lead: any;
}) {
  const [openSection, setOpenSection] = useState<CaptureSection>('contact');
  const [capture, setCapture] = useState<Partial<OnboardingCapture>>(captureInit);
  const [newArea, setNewArea] = useState({ name: '', state: '', postcode: '', priority: 'primary' as const });
  const [newService, setNewService] = useState({ serviceName: '', category: '', isPrimary: false, averageJobValue: '' });

  useEffect(() => { onChange(capture); }, [capture]);

  const upd = (path: string, value: any) => {
    setCapture(prev => {
      const next = { ...prev };
      const parts = path.split('.');
      let cur: any = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = { ...(cur[parts[i]] || {}) };
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  function toggleSection(s: CaptureSection) {
    setOpenSection(prev => prev === s ? 'contact' : s);
  }

  function SectionHeader({ id, label, icon: Icon, isComplete }: { id: CaptureSection; label: string; icon: typeof Globe; isComplete: boolean }) {
    const isOpen = openSection === id;
    return (
      <button
        data-testid={`capture-section-${id}`}
        onClick={() => toggleSection(id)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className={['w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0', isComplete ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-zinc-100 dark:bg-zinc-800'].join(' ')}>
          {isComplete
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            : <Icon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />}
        </div>
        <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
      </button>
    );
  }

  const c = capture;
  const contactComplete = !!(c.contact?.firstName && c.contact?.email && c.contact?.phone);
  const businessComplete = !!(c.business?.tradingName && c.business?.industry);
  const addressComplete = !!(c.address?.suburb && c.address?.state);
  const webComplete = !!(c.web?.currentDomain || c.web?.preferredDomain);
  const servicesComplete = (c.serviceAreas?.length || 0) > 0 && (c.targetServices?.length || 0) > 0;
  const gbpComplete = c.gbp?.hasGbp != null;
  const brandingComplete = c.branding?.hasLogo != null;

  function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-zinc-600 dark:text-zinc-400">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        {children}
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {/* Contact */}
      <div>
        <SectionHeader id="contact" label="Primary Contact" icon={User} isComplete={contactComplete} />
        {openSection === 'contact' && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            <FieldRow label="First Name" required>
              <Input data-testid="input-contact-firstname" value={c.contact?.firstName || ''} onChange={e => upd('contact.firstName', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
            <FieldRow label="Last Name" required>
              <Input data-testid="input-contact-lastname" value={c.contact?.lastName || ''} onChange={e => upd('contact.lastName', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
            <FieldRow label="Role / Title">
              <Input data-testid="input-contact-role" value={c.contact?.role || ''} onChange={e => upd('contact.role', e.target.value)} className="h-8 text-sm" placeholder="e.g. Owner" />
            </FieldRow>
            <FieldRow label="Phone" required>
              <Input data-testid="input-contact-phone" value={c.contact?.phone || ''} onChange={e => upd('contact.phone', e.target.value)} className="h-8 text-sm" placeholder="0400 000 000" />
            </FieldRow>
            <FieldRow label="Email" required>
              <Input data-testid="input-contact-email" type="email" value={c.contact?.email || ''} onChange={e => upd('contact.email', e.target.value)} className="h-8 text-sm col-span-2" />
            </FieldRow>
          </div>
        )}
      </div>

      {/* Business */}
      <div>
        <SectionHeader id="business" label="Business Details" icon={Building2} isComplete={businessComplete} />
        {openSection === 'business' && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            <FieldRow label="Legal Name">
              <Input data-testid="input-business-legalname" value={c.business?.legalName || ''} onChange={e => upd('business.legalName', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
            <FieldRow label="Trading Name" required>
              <Input data-testid="input-business-tradingname" value={c.business?.tradingName || ''} onChange={e => upd('business.tradingName', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
            <FieldRow label="ABN">
              <Input data-testid="input-business-abn" value={c.business?.abn || ''} onChange={e => upd('business.abn', e.target.value)} className="h-8 text-sm" placeholder="00 000 000 000" />
            </FieldRow>
            <FieldRow label="Industry" required>
              <Input data-testid="input-business-industry" value={c.business?.industry || ''} onChange={e => upd('business.industry', e.target.value)} className="h-8 text-sm" placeholder="e.g. Plumbing" />
            </FieldRow>
            <FieldRow label="Business Category">
              <Input data-testid="input-business-category" value={c.business?.businessCategory || ''} onChange={e => upd('business.businessCategory', e.target.value)} className="h-8 text-sm" placeholder="e.g. Trade Services" />
            </FieldRow>
            <FieldRow label="Service Model">
              <select
                data-testid="select-business-servicemodel"
                value={c.business?.serviceModel || 'fixed_location'}
                onChange={e => upd('business.serviceModel', e.target.value)}
                className="w-full h-8 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm px-2"
              >
                <option value="mobile_service">Mobile Service</option>
                <option value="fixed_location">Fixed Location</option>
                <option value="hybrid">Hybrid</option>
                <option value="digital_only">Digital Only</option>
              </select>
            </FieldRow>
            <FieldRow label="Employee Count">
              <select
                data-testid="select-business-employees"
                value={c.business?.employeeCount || ''}
                onChange={e => upd('business.employeeCount', e.target.value)}
                className="w-full h-8 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm px-2"
              >
                <option value="">Select…</option>
                <option value="solo">Solo</option>
                <option value="2-5">2–5</option>
                <option value="6-15">6–15</option>
                <option value="16-50">16–50</option>
                <option value="51+">51+</option>
              </select>
            </FieldRow>
            <FieldRow label="Year Established">
              <Input data-testid="input-business-year" value={c.business?.establishedYear || ''} onChange={e => upd('business.establishedYear', e.target.value)} className="h-8 text-sm" placeholder="e.g. 2012" />
            </FieldRow>
            <FieldRow label="Business Phone">
              <Input data-testid="input-business-phone" value={c.business?.phone || ''} onChange={e => upd('business.phone', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
            <FieldRow label="Business Email">
              <Input data-testid="input-business-email" type="email" value={c.business?.email || ''} onChange={e => upd('business.email', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
          </div>
        )}
      </div>

      {/* Address */}
      <div>
        <SectionHeader id="address" label="Business Address" icon={MapPin} isComplete={addressComplete} />
        {openSection === 'address' && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            <FieldRow label="Street Address">
              <Input data-testid="input-address-street" value={c.address?.street || ''} onChange={e => upd('address.street', e.target.value)} className="h-8 text-sm col-span-2" />
            </FieldRow>
            <FieldRow label="Suburb" required>
              <Input data-testid="input-address-suburb" value={c.address?.suburb || ''} onChange={e => upd('address.suburb', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
            <FieldRow label="State" required>
              <select
                data-testid="select-address-state"
                value={c.address?.state || ''}
                onChange={e => upd('address.state', e.target.value)}
                className="w-full h-8 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm px-2"
              >
                <option value="">Select…</option>
                {['NSW','VIC','QLD','WA','SA','TAS','NT','ACT'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Postcode">
              <Input data-testid="input-address-postcode" value={c.address?.postcode || ''} onChange={e => upd('address.postcode', e.target.value)} className="h-8 text-sm" maxLength={4} />
            </FieldRow>
            <FieldRow label="Country">
              <Input data-testid="input-address-country" value={c.address?.country || 'Australia'} onChange={e => upd('address.country', e.target.value)} className="h-8 text-sm" />
            </FieldRow>
          </div>
        )}
      </div>

      {/* Web Details */}
      <div>
        <SectionHeader id="web" label="Website & Domain" icon={Globe} isComplete={webComplete} />
        {openSection === 'web' && (
          <div className="px-4 pb-4 space-y-3">
            <FieldRow label="Current Domain">
              <Input data-testid="input-web-domain" value={c.web?.currentDomain || ''} onChange={e => upd('web.currentDomain', e.target.value)} className="h-8 text-sm" placeholder="www.example.com.au" />
            </FieldRow>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="check-web-newdomain"
                id="newDomainRequired"
                checked={c.web?.newDomainRequired || false}
                onChange={e => upd('web.newDomainRequired', e.target.checked)}
                className="rounded"
              />
              <label htmlFor="newDomainRequired" className="text-sm text-zinc-700 dark:text-zinc-300">New domain required</label>
            </div>
            {c.web?.newDomainRequired && (
              <FieldRow label="Preferred Domain">
                <Input data-testid="input-web-preferreddomain" value={c.web?.preferredDomain || ''} onChange={e => upd('web.preferredDomain', e.target.value)} className="h-8 text-sm" placeholder="www.businessname.com.au" />
              </FieldRow>
            )}
            <FieldRow label="Hosting Provider">
              <Input data-testid="input-web-hosting" value={c.web?.hostingProvider || ''} onChange={e => upd('web.hostingProvider', e.target.value)} className="h-8 text-sm" placeholder="e.g. Cloudflare, GoDaddy" />
            </FieldRow>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="check-web-hascms"
                id="hasCms"
                checked={c.web?.hasCms || false}
                onChange={e => upd('web.hasCms', e.target.checked)}
                className="rounded"
              />
              <label htmlFor="hasCms" className="text-sm text-zinc-700 dark:text-zinc-300">Has CMS (WordPress, Webflow, etc.)</label>
            </div>
            {c.web?.hasCms && (
              <FieldRow label="CMS Notes">
                <Input data-testid="input-web-cmsnotes" value={c.web?.cmsNotes || ''} onChange={e => upd('web.cmsNotes', e.target.value)} className="h-8 text-sm" placeholder="WordPress 6.x, Divi theme, WooCommerce" />
              </FieldRow>
            )}
          </div>
        )}
      </div>

      {/* Service Areas + Target Services */}
      <div>
        <SectionHeader id="services" label="Service Areas & Target Services" icon={MapPinned} isComplete={servicesComplete} />
        {openSection === 'services' && (
          <div className="px-4 pb-4 space-y-5">
            {/* Service Areas */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Service Areas</Label>
              {(c.serviceAreas || []).map((area, i) => (
                <div key={i} data-testid={`service-area-row-${i}`} className="flex items-center gap-2 p-2 rounded border border-zinc-200 dark:border-zinc-700 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  <span className="flex-1 text-zinc-800 dark:text-zinc-200">{area.name}{area.state ? `, ${area.state}` : ''}{area.postcode ? ` ${area.postcode}` : ''}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{area.priority}</Badge>
                  <button onClick={() => upd('serviceAreas', (c.serviceAreas || []).filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-500 text-xs">✕</button>
                </div>
              ))}
              <div className="grid grid-cols-5 gap-2 pt-1">
                <Input data-testid="input-newarea-name" value={newArea.name} onChange={e => setNewArea(p => ({...p, name: e.target.value}))} placeholder="Suburb name" className="h-8 text-sm col-span-2" />
                <select
                  data-testid="select-newarea-state"
                  value={newArea.state}
                  onChange={e => setNewArea(p => ({...p, state: e.target.value}))}
                  className="h-8 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm px-2"
                >
                  <option value="">State</option>
                  {['NSW','VIC','QLD','WA','SA','TAS','NT','ACT'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <Input data-testid="input-newarea-postcode" value={newArea.postcode} onChange={e => setNewArea(p => ({...p, postcode: e.target.value}))} placeholder="Postcode" className="h-8 text-sm" maxLength={4} />
                <Button
                  data-testid="btn-add-servicearea"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!newArea.name) return;
                    upd('serviceAreas', [...(c.serviceAreas || []), { ...newArea }]);
                    setNewArea({ name: '', state: '', postcode: '', priority: 'primary' });
                  }}
                  className="h-8 text-xs"
                >
                  + Add
                </Button>
              </div>
            </div>

            {/* Target Services */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Target Services</Label>
              {(c.targetServices || []).map((svc, i) => (
                <div key={i} data-testid={`target-service-row-${i}`} className="flex items-center gap-2 p-2 rounded border border-zinc-200 dark:border-zinc-700 text-sm">
                  <Wrench className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  <span className="flex-1 text-zinc-800 dark:text-zinc-200">{svc.serviceName}</span>
                  {svc.isPrimary && <Badge className="text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200">Primary</Badge>}
                  {svc.averageJobValue && <span className="text-xs text-zinc-500">${svc.averageJobValue}</span>}
                  <button onClick={() => upd('targetServices', (c.targetServices || []).filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-500 text-xs">✕</button>
                </div>
              ))}
              <div className="grid grid-cols-5 gap-2 pt-1">
                <Input data-testid="input-newservice-name" value={newService.serviceName} onChange={e => setNewService(p => ({...p, serviceName: e.target.value}))} placeholder="Service name" className="h-8 text-sm col-span-2" />
                <Input data-testid="input-newservice-category" value={newService.category} onChange={e => setNewService(p => ({...p, category: e.target.value}))} placeholder="Category" className="h-8 text-sm" />
                <Input data-testid="input-newservice-jobvalue" value={newService.averageJobValue} onChange={e => setNewService(p => ({...p, averageJobValue: e.target.value}))} placeholder="Avg job $" className="h-8 text-sm" />
                <Button
                  data-testid="btn-add-targetservice"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!newService.serviceName) return;
                    const isPrimary = (c.targetServices || []).length === 0;
                    upd('targetServices', [...(c.targetServices || []), { ...newService, isPrimary }]);
                    setNewService({ serviceName: '', category: '', isPrimary: false, averageJobValue: '' });
                  }}
                  className="h-8 text-xs"
                >
                  + Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GBP */}
      <div>
        <SectionHeader id="gbp" label="Google Business Profile" icon={MapPin} isComplete={gbpComplete} />
        {openSection === 'gbp' && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="check-gbp-hasgbp"
                id="hasGbp"
                checked={c.gbp?.hasGbp ?? true}
                onChange={e => upd('gbp.hasGbp', e.target.checked)}
                className="rounded"
              />
              <label htmlFor="hasGbp" className="text-sm text-zinc-700 dark:text-zinc-300">Has an active Google Business Profile</label>
            </div>
            {(c.gbp?.hasGbp ?? true) && (
              <>
                <FieldRow label="GBP Business Name">
                  <Input data-testid="input-gbp-name" value={c.gbp?.gbpName || ''} onChange={e => upd('gbp.gbpName', e.target.value)} className="h-8 text-sm" />
                </FieldRow>
                <FieldRow label="Primary Category">
                  <Input data-testid="input-gbp-category" value={c.gbp?.gbpCategory || ''} onChange={e => upd('gbp.gbpCategory', e.target.value)} className="h-8 text-sm" placeholder="e.g. Plumber" />
                </FieldRow>
                <FieldRow label="GBP Phone">
                  <Input data-testid="input-gbp-phone" value={c.gbp?.gbpPhone || ''} onChange={e => upd('gbp.gbpPhone', e.target.value)} className="h-8 text-sm" />
                </FieldRow>
              </>
            )}
            <FieldRow label="Notes">
              <Textarea data-testid="input-gbp-notes" value={c.gbp?.gbpNotes || ''} onChange={e => upd('gbp.gbpNotes', e.target.value)} className="text-sm h-16 resize-none" placeholder="Access issues, duplicate listings, etc." />
            </FieldRow>
          </div>
        )}
      </div>

      {/* Branding */}
      <div>
        <SectionHeader id="branding" label="Branding Assets" icon={Sparkles} isComplete={brandingComplete} />
        {openSection === 'branding' && (
          <div className="px-4 pb-4 space-y-3">
            {([
              { id: 'hasLogo',        label: 'Has a logo (vector/high-res preferred)' },
              { id: 'hasBrandColors', label: 'Has defined brand colours' },
              { id: 'hasPhotos',      label: 'Has existing photography or imagery' },
            ] as const).map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  data-testid={`check-branding-${item.id}`}
                  id={item.id}
                  checked={(c.branding as any)?.[item.id] || false}
                  onChange={e => upd(`branding.${item.id}`, e.target.checked)}
                  className="rounded"
                />
                <label htmlFor={item.id} className="text-sm text-zinc-700 dark:text-zinc-300">{item.label}</label>
              </div>
            ))}
            <FieldRow label="Branding Notes">
              <Textarea
                data-testid="input-branding-notes"
                value={c.branding?.brandNotes || ''}
                onChange={e => upd('branding.brandNotes', e.target.value)}
                className="text-sm h-16 resize-none"
                placeholder="Colour codes, font preferences, existing style guidelines, etc."
              />
            </FieldRow>
          </div>
        )}
      </div>

      {/* Handover Notes */}
      <div className="px-4 py-4">
        <FieldRow label="Handover Notes">
          <Textarea
            data-testid="input-handover-notes"
            value={c.handoverNotes || ''}
            onChange={e => setCapture(prev => ({ ...prev, handoverNotes: e.target.value }))}
            className="text-sm h-20 resize-none"
            placeholder="Anything the delivery team needs to know about this client…"
          />
        </FieldRow>
      </div>

      <div className="px-4 pb-4 flex justify-end">
        <Button
          data-testid="capture-save-btn"
          onClick={onSave}
          disabled={isSaving}
          size="sm"
          className="gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save & Continue
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Readiness ────────────────────────────────────────────────────────

function ReadinessStep({
  onboardingState, lead, onRefresh, isRefreshing, onContinue,
}: {
  onboardingState: OnboardingState;
  lead: any;
  onRefresh: () => void;
  isRefreshing: boolean;
  onContinue: () => void;
}) {
  const result = deriveReadiness(lead, onboardingState);

  const scoreColor = result.score >= 80
    ? 'text-emerald-600 dark:text-emerald-400'
    : result.score >= 50
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="p-4 space-y-5">
      {/* Score ring */}
      <div className="flex items-center gap-5 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <div className="flex flex-col items-center">
          <span className={['text-4xl font-bold tabular-nums', scoreColor].join(' ')}>{result.score}</span>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wide mt-0.5">/ 100</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {result.isReady
              ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Ready to provision</span></>
              : <><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{result.blockers.length} blocker{result.blockers.length !== 1 ? 's' : ''} to resolve</span></>
            }
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {result.isReady
              ? 'All required information is in place. You can proceed to provisioning.'
              : 'Complete the required fields in the Capture step to clear blockers.'}
          </p>
        </div>
        <Button
          data-testid="readiness-refresh-btn"
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="gap-1.5"
        >
          <RefreshCw className={['w-3.5 h-3.5', isRefreshing ? 'animate-spin' : ''].join(' ')} />
          Refresh
        </Button>
      </div>

      {/* Blockers */}
      {result.blockers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Critical Blockers</h4>
          {result.blockers.map(b => (
            <div key={b.key} data-testid={`blocker-${b.key}`} className="flex gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">{b.description}</p>
                <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">Fix: {b.fixAction}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Checklist */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Onboarding Checklist</h4>
        {result.checks.map(check => (
          <div key={check.key} data-testid={`readiness-check-${check.key}`} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            {check.passed
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              : check.weight === 'required'
              ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            }
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={['text-sm font-medium', check.passed ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-600 dark:text-zinc-400'].join(' ')}>
                  {check.label}
                </span>
                {check.weight === 'required' && !check.passed && (
                  <Badge variant="outline" className="text-[10px] text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">Required</Badge>
                )}
              </div>
              {!check.passed && check.fixAction && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{check.fixAction}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          data-testid="readiness-continue-btn"
          onClick={onContinue}
          disabled={!result.isReady}
          size="sm"
          className="gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          {result.isReady ? 'Continue to Handoff' : 'Resolve blockers first'}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Handoff ──────────────────────────────────────────────────────────

function HandoffStep({
  onboardingState, lead, orgId, leadId, onAccept,
}: {
  onboardingState: OnboardingState;
  lead: any;
  orgId: string;
  leadId: string;
  onAccept: () => void;
}) {
  const clientId = lead.clientId || onboardingState.provisioning?.tenantId;
  const modules = (onboardingState.selectedModules?.modules || []).filter(m => m.timing === 'now');
  const capture = onboardingState.capture;
  const status = onboardingState.status;

  const isProvisioned = status === 'provisioned';
  const isProvisioning = status === 'provisioning';

  return (
    <div className="p-4 space-y-5">
      {/* Summary card */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Onboarding Summary</h3>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {/* Client */}
          <div className="px-4 py-3 flex items-start gap-3">
            <Building2 className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Business</p>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {capture?.business?.tradingName || lead.businessName || lead.name || '—'}
              </p>
              {capture?.business?.industry && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{capture.business.industry}</p>
              )}
            </div>
          </div>
          {/* Contact */}
          <div className="px-4 py-3 flex items-start gap-3">
            <User className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Primary Contact</p>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {capture?.contact ? `${capture.contact.firstName} ${capture.contact.lastName}`.trim() || '—' : '—'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{capture?.contact?.email || '—'} · {capture?.contact?.phone || '—'}</p>
            </div>
          </div>
          {/* Modules */}
          <div className="px-4 py-3 flex items-start gap-3">
            <Zap className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">Modules Starting Now</p>
              <div className="flex flex-wrap gap-1.5">
                {modules.length > 0 ? modules.map(m => {
                  const Icon = MODULE_ICON_MAP[m.key] || Globe;
                  return (
                    <div key={m.key} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
                      <Icon className="w-3 h-3" />
                      {m.label}
                    </div>
                  );
                }) : <span className="text-xs text-zinc-400">No modules selected</span>}
              </div>
            </div>
          </div>
          {/* Service Areas */}
          {(capture?.serviceAreas?.length || 0) > 0 && (
            <div className="px-4 py-3 flex items-start gap-3">
              <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Service Areas</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {capture!.serviceAreas!.map(a => a.name).join(', ')}
                </p>
              </div>
            </div>
          )}
          {/* Accepted at */}
          {onboardingState.acceptanceEvent?.acceptedAt && (
            <div className="px-4 py-3 flex items-start gap-3">
              <Clock className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Proposal Accepted</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{fmtDate(onboardingState.acceptanceEvent.acceptedAt)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Provision section */}
      {isProvisioned && clientId ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Tenant Provisioned</span>
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
            This client is now active in AI Systems. Manage the provisioned tenant below.
          </p>
          <ProvisioningPanel clientId={clientId} orgId={orgId} clientName={capture?.business?.tradingName || lead.businessName || ''} />
        </div>
      ) : clientId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Client record exists. Use the provisioning panel to create the AI Systems tenant.
            </p>
          </div>
          <ProvisioningPanel clientId={clientId} orgId={orgId} clientName={capture?.business?.tradingName || lead.businessName || ''} />
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Provisioning</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            This lead has not yet been converted to a client. Convert the lead first (mark as Won), then return here to trigger AI Systems provisioning.
          </p>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Convert this lead to a client before provisioning. The onboarding capture data will carry over automatically.
            </p>
          </div>
          <Button
            data-testid="btn-mark-accepted"
            onClick={onAccept}
            size="sm"
            variant="outline"
            className="gap-2 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300"
          >
            <Lock className="w-3.5 h-3.5" />
            Mark Proposal as Accepted
          </Button>
        </div>
      )}

      {/* Audit trail */}
      {(onboardingState.auditTrail || []).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Activity</h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {[...(onboardingState.auditTrail || [])].reverse().map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">{entry.eventType.replace(/_/g, ' ')}</span>
                {entry.detail && <span>— {entry.detail}</span>}
                <span className="ml-auto flex-shrink-0">{fmtDate(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OnboardingTransitionPanel({ leadId, orgId, lead }: OnboardingTransitionPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<StepId>('scope');
  const [modules, setModules] = useState<ModuleSelection[]>(emptyModuleSelections());
  const [capture, setCapture] = useState<Partial<OnboardingCapture>>(emptyCapture());
  const [localState, setLocalState] = useState<OnboardingState | null>(null);

  // ── Remote state ──────────────────────────────────────────────────────────

  const qKey = ['/api/leads', leadId, 'onboarding-state', orgId];

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => apiRequest('GET', `/api/leads/${leadId}/onboarding-state?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!leadId && !!orgId,
  });

  // Sync remote → local when data arrives
  useEffect(() => {
    if (!data) return;
    const os: OnboardingState = data.onboardingState || {};
    setLocalState(os);
    if (os.selectedModules?.modules?.length) {
      // Merge saved timing into local module list
      const saved = os.selectedModules.modules;
      setModules(emptyModuleSelections().map(m => {
        const found = saved.find((s: ModuleSelection) => s.key === m.key);
        return found ? { ...m, timing: found.timing } : m;
      }));
    }
    if (os.capture) {
      setCapture({ ...emptyCapture(), ...os.capture });
    }
  }, [data]);

  const patchMutation = useMutation({
    mutationFn: (payload: { update: Record<string, any>; auditEntry?: any }) =>
      apiRequest('PATCH', `/api/leads/${leadId}/onboarding-state`, { orgId, ...payload }),
    onSuccess: (res) => {
      setLocalState(res.onboardingState);
      qc.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) => toast({ title: 'Save failed', description: err.message, variant: 'destructive' }),
  });

  const acceptMutation = useMutation({
    mutationFn: (payload: any) => apiRequest('POST', `/api/leads/${leadId}/onboarding-state/accept`, { orgId, ...payload }),
    onSuccess: (res) => {
      setLocalState(res.onboardingState);
      qc.invalidateQueries({ queryKey: qKey });
      toast({ title: 'Proposal accepted', description: 'Status updated to Proposal Accepted.' });
    },
    onError: (err: Error) => toast({ title: 'Accept failed', description: err.message, variant: 'destructive' }),
  });

  // ── Save handlers ─────────────────────────────────────────────────────────

  const saveScope = useCallback(async () => {
    const nowCount = modules.filter(m => m.timing === 'now').length;
    if (nowCount === 0) { toast({ title: 'Select at least one module', variant: 'destructive' }); return; }
    await patchMutation.mutateAsync({
      update: {
        status: 'onboarding_in_progress',
        selectedModules: {
          modules,
          selectedAt: new Date().toISOString(),
          selectedBy: user?.uid || '',
        },
      },
      auditEntry: { eventType: 'scope_updated', performedBy: user?.uid || '', detail: `${nowCount} modules set to Now` },
    });
    toast({ title: 'Scope saved', description: `${nowCount} module${nowCount !== 1 ? 's' : ''} selected.` });
    setStep('capture');
  }, [modules, user]);

  const saveCapture = useCallback(async () => {
    await patchMutation.mutateAsync({
      update: { capture: { ...capture, capturedAt: new Date().toISOString(), capturedBy: user?.uid || '' } },
      auditEntry: { eventType: 'capture_updated', performedBy: user?.uid || '', detail: 'Onboarding capture form saved.' },
    });
    toast({ title: 'Capture saved' });
    setStep('readiness');
  }, [capture, user]);

  const handleAccept = useCallback(async () => {
    await acceptMutation.mutateAsync({
      acceptanceEvent: {
        acceptedByName: user?.displayName || user?.email || '',
        strategyReportId: lead.strategyReportId || '',
        strategyReportSlug: lead.strategyReportSlug || '',
        acceptedModules: modules.filter(m => m.timing === 'now').map(m => m.key),
        channel: 'internal',
      },
      selectedModules: { modules, selectedAt: new Date().toISOString(), selectedBy: user?.uid || '' },
    });
  }, [modules, user, lead]);

  // ── Derive effective onboarding state ─────────────────────────────────────

  const os = localState || {};
  const status: ProposalStatus = (os as OnboardingState).status || 'proposal_pending';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.proposal_pending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="onboarding-transition-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Onboarding Transition</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Proposal → Capture → Provision</p>
        </div>
        <div className={['flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', statusCfg.bg, statusCfg.color].join(' ')} data-testid="onboarding-status-badge">
          <span>{statusCfg.label}</span>
        </div>
      </div>

      {/* Step tabs */}
      <StepHeader steps={STEPS} current={step} onChange={setStep} />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        {step === 'scope' && (
          <ScopeStep
            modules={modules}
            onChange={setModules}
            onSave={saveScope}
            isSaving={patchMutation.isPending}
          />
        )}
        {step === 'capture' && (
          <CaptureStep
            capture={capture}
            onChange={setCapture}
            onSave={saveCapture}
            isSaving={patchMutation.isPending}
            lead={lead}
          />
        )}
        {step === 'readiness' && (
          <ReadinessStep
            onboardingState={os as OnboardingState}
            lead={lead}
            onRefresh={() => qc.invalidateQueries({ queryKey: qKey })}
            isRefreshing={false}
            onContinue={() => setStep('handoff')}
          />
        )}
        {step === 'handoff' && (
          <HandoffStep
            onboardingState={os as OnboardingState}
            lead={lead}
            orgId={orgId}
            leadId={leadId}
            onAccept={handleAccept}
          />
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/60">
        <Button
          data-testid="btn-prev-step"
          variant="ghost"
          size="sm"
          onClick={() => {
            const idx = STEPS.findIndex(s => s.id === step);
            if (idx > 0) setStep(STEPS[idx - 1].id);
          }}
          disabled={step === 'scope'}
          className="gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Button>
        <span className="text-xs text-zinc-400">
          Step {STEPS.findIndex(s => s.id === step) + 1} of {STEPS.length}
        </span>
        <Button
          data-testid="btn-next-step"
          variant="ghost"
          size="sm"
          onClick={() => {
            const idx = STEPS.findIndex(s => s.id === step);
            if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
          }}
          disabled={step === 'handoff'}
          className="gap-1.5"
        >
          Next
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

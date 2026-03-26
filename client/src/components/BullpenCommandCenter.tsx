import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db, collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, Timestamp } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { format, formatDistanceToNow } from 'date-fns';
import {
  MessageSquare, Plus, Send, Mic, MicOff, ImagePlus, Video, X, ChevronRight,
  Loader2, AlertTriangle, CheckCircle2, Clock, Zap, Shield, Bug, Layout,
  Code2, Wrench, Globe, Search, BarChart3, Star, Users, Settings2, Bot,
  FileQuestion, Maximize2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ThreadCategory = 'review' | 'build' | 'bug' | 'architecture' | 'ux' | 'trust' | 'other';
type ThreadStatus = 'open' | 'in-progress' | 'in-review' | 'shipped' | 'blocked';
type ThreadPriority = 'low' | 'medium' | 'high' | 'critical';

interface BullpenThread {
  id: string;
  title: string;
  category: ThreadCategory;
  route: string;
  priority: ThreadPriority;
  status: ThreadStatus;
  owner: string;
  supporting: string[];
  createdAt: Date;
  updatedAt: Date;
  lastMessage: string;
  messageCount: number;
  createdBy: string;
}

interface BullpenAttachment {
  type: 'screenshot' | 'video';
  url: string;
  name: string;
  storagePath: string;
}

interface BullpenSynthesis {
  diagnosis: string;
  owner: string;
  supporting: string[];
  action: string;
  implementationLogic: string;
  risks: string;
  status: string;
  routingRationale: string;
  // Two-stage dispatch proof
  dispatchedTo?: string | null;  // name of specialist actually invoked (null = direct answer)
  isDirectAnswer?: boolean;
}

interface BullpenMessage {
  id: string;
  role: 'user' | 'bullpen';
  text: string;
  transcript?: string;
  attachments?: BullpenAttachment[];
  synthesis?: BullpenSynthesis;
  createdAt: Date;
}

interface ComposerFile {
  file: File;
  type: 'screenshot' | 'video';
  previewUrl: string;
  base64?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<ThreadCategory, { label: string; color: string; icon: typeof Bug }> = {
  review:       { label: 'Review',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         icon: CheckCircle2 },
  build:        { label: 'Build',        color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',  icon: Wrench },
  bug:          { label: 'Bug',          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',              icon: Bug },
  architecture: { label: 'Architecture', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',  icon: Code2 },
  ux:           { label: 'UX',           color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',          icon: Layout },
  trust:        { label: 'Trust/Safety', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',      icon: Shield },
  other:        { label: 'Other',        color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',      icon: FileQuestion },
};

const STATUS_META: Record<ThreadStatus, { label: string; color: string }> = {
  'open':       { label: 'Open',       color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  'in-progress':{ label: 'In Progress',color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  'in-review':  { label: 'In Review',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  'shipped':    { label: 'Shipped',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  'blocked':    { label: 'Blocked',    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const PRIORITY_META: Record<ThreadPriority, { label: string; color: string }> = {
  low:      { label: 'Low',      color: 'text-slate-400' },
  medium:   { label: 'Medium',   color: 'text-amber-500' },
  high:     { label: 'High',     color: 'text-orange-500' },
  critical: { label: 'Critical', color: 'text-red-500' },
};

const SPECIALIST_ICONS: Record<string, typeof Bot> = {
  'Frontend Developer':          Layout,
  'Backend Engineer':            Code2,
  'SEO Specialist':              Search,
  'Website Specialist':          Globe,
  'Ads Specialist':              BarChart3,
  'GBP Specialist':              Star,
  'Client Growth Specialist':    Zap,
  'Review & Reputation Manager': CheckCircle2,
  'Strategy Advisor':            Wrench,
  'Operations Manager':          Settings2,
  'QA Engineer':                 Shield,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: ThreadCategory }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ThreadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function SpecialistChip({ name, primary }: { name: string; primary?: boolean }) {
  const Icon = SPECIALIST_ICONS[name] || Bot;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
      primary
        ? 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800'
        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
    }`}>
      <Icon className="h-3 w-3" />
      {name}
      {primary && <span className="text-violet-500 font-bold">·owner</span>}
    </span>
  );
}

function ThreadCard({ thread, selected, onClick }: { thread: BullpenThread; selected: boolean; onClick: () => void }) {
  const catMeta = CATEGORY_META[thread.category];
  const CatIcon = catMeta.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`thread-card-${thread.id}`}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        selected
          ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30'
          : 'border-border hover:border-violet-200 dark:hover:border-violet-800 hover:bg-muted/40'
      }`}
    >
      <div className="flex items-start gap-2">
        <CatIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${selected ? 'text-violet-500' : 'text-muted-foreground'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold truncate ${selected ? 'text-violet-700 dark:text-violet-400' : ''}`}>
            {thread.title}
          </p>
          {thread.route && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{thread.route}</p>
          )}
          {thread.lastMessage && (
            <p className="text-[10px] text-muted-foreground truncate mt-1 italic">{thread.lastMessage}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <StatusBadge status={thread.status} />
            {thread.messageCount > 0 && (
              <span className="text-[10px] text-muted-foreground">{thread.messageCount} msg{thread.messageCount !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
        {formatDistanceToNow(thread.updatedAt, { addSuffix: true })}
      </p>
    </div>
  );
}

function UserMessage({ msg, onExpandImage }: { msg: BullpenMessage; onExpandImage: (url: string) => void }) {
  const screenshots = msg.attachments?.filter(a => a.type === 'screenshot') ?? [];
  const videos = msg.attachments?.filter(a => a.type === 'video') ?? [];
  return (
    <div className="flex flex-col items-end gap-1 mb-4">
      <div className="max-w-[80%] flex flex-col gap-2">
        {screenshots.map((att, i) => (
          <div key={i} className="relative group cursor-pointer" onClick={() => onExpandImage(att.url)} data-testid={`screenshot-${i}`}>
            <img src={att.url} alt={att.name} className="rounded-lg max-h-48 object-contain border border-border" />
            <div className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
              <Maximize2 className="h-5 w-5 text-white" />
            </div>
          </div>
        ))}
        {videos.map((att, i) => (
          <video key={i} src={att.url} controls className="rounded-lg max-h-48 border border-border" data-testid={`video-${i}`} />
        ))}
        {msg.text && (
          <div className="bg-violet-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed">
            {msg.transcript && (
              <p className="text-[10px] text-violet-200 mb-1 italic">🎤 Dictated</p>
            )}
            {msg.text}
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">{format(msg.createdAt, 'HH:mm dd/MM/yyyy')}</p>
    </div>
  );
}

function BullpenResponse({ msg }: { msg: BullpenMessage }) {
  const s = msg.synthesis;
  if (!s) return (
    <div className="flex flex-col items-start gap-1 mb-4">
      <div className="max-w-[85%] bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm">{msg.text}</div>
      <p className="text-[10px] text-muted-foreground">{format(msg.createdAt, 'HH:mm dd/MM/yyyy')}</p>
    </div>
  );

  // Direct answer: simple card, no routing section
  if (s.isDirectAnswer) {
    return (
      <div className="flex flex-col items-start gap-1 mb-4 w-full">
        <div className="w-full max-w-[92%] rounded-2xl rounded-tl-sm border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-violet-100 dark:border-violet-900 flex items-center gap-2">
            <Bot className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">Bullpen</span>
            <span className="ml-auto text-[10px] text-muted-foreground">Direct answer</span>
          </div>
          <div className="p-4 space-y-2">
            {s.diagnosis && <p className="text-sm text-muted-foreground leading-relaxed">{s.diagnosis}</p>}
            <p className="text-sm text-foreground leading-relaxed font-medium">{s.action}</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">{format(msg.createdAt, 'HH:mm dd/MM/yyyy')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 mb-4 w-full">
      <div className="w-full max-w-[92%] rounded-2xl rounded-tl-sm border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-violet-100 dark:border-violet-900 flex items-center gap-2 flex-wrap">
          <Bot className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">Bullpen</span>
          {/* Dispatch proof badge — shows the specialist was genuinely invoked */}
          {s.dispatchedTo && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-[10px] font-medium text-violet-700 dark:text-violet-300">
              <span className="opacity-60">dispatched →</span> {s.dispatchedTo}
            </span>
          )}
          <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_META[s.status as ThreadStatus]?.color ?? 'bg-slate-100 text-slate-600'}`}>
            {s.status}
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* Diagnosis */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-500 mb-1">Diagnosis</p>
            <p className="text-sm text-foreground leading-relaxed">{s.diagnosis}</p>
          </div>

          {/* Workforce routing */}
          {(s.owner || (s.supporting?.length ?? 0) > 0) && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                {s.owner && <SpecialistChip name={s.owner} primary />}
                {s.supporting?.map(r => <SpecialistChip key={r} name={r} />)}
              </div>
              {s.routingRationale && (
                <p className="text-[10px] text-muted-foreground italic">{s.routingRationale}</p>
              )}
            </div>
          )}

          <Separator />

          {/* Action */}
          {s.action && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-500 mb-1">Next Action</p>
              <p className="text-sm font-medium text-foreground">{s.action}</p>
            </div>
          )}

          {/* Implementation logic */}
          {s.implementationLogic && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-500 mb-1">
                {s.dispatchedTo ? `${s.dispatchedTo} Analysis` : 'Implementation Logic'}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.implementationLogic}</p>
            </div>
          )}

          {/* Risks */}
          {s.risks && s.risks !== 'No significant risks.' && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">{s.risks}</p>
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{format(msg.createdAt, 'HH:mm dd/MM/yyyy')}</p>
    </div>
  );
}

function SynthesizingIndicator() {
  return (
    <div className="flex items-start gap-2 mb-4">
      <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
        <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
        <span className="text-sm text-violet-600 dark:text-violet-400">Bullpen is analysing…</span>
      </div>
    </div>
  );
}

// ─── New Thread Dialog ────────────────────────────────────────────────────────

interface NewThreadForm {
  title: string;
  category: ThreadCategory;
  route: string;
  priority: ThreadPriority;
}

function NewThreadDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (form: NewThreadForm) => Promise<void>;
}) {
  const [form, setForm] = useState<NewThreadForm>({ title: '', category: 'review', route: '', priority: 'medium' });
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      await onCreate(form);
      setForm({ title: '', category: 'review', route: '', priority: 'medium' });
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-violet-500" />
            New Bullpen Thread
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="thread-title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="thread-title"
              data-testid="input-thread-title"
              placeholder="e.g. Client Focus View — right panel too heavy"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as ThreadCategory }))}>
                <SelectTrigger data-testid="select-thread-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="build">Build Request</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="architecture">Architecture</SelectItem>
                  <SelectItem value="ux">UX</SelectItem>
                  <SelectItem value="trust">Trust / Safety</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as ThreadPriority }))}>
                <SelectTrigger data-testid="select-thread-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="thread-route">Route / Page <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="thread-route"
              data-testid="input-thread-route"
              placeholder="e.g. /clients → ClientFocusView"
              value={form.route}
              onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !form.title.trim()}
            data-testid="button-create-thread"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create Thread
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      onClick={onClose}
      data-testid="image-lightbox"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-violet-300"
        data-testid="button-close-lightbox"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={url}
        alt="Expanded screenshot"
        className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BullpenCommandCenter() {
  const { orgId, user } = useAuth();
  const { toast } = useToast();

  const [threads, setThreads] = useState<BullpenThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BullpenMessage[]>([]);
  const [showNewThread, setShowNewThread] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);

  // Composer state
  const [composerText, setComposerText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<ComposerFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

  // ── Load threads ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const q = query(
      collection(db, 'orgs', orgId, 'bullpenThreads'),
      orderBy('updatedAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      const items: BullpenThread[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? 'Untitled',
          category: data.category ?? 'other',
          route: data.route ?? '',
          priority: data.priority ?? 'medium',
          status: data.status ?? 'open',
          owner: data.owner ?? '',
          supporting: data.supporting ?? [],
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
          lastMessage: data.lastMessage ?? '',
          messageCount: data.messageCount ?? 0,
          createdBy: data.createdBy ?? '',
        };
      });
      setThreads(items);
    }, err => {
      const isPermissionDenied = err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions');
      if (!isPermissionDenied) {
        console.error('[BullpenCC] threads load error:', err);
      }
    });
    return () => unsub();
  }, [orgId]);

  // ── Load messages for active thread ────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !activeThreadId) { setMessages([]); return; }
    const q = query(
      collection(db, 'orgs', orgId, 'bullpenThreads', activeThreadId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      const items: BullpenMessage[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          role: data.role ?? 'user',
          text: data.text ?? '',
          transcript: data.transcript,
          attachments: data.attachments ?? [],
          synthesis: data.synthesis,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
        };
      });
      setMessages(items);
    }, err => {
      console.error('[BullpenCC] messages load error:', err);
    });
    return () => unsub();
  }, [orgId, activeThreadId]);

  // ── Auto-scroll messages ────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, synthesizing]);

  // ── Create thread ───────────────────────────────────────────────────────────
  async function createThread(form: { title: string; category: ThreadCategory; route: string; priority: ThreadPriority }) {
    if (!orgId || !user) return;
    const now = Timestamp.now();
    const ref = await addDoc(collection(db, 'orgs', orgId, 'bullpenThreads'), {
      title: form.title,
      category: form.category,
      route: form.route,
      priority: form.priority,
      status: 'open',
      owner: '',
      supporting: [],
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
      messageCount: 0,
      createdBy: user.uid,
    });
    setActiveThreadId(ref.id);
    toast({ title: 'Thread created', description: form.title });
  }

  // ── File selection ──────────────────────────────────────────────────────────
  function handleFileSelect(files: FileList | null, type: 'screenshot' | 'video') {
    if (!files || files.length === 0) return;
    const maxSize = type === 'screenshot' ? 5 * 1024 * 1024 : 50 * 1024 * 1024;
    const file = files[0];
    if (file.size > maxSize) {
      toast({ title: 'File too large', description: `${type === 'screenshot' ? 'Screenshots' : 'Videos'} must be under ${type === 'screenshot' ? '5MB' : '50MB'}.`, variant: 'destructive' });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (type === 'screenshot') {
      const reader = new FileReader();
      reader.onload = () => {
        setPendingFiles(prev => [...prev, { file, type, previewUrl, base64: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    } else {
      setPendingFiles(prev => [...prev, { file, type, previewUrl }]);
    }
  }

  // ── Upload file to server ───────────────────────────────────────────────────
  async function uploadFile(pf: ComposerFile, threadId: string): Promise<BullpenAttachment> {
    const formData = new FormData();
    formData.append('file', pf.file);
    formData.append('orgId', orgId!);
    formData.append('threadId', threadId);
    formData.append('fileType', pf.type);

    const res = await fetch('/api/bullpen/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return { type: pf.type, url: data.url, name: data.name, storagePath: data.storagePath };
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!orgId || !activeThreadId || (!composerText.trim() && pendingFiles.length === 0)) return;
    setIsSending(true);
    try {
      // 1. Upload files
      const attachments: BullpenAttachment[] = [];
      for (const pf of pendingFiles) {
        try {
          const att = await uploadFile(pf, activeThreadId);
          attachments.push(att);
        } catch (e) {
          toast({ title: 'Upload failed', description: `Could not upload ${pf.file.name}`, variant: 'destructive' });
        }
      }

      const messageText = composerText.trim();

      // 2. Write user message to Firestore
      const now = Timestamp.now();
      await addDoc(
        collection(db, 'orgs', orgId, 'bullpenThreads', activeThreadId, 'messages'),
        {
          role: 'user',
          text: messageText,
          attachments,
          createdAt: now,
        }
      );

      // 3. Update thread metadata
      const threadRef = doc(db, 'orgs', orgId, 'bullpenThreads', activeThreadId);
      await updateDoc(threadRef, {
        lastMessage: messageText.slice(0, 100) || (attachments.length > 0 ? `[${attachments[0].type}]` : ''),
        updatedAt: now,
        messageCount: (activeThread?.messageCount ?? 0) + 1,
      });

      // Clear composer
      setComposerText('');
      setPendingFiles([]);
      pendingFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl));

      if (!messageText && attachments.length === 0) { setIsSending(false); return; }

      // 4. Call Bullpen synthesize
      setSynthesizing(true);
      const firstScreenshot = pendingFiles.find(pf => pf.type === 'screenshot');
      const synthesizeBody = {
        orgId,
        threadContext: {
          title: activeThread?.title ?? '',
          category: activeThread?.category ?? 'review',
          route: activeThread?.route ?? '',
          priority: activeThread?.priority ?? 'medium',
        },
        message: messageText || `[${attachments.length} file(s) attached]`,
        ...(firstScreenshot?.base64 ? { imageBase64: firstScreenshot.base64 } : {}),
      };

      const synthRes = await fetch('/api/bullpen/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(synthesizeBody),
      });

      if (!synthRes.ok) throw new Error('Synthesis failed');
      const synthesis: BullpenSynthesis = await synthRes.json();

      // 5. Write Bullpen response message
      const bullpenNow = Timestamp.now();
      await addDoc(
        collection(db, 'orgs', orgId, 'bullpenThreads', activeThreadId, 'messages'),
        {
          role: 'bullpen',
          text: synthesis.diagnosis ?? '',
          synthesis,
          createdAt: bullpenNow,
        }
      );

      // 6. Update thread with owner/supporting/status from synthesis
      await updateDoc(threadRef, {
        owner: synthesis.owner ?? activeThread?.owner ?? '',
        supporting: synthesis.supporting ?? activeThread?.supporting ?? [],
        status: (synthesis.status as ThreadStatus) ?? activeThread?.status ?? 'open',
        lastMessage: `Bullpen: ${synthesis.action?.slice(0, 80) ?? 'Response received'}`,
        updatedAt: bullpenNow,
        messageCount: (activeThread?.messageCount ?? 0) + 2,
      });

    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
      setSynthesizing(false);
    }
  }, [orgId, activeThreadId, composerText, pendingFiles, activeThread]);

  // ── Dictation ───────────────────────────────────────────────────────────────
  function toggleDictation() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Dictation not supported', description: 'Use Chrome or Edge for voice input.' });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-AU';
    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setComposerText(prev => prev ? `${prev} ${text}` : text);
    };
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
    toast({ title: 'Dictation active', description: 'Speak your feedback. Click the mic again to stop.' });
  }

  // ── Keyboard shortcut ───────────────────────────────────────────────────────
  function handleComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Section header */}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-violet-500" />
        Command Center
      </h2>

      <div className="flex gap-0 h-[700px] rounded-xl border border-border overflow-hidden bg-background">

        {/* ── Thread list sidebar ──────────────────────────────────────────── */}
        <div className="w-64 shrink-0 flex flex-col border-r border-border">
          <div className="p-3 border-b border-border">
            <Button
              size="sm"
              className="w-full gap-2"
              onClick={() => setShowNewThread(true)}
              data-testid="button-new-thread"
            >
              <Plus className="h-3.5 w-3.5" />
              New Thread
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {threads.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No threads yet. Create one to start a command session.</p>
              </div>
            )}
            {threads.map(thread => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                selected={thread.id === activeThreadId}
                onClick={() => setActiveThreadId(thread.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Thread workspace ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!activeThread ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <div className="h-14 w-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Bot className="h-7 w-7 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Bullpen Command Center</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Select a thread or create a new one. Share screenshots, record video, dictate feedback — Bullpen diagnoses and routes it.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 mt-2"
                onClick={() => setShowNewThread(true)}
                data-testid="button-new-thread-empty"
              >
                <Plus className="h-3.5 w-3.5" />
                New Thread
              </Button>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 min-h-[56px]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CategoryBadge category={activeThread.category} />
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <p className="text-sm font-semibold truncate">{activeThread.title}</p>
                    {activeThread.priority !== 'low' && activeThread.priority !== 'medium' && (
                      <span className={`text-[10px] font-bold uppercase ${PRIORITY_META[activeThread.priority].color}`}>
                        {PRIORITY_META[activeThread.priority].label}
                      </span>
                    )}
                  </div>
                  {activeThread.route && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{activeThread.route}</p>
                  )}
                </div>
                <StatusBadge status={activeThread.status} />
              </div>

              {/* Workforce strip */}
              {(activeThread.owner || activeThread.supporting.length > 0) && (
                <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Workforce</span>
                  {activeThread.owner && <SpecialistChip name={activeThread.owner} primary />}
                  {activeThread.supporting.map(r => <SpecialistChip key={r} name={r} />)}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                    <p className="text-xs text-muted-foreground">No messages yet. Describe what you need — type, dictate, or attach media.</p>
                  </div>
                )}
                {messages.map(msg =>
                  msg.role === 'user'
                    ? <UserMessage key={msg.id} msg={msg} onExpandImage={setExpandedImage} />
                    : <BullpenResponse key={msg.id} msg={msg} />
                )}
                {synthesizing && <SynthesizingIndicator />}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-border p-3 space-y-2">
                {/* Pending files */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingFiles.map((pf, i) => (
                      <div key={i} className="relative group" data-testid={`pending-file-${i}`}>
                        {pf.type === 'screenshot' ? (
                          <img src={pf.previewUrl} alt={pf.file.name} className="h-16 w-16 object-cover rounded-lg border border-border" />
                        ) : (
                          <div className="h-16 w-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-1">
                            <Video className="h-5 w-5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground truncate w-12 text-center">{pf.file.name}</span>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            URL.revokeObjectURL(pf.previewUrl);
                            setPendingFiles(prev => prev.filter((_, j) => j !== i));
                          }}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-remove-file-${i}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Textarea
                  data-testid="textarea-composer"
                  placeholder="Describe what you're seeing, what feels wrong, or what you need built… (Cmd+Enter to send)"
                  value={composerText}
                  onChange={e => setComposerText(e.target.value)}
                  onKeyDown={handleComposerKey}
                  className="min-h-[80px] resize-none text-sm"
                  disabled={isSending}
                />

                <div className="flex items-center gap-2">
                  {/* Hidden file inputs */}
                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={e => handleFileSelect(e.target.files, 'screenshot')}
                    data-testid="input-screenshot-upload"
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={e => handleFileSelect(e.target.files, 'video')}
                    data-testid="input-video-upload"
                  />

                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => screenshotInputRef.current?.click()}
                    disabled={isSending}
                    title="Attach screenshot"
                    data-testid="button-attach-screenshot"
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-xs">Screenshot</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={isSending}
                    title="Attach video"
                    data-testid="button-attach-video"
                  >
                    <Video className="h-4 w-4" />
                    <span className="text-xs">Video</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className={`gap-1.5 ${isRecording ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={toggleDictation}
                    disabled={isSending}
                    title={isRecording ? 'Stop dictation' : 'Start dictation'}
                    data-testid="button-dictation"
                  >
                    {isRecording ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
                    <span className="text-xs">{isRecording ? 'Stop' : 'Dictate'}</span>
                  </Button>

                  <div className="flex-1" />

                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={sendMessage}
                    disabled={isSending || synthesizing || (!composerText.trim() && pendingFiles.length === 0)}
                    data-testid="button-send-message"
                  >
                    {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {isSending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New thread dialog */}
      <NewThreadDialog open={showNewThread} onClose={() => setShowNewThread(false)} onCreate={createThread} />

      {/* Image lightbox */}
      {expandedImage && <ImageLightbox url={expandedImage} onClose={() => setExpandedImage(null)} />}
    </div>
  );
}

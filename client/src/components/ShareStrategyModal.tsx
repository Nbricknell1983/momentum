import { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, ExternalLink, RotateCcw, Sparkles, Loader2, Mail, Link2, Edit3, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';

interface ShareStrategyModalProps {
  reportId: string;
  publicSlug: string;
  orgId: string;
  businessName: string;
  industry?: string;
  location?: string;
  website?: string;
  strategyDiagnosis?: any;
  strategy?: any;
  conversationNotes?: string;
  servicesDiscussed?: string;
  painPoints?: string;
  onClose: () => void;
}

function useCopy(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), timeout);
  };
  return { copied, copy };
}

export default function ShareStrategyModal({
  reportId,
  publicSlug: initialSlug,
  orgId,
  businessName,
  industry,
  location,
  website,
  strategyDiagnosis,
  strategy,
  conversationNotes,
  servicesDiscussed,
  painPoints,
  onClose,
}: ShareStrategyModalProps) {
  const { toast } = useToast();
  const [slug, setSlug] = useState(initialSlug || '');
  const [slugInput, setSlugInput] = useState(initialSlug || '');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'saving'>('idle');
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const slugCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const strategyUrl = `${window.location.origin}/strategy/${slug || reportId}`;
  const idUrl = `${window.location.origin}/strategy/${reportId}`;

  const linkCopy = useCopy();
  const subjectCopy = useCopy();
  const bodyCopy = useCopy();
  const fullCopy = useCopy();

  const [email, setEmail] = useState<{ subject: string; firstName: string; body: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedBody, setEditedBody] = useState('');
  const [editedSubject, setEditedSubject] = useState('');

  const displayUrl = slug ? strategyUrl : idUrl;

  // Auto-generate email on mount
  useEffect(() => {
    generateEmail();
  }, []);

  const generateEmail = async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res = await fetch('/api/ai/strategy-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          industry,
          location,
          website,
          repName: auth.currentUser?.displayName || '',
          repEmail: auth.currentUser?.email || '',
          strategyDiagnosis,
          strategy,
          conversationNotes,
          servicesDiscussed,
          painPoints,
          strategyUrl: displayUrl,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setEmail(data);
      setEditedBody(data.body || '');
      setEditedSubject(data.subject || '');
    } catch {
      setEmailError('Could not generate email. Check your connection and try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const checkSlug = async (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!clean || clean === slug) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    try {
      const res = await fetch(`/api/strategy-reports/check-slug?slug=${encodeURIComponent(clean)}&orgId=${encodeURIComponent(orgId)}&excludeId=${reportId}`);
      const data = await res.json();
      setSlugStatus(data.available ? 'available' : 'taken');
    } catch {
      setSlugStatus('idle');
    }
  };

  const handleSlugInput = (val: string) => {
    setSlugInput(val);
    setSlugStatus('idle');
    if (slugCheckRef.current) clearTimeout(slugCheckRef.current);
    slugCheckRef.current = setTimeout(() => checkSlug(val), 600);
  };

  const saveSlug = async () => {
    const clean = slugInput.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!clean || slugStatus === 'taken') return;
    setSlugStatus('saving');
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/strategy-reports/${reportId}/slug`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug: clean }),
      });
      if (!res.ok) throw new Error('Failed');
      const { publicSlug: newSlug } = await res.json();
      setSlug(newSlug);
      setSlugInput(newSlug);
      setSlugStatus('idle');
      setIsEditingSlug(false);
      toast({ title: 'Link updated', description: `New URL: ${window.location.origin}/strategy/${newSlug}` });
    } catch {
      toast({ title: 'Failed to update link', variant: 'destructive' });
      setSlugStatus('idle');
    }
  };

  const regenerateSlug = async () => {
    const words = ['digital', 'growth', 'visibility', 'strategy', 'blueprint', 'roadmap', 'opportunity'];
    const rand = words[Math.floor(Math.random() * words.length)];
    const base = (businessName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-') || 'business') + `-${rand}-plan`;
    setSlugInput(base);
    handleSlugInput(base);
  };

  const activeBody = isEditingEmail ? editedBody : (email?.body || '');
  const activeSubject = isEditingEmail ? editedSubject : (email?.subject || '');
  const fullEmail = `Subject: ${activeSubject}\n\n${activeBody}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <Link2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Share Growth Strategy</p>
              <p className="text-[11px] text-muted-foreground">{businessName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0" data-testid="button-close-share-modal">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* ── Section 1: Public Link ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Link2 className="h-3 w-3" /> Public Link
            </p>

            {/* Slug editor */}
            {isEditingSlug ? (
              <div className="space-y-2">
                <Label className="text-xs">Custom URL slug</Label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={slugInput}
                      onChange={e => handleSlugInput(e.target.value)}
                      placeholder="your-business-growth-plan"
                      className="h-8 text-sm pr-8"
                      data-testid="input-slug"
                      autoFocus
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {slugStatus === 'checking' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      {slugStatus === 'available' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {slugStatus === 'taken' && <AlertCircle className="h-3 w-3 text-red-500" />}
                    </div>
                  </div>
                  <Button size="sm" onClick={regenerateSlug} variant="outline" className="h-8 px-2" title="Regenerate slug" data-testid="button-regenerate-slug">
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
                {slugStatus === 'taken' && <p className="text-[11px] text-red-600">This slug is already taken — try a different one.</p>}
                {slugStatus === 'available' && <p className="text-[11px] text-green-600">Available!</p>}
                <p className="text-[10px] text-muted-foreground">Preview: <span className="font-mono">{window.location.origin}/strategy/{slugInput.toLowerCase().replace(/[^a-z0-9-]/g, '') || '...'}</span></p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveSlug} disabled={slugStatus === 'taken' || slugStatus === 'saving' || slugStatus === 'checking' || !slugInput} className="h-7 text-xs gap-1" data-testid="button-save-slug">
                    {slugStatus === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsEditingSlug(false); setSlugInput(slug); setSlugStatus('idle'); }} className="h-7 text-xs">Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2.5 rounded-xl border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-mono truncate text-foreground">{displayUrl}</p>
                    {slug && <p className="text-[10px] text-muted-foreground mt-0.5">Fallback ID link also works: /strategy/{reportId}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditingSlug(true)} className="h-7 px-2 shrink-0" title="Edit slug" data-testid="button-edit-slug">
                    <Edit3 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => linkCopy.copy(displayUrl)} className="h-7 text-xs gap-1.5 flex-1 bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-copy-link">
                    {linkCopy.copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {linkCopy.copied ? 'Copied!' : 'Copy Link'}
                  </Button>
                  <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 w-full" data-testid="button-open-link">
                      <ExternalLink className="h-3 w-3" /> Open
                    </Button>
                  </a>
                  <Button size="sm" variant="outline" onClick={() => setIsEditingSlug(true)} className="h-7 px-2" title="Edit URL" data-testid="button-edit-url">
                    <Edit3 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* ── Section 2: AI Follow-Up Email ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Follow-Up Email
              </p>
              <Button size="sm" variant="ghost" onClick={generateEmail} disabled={emailLoading} className="h-6 text-[10px] gap-1 px-2" data-testid="button-regenerate-email">
                {emailLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {emailLoading ? 'Generating…' : 'Regenerate'}
              </Button>
            </div>

            {emailLoading && (
              <div className="rounded-xl border bg-muted/20 p-6 flex flex-col items-center gap-2 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                <p className="text-xs text-muted-foreground">Writing a personalised follow-up…</p>
              </div>
            )}

            {emailError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" /> {emailError}
              </div>
            )}

            {!emailLoading && email && (
              <div className="space-y-2">
                {/* Subject */}
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Subject</p>
                  {isEditingEmail ? (
                    <Input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} className="h-7 text-xs" data-testid="input-email-subject" />
                  ) : (
                    <p className="text-xs font-medium">{activeSubject}</p>
                  )}
                </div>

                {/* Body */}
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Email Body</p>
                  {isEditingEmail ? (
                    <Textarea
                      value={editedBody}
                      onChange={e => setEditedBody(e.target.value)}
                      className="text-xs min-h-[200px] resize-none"
                      data-testid="textarea-email-body"
                    />
                  ) : (
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{activeBody}</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => subjectCopy.copy(activeSubject)} className="h-7 text-[11px] gap-1" data-testid="button-copy-subject">
                    {subjectCopy.copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {subjectCopy.copied ? 'Copied!' : 'Copy Subject'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bodyCopy.copy(activeBody)} className="h-7 text-[11px] gap-1" data-testid="button-copy-body">
                    {bodyCopy.copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {bodyCopy.copied ? 'Copied!' : 'Copy Body'}
                  </Button>
                  <Button size="sm" onClick={() => fullCopy.copy(fullEmail)} className="h-7 text-[11px] gap-1 col-span-2 bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-copy-full-email">
                    {fullCopy.copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {fullCopy.copied ? 'Copied!' : 'Copy Full Email'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsEditingEmail(p => !p); if (!isEditingEmail) { setEditedBody(email.body || ''); setEditedSubject(email.subject || ''); } }} className="h-7 text-[11px] gap-1 col-span-2" data-testid="button-edit-email">
                    <Edit3 className="h-3 w-3" /> {isEditingEmail ? 'Done Editing' : 'Edit Email'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

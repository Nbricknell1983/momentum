/**
 * Portal Share Page — /share/:token
 *
 * Public, token-gated client portal.
 * No login required — access is controlled by the share token.
 * Tokens can be revoked by the admin at any time.
 *
 * The server validates the token, strips internal-only fields,
 * and returns a client-safe data snapshot.
 */

import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ClientCommandCentre } from '@/components/ClientCommandCentre';
import { Shield, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Client } from '@/lib/types';

// ─── Fetch portal data (no auth required) ─────────────────────────────────────

async function fetchPortalData(token: string): Promise<{ client: Partial<Client>; businessName: string; visibilityRules?: any }> {
  const res = await fetch(`/api/portal/share/${token}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

// ─── Error states ─────────────────────────────────────────────────────────────

function PortalError({ code, message }: { code: 404 | 410 | 403 | 500; message: string }) {
  const config = {
    404: { icon: Shield, title: 'Portal not found', color: 'text-zinc-400', bg: 'bg-zinc-50 dark:bg-zinc-900' },
    410: { icon: Clock, title: 'This link has expired or been revoked', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    403: { icon: Shield, title: 'Access denied', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/30' },
    500: { icon: AlertCircle, title: 'Something went wrong', color: 'text-red-400', bg: 'bg-zinc-50 dark:bg-zinc-900' },
  }[code] || { icon: Shield, title: 'Error', color: 'text-zinc-400', bg: 'bg-zinc-50 dark:bg-zinc-900' };

  const Icon = config.icon;

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${config.bg}`}>
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Icon className={`w-8 h-8 ${config.color}`} />
        </div>
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-2">{config.title}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">{message}</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          If you believe this is an error, please contact your growth team.
        </p>
      </div>
    </div>
  );
}

// ─── Loading state ────────────────────────────────────────────────────────────

function PortalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto mb-3" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading your portal…</p>
      </div>
    </div>
  );
}

// ─── Main portal page ─────────────────────────────────────────────────────────

export default function PortalSharePage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/portal/share', token],
    queryFn: () => fetchPortalData(token),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (isLoading) return <PortalLoading />;

  if (error) {
    const msg = (error as Error).message;
    const code = msg.includes('410') || msg.toLowerCase().includes('revoked') || msg.toLowerCase().includes('expired') ? 410
      : msg.includes('404') || msg.toLowerCase().includes('not found') ? 404
      : msg.includes('403') ? 403
      : 500;
    return <PortalError code={code as any} message={msg} />;
  }

  if (!data) return <PortalError code={404} message="Portal data could not be loaded." />;

  const { client: clientData, businessName, visibilityRules } = data;
  const client = clientData as Client;
  const today = format(new Date(), 'dd MMM yyyy');

  const welcomeMessage = visibilityRules?.customWelcomeMessage ||
    `Here's everything happening with your digital growth — updated ${today}.`;
  const brandName = visibilityRules?.customBrandName || 'Momentum';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" data-testid="portal-share-page">
      {/* Clean public header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{brandName.charAt(0)}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{businessName}</p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Growth Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] text-zinc-400">Secure · Private</span>
          </div>
        </div>
      </header>

      {/* Welcome banner */}
      <div className="max-w-5xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Welcome, {client.primaryContactName?.split(' ')[0] || businessName}
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">{welcomeMessage}</p>
      </div>

      {/* Command Centre */}
      <main className="max-w-5xl mx-auto px-6 py-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden"
          style={{ minHeight: '620px' }}
        >
          <ClientCommandCentre client={client} showAdminBar={false} />
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-600">
          <p>Powered by {brandName} · Updated {today}</p>
          <p>Your portal is private and secure. <a href="mailto:support@momentum.agency" className="underline hover:text-zinc-600 dark:hover:text-zinc-400">Contact support</a></p>
        </div>
      </main>
    </div>
  );
}

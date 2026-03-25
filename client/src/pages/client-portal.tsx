/**
 * Client Portal Page — /portal/:clientId
 *
 * A clean, premium client-facing experience showing their Command Centre.
 * Accessed internally by admins for preview, and eventually shareable with clients.
 *
 * The page pulls the client from Redux (for admin preview) or could be made
 * public via a server-side token route in future.
 */

import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { ClientCommandCentre } from '@/components/ClientCommandCentre';
import { Shield, ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function ClientPortalPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [, setLocation] = useLocation();

  const client = useSelector((state: RootState) =>
    state.app.clients?.find((c: any) => c.id === clientId)
  );

  useEffect(() => {
    if (client) {
      document.title = `${client.businessName} — Growth Portal`;
    } else {
      document.title = 'Client Portal';
    }
    return () => { document.title = 'Momentum Agent'; };
  }, [client]);

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-zinc-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Portal not found</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            This client portal could not be found, or you don't have access to view it.
          </p>
          <Button variant="outline" size="sm" onClick={() => setLocation('/clients')}
            data-testid="btn-portal-back"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to clients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" data-testid="client-portal-page">
      {/* Portal header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{client.businessName}</p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Growth Portal</p>
            </div>
          </div>

          {/* Admin bar */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
              <Shield className="w-2.5 h-2.5" />
              Admin Preview
            </Badge>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setLocation('/clients')}
              data-testid="btn-portal-exit-preview"
            >
              <ArrowLeft className="w-3 h-3 mr-1" />
              Exit preview
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Client welcome banner */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Welcome back, {client.primaryContactName.split(' ')[0]}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Here's everything happening with your digital growth — updated {format(new Date(), 'dd MMM yyyy')}.
          </p>
        </div>

        {/* Command Centre — compact portal mode */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden"
          style={{ minHeight: '600px' }}
        >
          <ClientCommandCentre client={client} showAdminBar={false} compact={false} />
        </div>

        {/* Admin data source note */}
        <div className="mt-6 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Admin: Portal Preview Mode</p>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            This is how the client portal will look to {client.businessName}.
            All data is derived from the client record — no raw internal states are shown.
            To share with the client, a unique portal link will be generated per client (coming soon).
          </p>
          <div className="flex items-center gap-3 mt-3">
            <div className="text-[10px] text-zinc-400 flex items-center gap-1">
              <span className="font-semibold">Client ID:</span> {client.id}
            </div>
            <div className="text-[10px] text-zinc-400 flex items-center gap-1">
              <span className="font-semibold">Health:</span> {client.healthStatus}
            </div>
            <div className="text-[10px] text-zinc-400 flex items-center gap-1">
              <span className="font-semibold">Delivery:</span> {client.deliveryStatus || 'not set'}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

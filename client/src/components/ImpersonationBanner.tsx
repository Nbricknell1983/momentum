import { Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';

export default function ImpersonationBanner() {
  const { viewAsUser, clearViewAs, orgId, user } = useAuth();

  if (!viewAsUser) return null;

  const handleExit = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token && orgId) {
        fetch('/api/impersonation/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            event: 'ended',
            targetUid: viewAsUser.uid,
            targetEmail: viewAsUser.email,
            targetName: viewAsUser.displayName,
            targetRole: viewAsUser.role,
            logId: viewAsUser.logId,
          }),
        }).catch(() => {});
      }
    } finally {
      clearViewAs();
    }
  };

  const roleLabel = viewAsUser.role === 'owner' ? 'Owner'
    : viewAsUser.role === 'admin' ? 'Admin'
    : 'Team Member';

  return (
    <div className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center gap-3 text-sm font-medium z-50 flex-shrink-0">
      <Eye className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 flex items-center gap-2 flex-wrap">
        <span className="font-bold">Support View</span>
        <span className="opacity-70">·</span>
        <span>
          Viewing as <strong>{viewAsUser.displayName || viewAsUser.email}</strong>
          {viewAsUser.displayName && viewAsUser.email && (
            <span className="opacity-70 ml-1">({viewAsUser.email})</span>
          )}
        </span>
        <span className="bg-amber-700/20 border border-amber-800/20 text-amber-900 text-xs px-2 py-0.5 rounded-full font-semibold">
          {roleLabel}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs opacity-60 hidden sm:block">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          Actions affect real data
        </span>
        <button
          onClick={handleExit}
          data-testid="button-exit-impersonation"
          className="flex items-center gap-1.5 bg-amber-800/20 hover:bg-amber-800/30 border border-amber-800/30 rounded-lg px-3 py-1 text-xs font-bold transition-colors"
        >
          <EyeOff className="h-3 w-3" />
          Exit
        </button>
      </div>
    </div>
  );
}

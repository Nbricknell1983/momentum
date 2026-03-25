// =============================================================================
// useAISystemsSync — Live Firestore subscription for AI Systems sync snapshots
// =============================================================================
// Subscribes to orgs/{orgId}/aiSystemsSync/{clientId} via onSnapshot.
// The sync service writes here after every pull or push.
// Returns the live snapshot or null if no sync has occurred yet.
// =============================================================================

import { useEffect, useState } from 'react';
import { db }                  from '@/lib/firebase';
import { onSnapshot, doc }    from 'firebase/firestore';
import type { AISystemsSyncSnapshot } from '@/lib/aiSystemsSyncTypes';

// ---------------------------------------------------------------------------
// Single-client hook
// ---------------------------------------------------------------------------

export function useAISystemsSync(
  orgId: string | null | undefined,
  clientId: string | null | undefined
): {
  snapshot: AISystemsSyncSnapshot | null;
  loading:  boolean;
} {
  const [snapshot, setSnapshot] = useState<AISystemsSyncSnapshot | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!orgId || !clientId || !db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'orgs', orgId, 'aiSystemsSync', clientId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSnapshot(snap.exists() ? (snap.data() as AISystemsSyncSnapshot) : null);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return unsub;
  }, [orgId, clientId]);

  return { snapshot, loading };
}

// ---------------------------------------------------------------------------
// Org-wide hook — all snapshots for the org (used by admin workspace)
// ---------------------------------------------------------------------------

import { collection, onSnapshot as onCollectionSnapshot } from 'firebase/firestore';

export function useAISystemsSyncAll(orgId: string | null | undefined): {
  snapshots: AISystemsSyncSnapshot[];
  loading:   boolean;
} {
  const [snapshots, setSnapshots] = useState<AISystemsSyncSnapshot[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!orgId || !db) {
      setLoading(false);
      return;
    }

    const col  = collection(db, 'orgs', orgId, 'aiSystemsSync');
    const unsub = onCollectionSnapshot(
      col,
      (snap) => {
        setSnapshots(snap.docs.map(d => d.data() as AISystemsSyncSnapshot));
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return unsub;
  }, [orgId]);

  return { snapshots, loading };
}

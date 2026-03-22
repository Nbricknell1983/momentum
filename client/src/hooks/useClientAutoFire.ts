import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateClient } from '@/store';
import { Client } from '@/lib/types';
import { auth } from '@/lib/firebase';

// ─── Conditions ───────────────────────────────────────────────────────────────

function shouldAutoFireWebsite(client: Client): boolean {
  const plan = client.activationPlan;
  if (!plan) return false;
  if (!plan.selectedScope?.includes('website')) return false;

  const status = plan.workstreams?.website?.status;
  // Already generating, has output, or past queued → skip
  if (status === 'generating') return false;
  if (status === 'ready_for_review' || status === 'approved' || status === 'live' || status === 'optimising') return false;
  if (plan.websiteWorkstream?.brief) return false; // output already exists

  return true;
}

function shouldAutoFireGBP(client: Client): boolean {
  const plan = client.activationPlan;
  if (!plan) return false;
  if (!plan.selectedScope?.includes('gbp')) return false;

  const status = plan.workstreams?.gbp?.status;
  if (status === 'generating') return false;
  if (status === 'ready_for_review' || status === 'approved' || status === 'live' || status === 'optimising') return false;
  if (plan.gbpWorkstream?.tasks?.length) return false; // output already exists

  return true;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface AutoFireState {
  websiteRunning: boolean;
  gbpRunning: boolean;
}

export function useClientAutoFire(
  client: Client,
  orgId: string | null,
  authReady: boolean,
): AutoFireState {
  const dispatch = useDispatch();

  const websiteFiredRef = useRef(false);
  const gbpFiredRef     = useRef(false);

  const [websiteRunning, setWebsiteRunning] = useState(
    client.activationPlan?.workstreams?.website?.status === 'generating',
  );
  const [gbpRunning, setGbpRunning] = useState(
    client.activationPlan?.workstreams?.gbp?.status === 'generating',
  );

  // Sync external "generating" status (from Firestore onSnapshot) into running state
  useEffect(() => {
    const wsStatus = client.activationPlan?.workstreams?.website?.status;
    if (wsStatus === 'generating') setWebsiteRunning(true);
    else if (wsStatus !== 'generating' && websiteRunning && !websiteFiredRef.current) setWebsiteRunning(false);
  }, [client.activationPlan?.workstreams?.website?.status]);

  useEffect(() => {
    const gbpStatus = client.activationPlan?.workstreams?.gbp?.status;
    if (gbpStatus === 'generating') setGbpRunning(true);
    else if (gbpStatus !== 'generating' && gbpRunning && !gbpFiredRef.current) setGbpRunning(false);
  }, [client.activationPlan?.workstreams?.gbp?.status]);

  const fireWorkstream = async (scope: 'website' | 'gbp') => {
    if (!orgId || !authReady) return;
    const plan = client.activationPlan;
    if (!plan) return;

    const setRunning = scope === 'website' ? setWebsiteRunning : setGbpRunning;
    setRunning(true);

    // Optimistically update Redux to show generating state immediately
    dispatch(updateClient({
      ...client,
      activationPlan: {
        ...plan,
        workstreams: {
          ...plan.workstreams,
          [scope]: { ...(plan.workstreams?.[scope] ?? {}), status: 'generating' },
        },
      },
    }));

    try {
      const token = await auth.currentUser?.getIdToken();
      const endpoint = scope === 'website' ? 'website-workstream' : 'gbp-workstream';
      const res = await fetch(`/api/clients/${client.id}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orgId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const data = await res.json();

      // Update Redux with the completed workstream data
      // (Firestore onSnapshot will also deliver this, so this is just for immediate UI update)
      dispatch(updateClient({
        ...client,
        activationPlan: {
          ...plan,
          workstreams: {
            ...plan.workstreams,
            [scope]: { ...(plan.workstreams?.[scope] ?? {}), status: 'ready_for_review', updatedAt: new Date().toISOString() },
          },
          [`${scope}Workstream`]: data.workstream,
        },
      }));
    } catch (err) {
      console.error(`[auto-fire/${scope}]`, err);
      // Reset to queued on failure
      dispatch(updateClient({
        ...client,
        activationPlan: {
          ...plan,
          workstreams: {
            ...plan.workstreams,
            [scope]: { ...(plan.workstreams?.[scope] ?? {}), status: 'queued' },
          },
        },
      }));
    } finally {
      setRunning(false);
    }
  };

  // ── Auto-fire GBP at 400ms (no dependencies — can start immediately) ─────────
  useEffect(() => {
    if (!orgId || !authReady) return;
    if (gbpFiredRef.current) return;
    if (!shouldAutoFireGBP(client)) return;

    gbpFiredRef.current = true;
    const timer = setTimeout(() => fireWorkstream('gbp'), 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, authReady, client.id]);

  // ── Auto-fire Website at 800ms ────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !authReady) return;
    if (websiteFiredRef.current) return;
    if (!shouldAutoFireWebsite(client)) return;

    websiteFiredRef.current = true;
    const timer = setTimeout(() => fireWorkstream('website'), 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, authReady, client.id]);

  return { websiteRunning, gbpRunning };
}

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
  if (status === 'generating') return false;
  if (status === 'ready_for_review' || status === 'approved' || status === 'live' || status === 'optimising') return false;
  if (plan.websiteWorkstream?.brief) return false;
  return true;
}

function shouldAutoFireGBP(client: Client): boolean {
  const plan = client.activationPlan;
  if (!plan) return false;
  if (!plan.selectedScope?.includes('gbp')) return false;
  const status = plan.workstreams?.gbp?.status;
  if (status === 'generating') return false;
  if (status === 'ready_for_review' || status === 'approved' || status === 'live' || status === 'optimising') return false;
  if (plan.gbpWorkstream?.tasks?.length) return false;
  return true;
}

function shouldAutoFireScopeAudit(client: Client): boolean {
  if (client.activationPlan?.selectedScope?.length) return false;
  if (client.scopeAudit?.auditedAt) {
    const age = Date.now() - new Date(client.scopeAudit.auditedAt).getTime();
    if (age < 48 * 60 * 60 * 1000) return false;
  }
  return true;
}

function shouldAutoFireIntelligenceBrief(client: Client): boolean {
  const brief = client.intelligenceBrief;
  if (brief?.generatedAt) {
    const age = Date.now() - new Date(brief.generatedAt).getTime();
    if (age >= 48 * 60 * 60 * 1000) return true; // stale — regenerate

    // Detect a "bad" cached brief: presence signals are empty but client clearly
    // has known presence data (website, social, GBP). Force regeneration.
    // Check all possible data locations — same multi-path logic as ClientIntelligencePanel.
    const ps = brief.presenceSnapshot;
    const bp = client.businessProfile;
    const ob = client.clientOnboarding;
    const pp = (client.sourceIntelligence?.prepCallPack ?? {}) as Record<string, any>;
    const hasKnownPresence = !!(
      client.website || client.sourceIntelligence?.website ||
      ob?.currentWebsiteUrl || bp?.websiteUrl || pp?.assetLinks?.websiteUrl ||
      client.facebookUrl || bp?.facebookUrl || pp?.assetLinks?.facebookUrl ||
      client.instagramUrl || bp?.instagramUrl || pp?.assetLinks?.instagramUrl ||
      client.linkedinUrl || client.gbpLocationName || bp?.gbpUrl
    );
    const briefHasEmptyPresence = !ps?.websiteSignals?.length && !ps?.socialSignals?.length && !ps?.gbpSignals?.length;
    if (hasKnownPresence && briefHasEmptyPresence) return true; // stale bad data — regenerate

    return false; // fresh + valid
  }
  return true; // no brief at all
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface AutoFireState {
  websiteRunning: boolean;
  gbpRunning: boolean;
  auditRunning: boolean;
  briefRunning: boolean;
  refetchBrief: () => void;
}

export function useClientAutoFire(
  client: Client,
  orgId: string | null,
  authReady: boolean,
): AutoFireState {
  const dispatch = useDispatch();

  const websiteFiredRef   = useRef(false);
  const gbpFiredRef       = useRef(false);
  const auditFiredRef     = useRef(false);
  const briefFiredRef     = useRef(false);

  const [websiteRunning, setWebsiteRunning] = useState(
    client.activationPlan?.workstreams?.website?.status === 'generating',
  );
  const [gbpRunning, setGbpRunning] = useState(
    client.activationPlan?.workstreams?.gbp?.status === 'generating',
  );
  const [auditRunning, setAuditRunning] = useState(false);
  const [briefRunning, setBriefRunning] = useState(false);

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

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

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

  const fireScopeAudit = async () => {
    if (!orgId || !authReady) return;
    setAuditRunning(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/clients/${client.id}/scope-audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orgId }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      dispatch(updateClient({ ...client, scopeAudit: data.audit }));
    } catch (err) {
      console.error('[auto-fire/scope-audit]', err);
    } finally {
      setAuditRunning(false);
    }
  };

  const fireIntelligenceBrief = async () => {
    if (!orgId || !authReady) return;
    setBriefRunning(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/clients/${client.id}/intelligence-brief`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orgId }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      dispatch(updateClient({ ...client, intelligenceBrief: data.brief }));
    } catch (err) {
      console.error('[auto-fire/intelligence-brief]', err);
    } finally {
      setBriefRunning(false);
    }
  };

  // ── Auto-fire GBP at 400ms ────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !authReady) return;
    if (gbpFiredRef.current) return;
    if (!shouldAutoFireGBP(client)) return;
    gbpFiredRef.current = true;
    const timer = setTimeout(() => fireWorkstream('gbp'), 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, authReady, client.id]);

  // ── Auto-fire Website at 800ms ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !authReady) return;
    if (websiteFiredRef.current) return;
    if (!shouldAutoFireWebsite(client)) return;
    websiteFiredRef.current = true;
    const timer = setTimeout(() => fireWorkstream('website'), 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, authReady, client.id]);

  // ── Auto-fire Scope Audit at 300ms (non-activated clients) ───────────────
  useEffect(() => {
    if (!orgId || !authReady) return;
    if (auditFiredRef.current) return;
    if (!shouldAutoFireScopeAudit(client)) return;
    auditFiredRef.current = true;
    const timer = setTimeout(() => fireScopeAudit(), 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, authReady, client.id]);

  // ── Auto-fire Intelligence Brief at 1200ms (all clients) ─────────────────
  useEffect(() => {
    if (!orgId || !authReady) return;
    if (briefFiredRef.current) return;
    if (!shouldAutoFireIntelligenceBrief(client)) return;
    briefFiredRef.current = true;
    const timer = setTimeout(() => fireIntelligenceBrief(), 1200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, authReady, client.id]);

  return { websiteRunning, gbpRunning, auditRunning, briefRunning, refetchBrief: fireIntelligenceBrief };
}

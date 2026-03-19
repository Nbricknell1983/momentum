import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { setLeads, setClients } from '@/store';
import { db, collection, query, orderBy, where, onSnapshot } from './firebase';
import { convertTimestampToDate } from './firestoreService';
import { calculateClientHealth } from './types';
import type { Lead, Client } from './types';

function normalizeLeadDoc(id: string, data: any): Lead {
  const converted = convertTimestampToDate(data);
  const { id: _storedId, ...rest } = converted as any;
  return {
    ...rest,
    id,
    conversationStage: rest.conversationStage || 'not_started',
    conversationCount: rest.conversationCount || 0,
    attemptCount: rest.attemptCount || 0,
    nurtureMode: rest.nurtureMode || 'none',
    nurtureStatus: rest.nurtureStatus || null,
    nurtureCadenceId: rest.nurtureCadenceId || null,
    nurtureStepIndex: rest.nurtureStepIndex ?? 0,
    touchesNoResponse: rest.touchesNoResponse ?? 0,
    nurturePriorityScore: rest.nurturePriorityScore ?? 0,
  } as Lead;
}

function normalizeClientDoc(id: string, data: any): Client {
  const converted = convertTimestampToDate(data);
  const base = { id, ...converted } as Client;
  const healthResult = calculateClientHealth(base);
  return {
    ...base,
    churnRiskScore: healthResult.churnRiskScore,
    healthStatus: healthResult.healthStatus,
    healthReasons: healthResult.healthReasons,
  };
}

function sortByUpdatedAt<T extends { updatedAt?: Date | null }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
}

interface SyncOptions {
  orgId: string | null;
  userId: string | null;
  isManager: boolean;
  authReady: boolean;
  membershipReady: boolean;
}

export function useFirestoreSync({
  orgId,
  userId,
  isManager,
  authReady,
  membershipReady,
}: SyncOptions): { leadsReady: boolean; clientsReady: boolean } {
  const dispatch = useDispatch();
  const [leadsReady, setLeadsReady] = useState(false);
  const [clientsReady, setClientsReady] = useState(false);

  const leadsUnsubRef = useRef<(() => void) | null>(null);
  const clientsUnsubRef = useRef<(() => void) | null>(null);
  const activeOrgRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !membershipReady || !orgId || !userId) {
      return;
    }

    if (activeOrgRef.current === orgId) {
      return;
    }

    if (leadsUnsubRef.current) {
      leadsUnsubRef.current();
      leadsUnsubRef.current = null;
    }
    if (clientsUnsubRef.current) {
      clientsUnsubRef.current();
      clientsUnsubRef.current = null;
    }

    activeOrgRef.current = orgId;
    setLeadsReady(false);
    setClientsReady(false);

    console.log('[FirestoreSync] Attaching listeners for org:', orgId, '| isManager:', isManager);

    const leadsRef = collection(db, 'orgs', orgId, 'leads');
    const leadsQuery = isManager
      ? query(leadsRef, orderBy('updatedAt', 'desc'))
      : query(leadsRef, where('userId', '==', userId));

    leadsUnsubRef.current = onSnapshot(
      leadsQuery,
      (snapshot) => {
        const leads = sortByUpdatedAt(
          snapshot.docs.map((d) => normalizeLeadDoc(d.id, d.data()))
        );
        console.log('[FirestoreSync] leads snapshot:', leads.length, 'docs');
        dispatch(setLeads(leads));
        setLeadsReady(true);
      },
      (error) => {
        console.error('[FirestoreSync] leads listener error:', error);
        setLeadsReady(true);
      }
    );

    const clientsRef = collection(db, 'orgs', orgId, 'clients');
    const clientsQuery = isManager
      ? query(clientsRef, orderBy('updatedAt', 'desc'))
      : query(clientsRef, where('userId', '==', userId));

    clientsUnsubRef.current = onSnapshot(
      clientsQuery,
      (snapshot) => {
        const clients = sortByUpdatedAt(
          snapshot.docs.map((d) => normalizeClientDoc(d.id, d.data()))
        );
        console.log('[FirestoreSync] clients snapshot:', clients.length, 'docs');
        dispatch(setClients(clients));
        setClientsReady(true);
      },
      (error) => {
        console.error('[FirestoreSync] clients listener error:', error);
        setClientsReady(true);
      }
    );

    return () => {
      console.log('[FirestoreSync] Cleaning up listeners for org:', orgId);
      if (leadsUnsubRef.current) {
        leadsUnsubRef.current();
        leadsUnsubRef.current = null;
      }
      if (clientsUnsubRef.current) {
        clientsUnsubRef.current();
        clientsUnsubRef.current = null;
      }
      activeOrgRef.current = null;
    };
  }, [authReady, membershipReady, orgId, userId, isManager, dispatch]);

  useEffect(() => {
    if (!orgId || !userId) {
      if (leadsUnsubRef.current) {
        leadsUnsubRef.current();
        leadsUnsubRef.current = null;
      }
      if (clientsUnsubRef.current) {
        clientsUnsubRef.current();
        clientsUnsubRef.current = null;
      }
      activeOrgRef.current = null;
      setLeadsReady(false);
      setClientsReady(false);
    }
  }, [orgId, userId]);

  return { leadsReady, clientsReady };
}

import { db, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp, collection } from './firebase';
import { auth } from './firebase';
import type { Lead, Activity } from './types';

function logFirestoreOperation(operation: string, path: string, orgId: string | null, success: boolean, error?: any) {
  const currentUser = auth.currentUser;
  const logData = {
    operation,
    path,
    uid: currentUser?.uid || 'NO_USER',
    orgId: orgId || 'NO_ORG',
    success,
    timestamp: new Date().toISOString(),
  };
  
  if (success) {
    console.log('[Firestore]', operation, 'SUCCESS', logData);
  } else {
    console.error('[Firestore]', operation, 'DENIED/FAILED', logData, error);
  }
}

function convertTimestampToDate(data: any): any {
  if (data === null || data === undefined) return data;
  if (data instanceof Timestamp) return data.toDate();
  if (Array.isArray(data)) return data.map(convertTimestampToDate);
  if (typeof data === 'object') {
    const result: any = {};
    for (const key in data) {
      result[key] = convertTimestampToDate(data[key]);
    }
    return result;
  }
  return data;
}

function convertDatesToTimestamp(data: any): any {
  if (data === null || data === undefined) return data;
  if (data instanceof Date) return Timestamp.fromDate(data);
  if (Array.isArray(data)) return data.map(convertDatesToTimestamp);
  if (typeof data === 'object' && !(data instanceof Timestamp)) {
    const result: any = {};
    for (const key in data) {
      result[key] = convertDatesToTimestamp(data[key]);
    }
    return result;
  }
  return data;
}

function removeUndefinedFields(obj: any): any {
  const result: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

function checkAuthReady(orgId: string | null, authReady: boolean, operation: string, path: string): boolean {
  const currentUser = auth.currentUser;
  
  if (!authReady) {
    console.error('[Firestore] BLOCKED:', operation, '- authReady is false. Path:', path);
    logFirestoreOperation(operation, path, orgId, false, new Error('Auth not ready - membership not verified'));
    return false;
  }
  
  if (!currentUser) {
    console.error('[Firestore] BLOCKED:', operation, '- No authenticated user. Path:', path);
    logFirestoreOperation(operation, path, orgId, false, new Error('No authenticated user'));
    return false;
  }
  
  if (!orgId) {
    console.error('[Firestore] BLOCKED:', operation, '- No orgId. Path:', path, 'uid:', currentUser.uid);
    logFirestoreOperation(operation, path, orgId, false, new Error('No orgId'));
    return false;
  }
  
  return true;
}

export async function fetchLeads(orgId: string, authReady: boolean = false): Promise<Lead[]> {
  const path = `orgs/${orgId}/leads`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const leadsRef = collection(db, 'orgs', orgId, 'leads');
    const q = query(leadsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const leads = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Lead[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return leads;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    
    if (error.code === 'permission-denied') {
      console.error('[Firestore] Permission denied for READ on', path);
      console.error('[Firestore] Current user uid:', auth.currentUser?.uid);
      console.error('[Firestore] Requested orgId:', orgId);
    }
    
    return [];
  }
}

export async function fetchLead(orgId: string, id: string, authReady: boolean = false): Promise<Lead | null> {
  const path = `orgs/${orgId}/leads/${id}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'leads', id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return { id: docSnap.id, ...convertTimestampToDate(docSnap.data()) } as Lead;
    }
    
    logFirestoreOperation('READ', path, orgId, true);
    return null;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function createLead(orgId: string, lead: Omit<Lead, 'id'>, authReady: boolean = false): Promise<Lead> {
  const path = `orgs/${orgId}/leads`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create lead: not authenticated or no orgId');
  }
  
  try {
    const cleanedLead = removeUndefinedFields(lead);
    const dataToSave = convertDatesToTimestamp({
      ...cleanedLead,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const leadsRef = collection(db, 'orgs', orgId, 'leads');
    const docRef = await addDoc(leadsRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedLead, id: docRef.id, createdAt: new Date(), updatedAt: new Date() } as Lead;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    
    if (error.code === 'permission-denied') {
      console.error('[Firestore] Permission denied for WRITE on', path);
      console.error('[Firestore] Current user uid:', auth.currentUser?.uid);
      console.error('[Firestore] Requested orgId:', orgId);
    }
    
    throw error;
  }
}

export async function updateLeadInFirestore(orgId: string, id: string, updates: Partial<Lead>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/leads/${id}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update lead: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'leads', id);
    const cleanedUpdates = removeUndefinedFields(updates);
    const dataToUpdate = convertDatesToTimestamp({
      ...cleanedUpdates,
      updatedAt: new Date(),
    });
    await updateDoc(docRef, dataToUpdate);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function deleteLeadFromFirestore(orgId: string, id: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/leads/${id}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete lead: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'leads', id);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchActivities(orgId: string, leadId: string, authReady: boolean = false): Promise<Activity[]> {
  const path = `orgs/${orgId}/activities`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const activitiesRef = collection(db, 'orgs', orgId, 'activities');
    const q = query(activitiesRef, where('leadId', '==', leadId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const activities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Activity[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return activities;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createActivity(orgId: string, activity: Omit<Activity, 'id'>, authReady: boolean = false): Promise<Activity> {
  const path = `orgs/${orgId}/activities`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create activity: not authenticated or no orgId');
  }
  
  try {
    const cleanedActivity = removeUndefinedFields(activity);
    const dataToSave = convertDatesToTimestamp({
      ...cleanedActivity,
      createdAt: new Date(),
    });
    const activitiesRef = collection(db, 'orgs', orgId, 'activities');
    const docRef = await addDoc(activitiesRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedActivity, id: docRef.id, createdAt: new Date() } as Activity;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

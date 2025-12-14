import { db, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp, collection } from './firebase';
import type { Lead, Activity } from './types';

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

export async function fetchLeads(orgId: string): Promise<Lead[]> {
  if (!orgId) {
    console.warn('fetchLeads called without orgId');
    return [];
  }
  try {
    const leadsRef = collection(db, 'orgs', orgId, 'leads');
    const q = query(leadsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Lead[];
  } catch (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
}

export async function fetchLead(orgId: string, id: string): Promise<Lead | null> {
  if (!orgId) {
    console.warn('fetchLead called without orgId');
    return null;
  }
  try {
    const docRef = doc(db, 'orgs', orgId, 'leads', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...convertTimestampToDate(docSnap.data()) } as Lead;
    }
    return null;
  } catch (error) {
    console.error('Error fetching lead:', error);
    return null;
  }
}

export async function createLead(orgId: string, lead: Omit<Lead, 'id'>): Promise<Lead> {
  if (!orgId) {
    throw new Error('Cannot create lead without orgId');
  }
  const cleanedLead = removeUndefinedFields(lead);
  const dataToSave = convertDatesToTimestamp({
    ...cleanedLead,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const leadsRef = collection(db, 'orgs', orgId, 'leads');
  const docRef = await addDoc(leadsRef, dataToSave);
  return { ...cleanedLead, id: docRef.id, createdAt: new Date(), updatedAt: new Date() } as Lead;
}

export async function updateLeadInFirestore(orgId: string, id: string, updates: Partial<Lead>): Promise<void> {
  if (!orgId) {
    throw new Error('Cannot update lead without orgId');
  }
  const docRef = doc(db, 'orgs', orgId, 'leads', id);
  const cleanedUpdates = removeUndefinedFields(updates);
  const dataToUpdate = convertDatesToTimestamp({
    ...cleanedUpdates,
    updatedAt: new Date(),
  });
  await updateDoc(docRef, dataToUpdate);
}

export async function deleteLeadFromFirestore(orgId: string, id: string): Promise<void> {
  if (!orgId) {
    throw new Error('Cannot delete lead without orgId');
  }
  const docRef = doc(db, 'orgs', orgId, 'leads', id);
  await deleteDoc(docRef);
}

export async function fetchActivities(orgId: string, leadId: string): Promise<Activity[]> {
  if (!orgId) {
    console.warn('fetchActivities called without orgId');
    return [];
  }
  try {
    const activitiesRef = collection(db, 'orgs', orgId, 'activities');
    const q = query(activitiesRef, where('leadId', '==', leadId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Activity[];
  } catch (error) {
    console.error('Error fetching activities:', error);
    return [];
  }
}

export async function createActivity(orgId: string, activity: Omit<Activity, 'id'>): Promise<Activity> {
  if (!orgId) {
    throw new Error('Cannot create activity without orgId');
  }
  const cleanedActivity = removeUndefinedFields(activity);
  const dataToSave = convertDatesToTimestamp({
    ...cleanedActivity,
    createdAt: new Date(),
  });
  const activitiesRef = collection(db, 'orgs', orgId, 'activities');
  const docRef = await addDoc(activitiesRef, dataToSave);
  return { ...cleanedActivity, id: docRef.id, createdAt: new Date() } as Activity;
}

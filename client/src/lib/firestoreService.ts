import { db, leadsCollection, activitiesCollection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp } from './firebase';
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

export async function fetchLeads(): Promise<Lead[]> {
  try {
    const q = query(leadsCollection, orderBy('updatedAt', 'desc'));
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

export async function fetchLead(id: string): Promise<Lead | null> {
  try {
    const docRef = doc(db, 'leads', id);
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

export async function createLead(lead: Omit<Lead, 'id'>): Promise<Lead> {
  const dataToSave = convertDatesToTimestamp({
    ...lead,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const docRef = await addDoc(leadsCollection, dataToSave);
  return { ...lead, id: docRef.id, createdAt: new Date(), updatedAt: new Date() } as Lead;
}

export async function updateLeadInFirestore(id: string, updates: Partial<Lead>): Promise<void> {
  const docRef = doc(db, 'leads', id);
  const dataToUpdate = convertDatesToTimestamp({
    ...updates,
    updatedAt: new Date(),
  });
  await updateDoc(docRef, dataToUpdate);
}

export async function deleteLeadFromFirestore(id: string): Promise<void> {
  const docRef = doc(db, 'leads', id);
  await deleteDoc(docRef);
}

export async function fetchActivities(leadId: string): Promise<Activity[]> {
  try {
    const q = query(activitiesCollection, where('leadId', '==', leadId), orderBy('createdAt', 'desc'));
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

export async function createActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
  const dataToSave = convertDatesToTimestamp({
    ...activity,
    createdAt: new Date(),
  });
  const docRef = await addDoc(activitiesCollection, dataToSave);
  return { ...activity, id: docRef.id, createdAt: new Date() } as Activity;
}

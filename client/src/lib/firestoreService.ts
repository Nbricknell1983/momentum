import { db, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp, collection, limit, setDoc, writeBatch } from './firebase';
import { auth } from './firebase';
import type { Lead, Activity, NBAAction, LeadHistory, FocusModeSettings, Client, ClientHistory, Deliverable, StrategySession, StrategyPlan, ContentDraft, ChannelInsight, AnalyticsSnapshot, EvidenceTask, InsightChannel, DailyPlanDoc, AIBrief, AIDebrief, UserDailySettings, PlanActionRecommendation, Task, StrategyEngineState, StrategyEngineOutput, StrategyAction, RejectedBusiness, Organization, TeamMember, ConversationLog, AIAction, ExecutionStatusState, AutomationMode } from './types';
import { calculateClientHealth, createDefaultDailyPlanDoc, formatDateDDMMYYYY, activityTypeToTaskType, getCurrentTimeSlot, getTodayDDMMYYYY, toPlanDateKey, ACTIVITY_LABELS } from './types';

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

export function convertTimestampToDate(data: any): any {
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
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        result[key] = removeUndefinedFields(obj[key]);
      }
    }
    return result;
  }
  return obj;
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

// ============ Organization Functions ============

export async function fetchOrganization(orgId: string, authReady: boolean = false): Promise<Organization | null> {
  const path = `orgs/${orgId}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const orgRef = doc(db, 'orgs', orgId);
    const snapshot = await getDoc(orgRef);
    
    if (!snapshot.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const org = {
      id: snapshot.id,
      ...convertTimestampToDate(snapshot.data()),
    } as Organization;
    
    logFirestoreOperation('READ', path, orgId, true);
    return org;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    throw error;
  }
}

export async function updateOrganization(
  orgId: string, 
  updates: Partial<Omit<Organization, 'id' | 'createdAt' | 'ownerId'>>,
  authReady: boolean = false
): Promise<void> {
  const path = `orgs/${orgId}`;
  
  if (!checkAuthReady(orgId, authReady, 'UPDATE', path)) {
    throw new Error('Cannot update organization: not authenticated or no orgId');
  }
  
  try {
    const orgRef = doc(db, 'orgs', orgId);
    const dataToSave = convertDatesToTimestamp({
      ...removeUndefinedFields(updates),
      updatedAt: new Date(),
    });
    await updateDoc(orgRef, dataToSave);
    
    logFirestoreOperation('UPDATE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('UPDATE', path, orgId, false, error);
    throw error;
  }
}

export async function createOrganization(
  org: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>,
  authReady: boolean = false
): Promise<Organization> {
  const tempOrgId = 'temp'; // For logging only
  const path = `orgs`;
  
  if (!authReady || !auth.currentUser) {
    console.error('[Firestore] BLOCKED: CREATE org - authReady is false or no user');
    throw new Error('Cannot create organization: not authenticated');
  }
  
  try {
    const dataToSave = convertDatesToTimestamp({
      ...removeUndefinedFields(org),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const orgsRef = collection(db, 'orgs');
    const docRef = await addDoc(orgsRef, dataToSave);
    
    logFirestoreOperation('CREATE', `${path}/${docRef.id}`, docRef.id, true);
    return { ...org, id: docRef.id, createdAt: new Date(), updatedAt: new Date() } as Organization;
  } catch (error: any) {
    logFirestoreOperation('CREATE', path, tempOrgId, false, error);
    throw error;
  }
}

// ============ Team Member Functions ============

export async function fetchTeamMembers(orgId: string, authReady: boolean = false): Promise<TeamMember[]> {
  const path = `orgs/${orgId}/members`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const membersRef = collection(db, 'orgs', orgId, 'members');
    const q = query(membersRef, orderBy('joinedAt', 'desc'));
    const snapshot = await getDocs(q);
    const members = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as TeamMember[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return members;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    throw error;
  }
}

export async function addTeamMember(
  orgId: string,
  member: Omit<TeamMember, 'id' | 'joinedAt'>,
  authReady: boolean = false
): Promise<TeamMember> {
  const path = `orgs/${orgId}/members`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot add team member: not authenticated or no orgId');
  }
  
  try {
    const dataToSave = convertDatesToTimestamp({
      ...removeUndefinedFields(member),
      joinedAt: new Date(),
    });
    const membersRef = collection(db, 'orgs', orgId, 'members');
    const docRef = await addDoc(membersRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...member, id: docRef.id, joinedAt: new Date() } as TeamMember;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateTeamMember(
  orgId: string,
  memberId: string,
  updates: Partial<Omit<TeamMember, 'id' | 'joinedAt'>>,
  authReady: boolean = false
): Promise<void> {
  const path = `orgs/${orgId}/members/${memberId}`;
  
  if (!checkAuthReady(orgId, authReady, 'UPDATE', path)) {
    throw new Error('Cannot update team member: not authenticated or no orgId');
  }
  
  try {
    const memberRef = doc(db, 'orgs', orgId, 'members', memberId);
    await updateDoc(memberRef, removeUndefinedFields(updates));
    
    logFirestoreOperation('UPDATE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('UPDATE', path, orgId, false, error);
    throw error;
  }
}

export async function removeTeamMember(orgId: string, memberId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/members/${memberId}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot remove team member: not authenticated or no orgId');
  }
  
  try {
    const memberRef = doc(db, 'orgs', orgId, 'members', memberId);
    await deleteDoc(memberRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchLeads(orgId: string, authReady: boolean = false, filterByUserId?: string): Promise<Lead[]> {
  const path = `orgs/${orgId}/leads`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const leadsRef = collection(db, 'orgs', orgId, 'leads');
    // Use simple where() without orderBy to avoid requiring a composite index.
    // Sort client-side after fetch.
    const q = filterByUserId
      ? query(leadsRef, where('userId', '==', filterByUserId))
      : query(leadsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const leads = snapshot.docs.map(doc => {
      const data = convertTimestampToDate(doc.data());
      const { id: _storedId, ...rest } = data as any;
      return {
        ...rest,
        id: doc.id,
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
    }).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    
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
      const data = convertTimestampToDate(docSnap.data());
      // Use Firestore document ID, not any id field stored in the document data
      const { id: _storedId, ...rest } = data as any;
      return { ...rest, id: docSnap.id } as Lead;
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
    // Strip out any id field - Firestore document ID will be auto-generated
    const { id: _existingId, ...leadWithoutId } = cleanedLead as any;
    const dataToSave = convertDatesToTimestamp({
      ...leadWithoutId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const leadsRef = collection(db, 'orgs', orgId, 'leads');
    const docRef = await addDoc(leadsRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...leadWithoutId, id: docRef.id, createdAt: new Date(), updatedAt: new Date() } as Lead;
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
    // Strip out id field - we don't want to store id in document data
    const { id: _existingId, ...updatesWithoutId } = cleanedUpdates as any;
    const dataToUpdate = convertDatesToTimestamp({
      ...updatesWithoutId,
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

// ============================================
// Conversation Log Functions
// ============================================

export async function fetchConversationLogs(orgId: string, leadId: string, authReady: boolean = false): Promise<ConversationLog[]> {
  const path = `orgs/${orgId}/leads/${leadId}/conversations`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const convoRef = collection(db, 'orgs', orgId, 'leads', leadId, 'conversations');
    const q = query(convoRef, orderBy('createdAt', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    const logs = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...convertTimestampToDate(docSnap.data()),
    })) as ConversationLog[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return logs;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createConversationLog(
  orgId: string,
  leadId: string,
  log: Omit<ConversationLog, 'id'>,
  authReady: boolean = false,
  leadUpdates?: Partial<Lead>
): Promise<ConversationLog> {
  const path = `orgs/${orgId}/leads/${leadId}/conversations`;
  
  if (!checkAuthReady(orgId, authReady, 'CREATE', path)) {
    throw new Error('Cannot create conversation log: not authenticated or no orgId');
  }
  
  try {
    if (leadUpdates && Object.keys(leadUpdates).length > 0) {
      const batch = writeBatch(db);
      const convoDocRef = doc(collection(db, 'orgs', orgId, 'leads', leadId, 'conversations'));
      batch.set(convoDocRef, convertDatesToTimestamp(removeUndefinedFields(log)));
      const leadDocRef = doc(db, 'orgs', orgId, 'leads', leadId);
      batch.update(leadDocRef, convertDatesToTimestamp(removeUndefinedFields(leadUpdates)));
      await batch.commit();
      logFirestoreOperation('BATCH_CREATE', path, orgId, true);
      return { id: convoDocRef.id, ...log };
    } else {
      const convoRef = collection(db, 'orgs', orgId, 'leads', leadId, 'conversations');
      const docRef = await addDoc(convoRef, convertDatesToTimestamp(removeUndefinedFields(log)));
      logFirestoreOperation('CREATE', path, orgId, true);
      return { id: docRef.id, ...log };
    }
  } catch (error: any) {
    logFirestoreOperation('CREATE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Rejected/Not Interested Business Functions
// ============================================

export async function fetchRejectedBusinesses(orgId: string, authReady: boolean = false): Promise<RejectedBusiness[]> {
  const path = `orgs/${orgId}/rejectedBusinesses`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const rejectedRef = collection(db, 'orgs', orgId, 'rejectedBusinesses');
    const q = query(rejectedRef, orderBy('rejectedAt', 'desc'));
    const snapshot = await getDocs(q);
    const rejected = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...convertTimestampToDate(docSnap.data()),
    })) as RejectedBusiness[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return rejected;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createRejectedBusiness(
  orgId: string, 
  rejected: Omit<RejectedBusiness, 'id'>, 
  authReady: boolean = false
): Promise<RejectedBusiness> {
  const path = `orgs/${orgId}/rejectedBusinesses`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create rejected business: not authenticated or no orgId');
  }
  
  try {
    const cleanedData = removeUndefinedFields(rejected);
    const dataToSave = convertDatesToTimestamp({
      ...cleanedData,
      rejectedAt: new Date(),
    });
    const rejectedRef = collection(db, 'orgs', orgId, 'rejectedBusinesses');
    const docRef = await addDoc(rejectedRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedData, id: docRef.id, rejectedAt: new Date() } as RejectedBusiness;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function deleteRejectedBusiness(orgId: string, id: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/rejectedBusinesses/${id}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete rejected business: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'rejectedBusinesses', id);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

// Check if a business matches any rejected entry (by phone, email, placeId, or ABN)
export function checkIfBusinessRejected(
  business: { phone?: string; email?: string; googlePlaceId?: string; abn?: string; businessName?: string },
  rejectedList: RejectedBusiness[]
): RejectedBusiness | null {
  if (!rejectedList || rejectedList.length === 0) return null;
  
  // Normalize phone number for comparison
  const normalizePhone = (p?: string) => p?.replace(/[\s\-\(\)]/g, '') || '';
  const businessPhone = normalizePhone(business.phone);
  
  for (const rejected of rejectedList) {
    // Match by Google Place ID (most reliable)
    if (business.googlePlaceId && rejected.googlePlaceId && 
        business.googlePlaceId === rejected.googlePlaceId) {
      return rejected;
    }
    
    // Match by ABN (very reliable for Australian businesses)
    if (business.abn && rejected.abn && business.abn === rejected.abn) {
      return rejected;
    }
    
    // Match by phone number
    if (businessPhone && normalizePhone(rejected.phone) === businessPhone) {
      return rejected;
    }
    
    // Match by email (case-insensitive)
    if (business.email && rejected.email && 
        business.email.toLowerCase() === rejected.email.toLowerCase()) {
      return rejected;
    }
  }
  
  return null;
}

export async function fetchActivities(orgId: string, leadId: string, authReady: boolean = false): Promise<Activity[]> {
  const path = `orgs/${orgId}/activities`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const activitiesRef = collection(db, 'orgs', orgId, 'activities');
    const q = query(activitiesRef, where('leadId', '==', leadId));
    const snapshot = await getDocs(q);
    const activities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Activity[];
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    logFirestoreOperation('READ', path, orgId, true);
    return activities;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function fetchAllActivities(orgId: string, authReady: boolean = false, filterByUserId?: string): Promise<Activity[]> {
  const path = `orgs/${orgId}/activities`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const activitiesRef = collection(db, 'orgs', orgId, 'activities');
    // Use simple where() without orderBy to avoid requiring a composite index.
    const q = filterByUserId
      ? query(activitiesRef, where('userId', '==', filterByUserId))
      : query(activitiesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const activities = (snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Activity[]).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    
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

// ============================================
// Pipeline Action → Daily Plan Task Integration
// ============================================

/**
 * Log a pipeline action (call, email, sms, meeting, drop-in) and create
 * a corresponding completed task in the Daily Plan.
 * 
 * This ensures Pipeline actions drive Daily Plan progress.
 */
export async function logPipelineAction(
  orgId: string,
  activityData: {
    userId: string;  // This should be the lead owner's userId for proper Daily Plan attribution
    leadId: string;
    type: Activity['type'];
    leadName?: string;
    notes?: string;
  },
  authReady: boolean = false
): Promise<{ activity: Activity; task: Task }> {
  const now = new Date();
  const todayDDMMYYYY = getTodayDDMMYYYY();
  const todayKey = toPlanDateKey(todayDDMMYYYY);
  
  // Create the activity record
  const activity = await createActivity(orgId, {
    userId: activityData.userId,
    leadId: activityData.leadId,
    type: activityData.type,
    notes: activityData.notes,
    createdAt: now,
  }, authReady);
  
  // Map activity type to task type
  const taskType = activityTypeToTaskType(activityData.type);
  const timeSlot = getCurrentTimeSlot();
  const activityLabel = ACTIVITY_LABELS[activityData.type] || activityData.type;
  
  // Create a completed task for the Daily Plan
  // Note: userId must match lead.userId for proper Daily Plan attribution
  const task = await createPlanTask(orgId, {
    userId: activityData.userId,
    leadId: activityData.leadId,
    title: `${activityLabel}: ${activityData.leadName || 'Lead'}`,
    dueAt: now,
    status: 'completed',
    completedAt: now,
    createdAt: now,
    planDate: todayDDMMYYYY,
    planDateKey: todayKey,
    taskType: taskType,
    timeSlot: timeSlot,
    outcome: activityData.type === 'meeting' ? 'completed' : 'conversation',
  }, authReady);
  
  return { activity, task };
}

/**
 * Log a client action (call, email, meeting, check-in, etc.) and create
 * a corresponding completed task in the Daily Plan.
 * 
 * This ensures Client activities drive Daily Plan progress and are linked
 * to the client's history.
 */
export async function logClientAction(
  orgId: string,
  activityData: {
    userId: string;
    clientId: string;
    type: Activity['type'];
    clientName: string;
    notes?: string;
    metadata?: Record<string, any>;
  },
  authReady: boolean = false
): Promise<{ activity: Activity; task: Task }> {
  const now = new Date();
  const todayDDMMYYYY = getTodayDDMMYYYY();
  const todayKey = toPlanDateKey(todayDDMMYYYY);
  
  // Create the activity record linked to the client
  const activity = await createActivity(orgId, {
    userId: activityData.userId,
    clientId: activityData.clientId,
    type: activityData.type,
    notes: activityData.notes,
    metadata: activityData.metadata,
    createdAt: now,
  }, authReady);
  
  // Map activity type to task type - client activities are typically check-ins/delivery
  const taskType = activityTypeToTaskType(activityData.type);
  const timeSlot = getCurrentTimeSlot();
  const activityLabel = ACTIVITY_LABELS[activityData.type] || activityData.type;
  
  // Create a completed task for the Daily Plan
  const task = await createPlanTask(orgId, {
    userId: activityData.userId,
    clientId: activityData.clientId,
    title: `${activityLabel}: ${activityData.clientName}`,
    dueAt: now,
    status: 'completed',
    completedAt: now,
    createdAt: now,
    planDate: todayDDMMYYYY,
    planDateKey: todayKey,
    taskType: taskType,
    timeSlot: timeSlot,
    revenueLane: 'client',
    outcome: 'completed',
  }, authReady);
  
  return { activity, task };
}

/**
 * Create a pending task linked to a client for future action.
 */
export async function createClientTask(
  orgId: string,
  taskData: {
    userId: string;
    clientId: string;
    clientName: string;
    title: string;
    taskType: Task['taskType'];
    dueDate: string; // DD-MM-YYYY format
    notes?: string;
    // AI-enhanced fields
    aiEnhanced?: boolean;
    outcomeStatement?: string;
    checklist?: Task['checklist'];
    priority?: Task['priority'];
    suggestedFollowUp?: string;
    emailTemplate?: string;
    callScript?: string;
  },
  authReady: boolean = false
): Promise<Task> {
  const now = new Date();
  const planDateKey = toPlanDateKey(taskData.dueDate);
  
  const task = await createPlanTask(orgId, {
    userId: taskData.userId,
    clientId: taskData.clientId,
    title: taskData.title,
    dueAt: now,
    status: 'pending',
    createdAt: now,
    planDate: taskData.dueDate,
    planDateKey: planDateKey,
    taskType: taskData.taskType || 'check_in',
    revenueLane: 'client',
    // AI-enhanced fields
    ...(taskData.aiEnhanced && {
      aiEnhanced: true,
      outcomeStatement: taskData.outcomeStatement,
      checklist: taskData.checklist,
      priority: taskData.priority,
      suggestedFollowUp: taskData.suggestedFollowUp,
      emailTemplate: taskData.emailTemplate,
      callScript: taskData.callScript,
    }),
  }, authReady);
  
  // Also create an activity record to track task creation
  await createActivity(orgId, {
    userId: taskData.userId,
    clientId: taskData.clientId,
    type: 'followup',
    notes: `Task created: ${taskData.title}${taskData.notes ? ` - ${taskData.notes}` : ''}`,
    createdAt: now,
  }, authReady);
  
  return task;
}

/**
 * Add a note to a client's history (creates an activity entry).
 */
export async function addClientNote(
  orgId: string,
  noteData: {
    userId: string;
    clientId: string;
    notes: string;
  },
  authReady: boolean = false
): Promise<Activity> {
  const now = new Date();
  
  const activity = await createActivity(orgId, {
    userId: noteData.userId,
    clientId: noteData.clientId,
    type: 'followup', // Using followup as a general "note" activity type
    notes: noteData.notes,
    createdAt: now,
  }, authReady);
  
  return activity;
}

/**
 * Fetch activities for a specific client.
 */
export async function fetchClientActivities(
  orgId: string,
  clientId: string,
  authReady: boolean = false
): Promise<Activity[]> {
  const path = `orgs/${orgId}/activities`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const activitiesRef = collection(db, 'orgs', orgId, 'activities');
    const q = query(activitiesRef, where('clientId', '==', clientId));
    const snapshot = await getDocs(q);
    const activities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Activity[];
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    logFirestoreOperation('READ', path, orgId, true);
    return activities;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

/**
 * Fetch pending tasks for a specific client.
 */
export async function fetchClientTasks(
  orgId: string,
  clientId: string,
  authReady: boolean = false
): Promise<Task[]> {
  const path = `orgs/${orgId}/tasks`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const tasksRef = collection(db, 'orgs', orgId, 'tasks');
    const q = query(tasksRef, where('clientId', '==', clientId));
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Task[];
    tasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    
    logFirestoreOperation('READ', path, orgId, true);
    return tasks;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

/**
 * Fetch ALL tasks for the organization (for Task Overview Panel).
 * Returns tasks grouped by clientId for efficient state hydration.
 */
export async function fetchAllOrgTasks(
  orgId: string,
  authReady: boolean = false
): Promise<Record<string, Task[]>> {
  const path = `orgs/${orgId}/tasks`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return {};
  }
  
  try {
    const tasksRef = collection(db, 'orgs', orgId, 'tasks');
    const q = query(tasksRef, orderBy('dueAt', 'asc'));
    const snapshot = await getDocs(q);
    
    const tasksByClient: Record<string, Task[]> = {};
    snapshot.docs.forEach(doc => {
      const task = {
        id: doc.id,
        ...convertTimestampToDate(doc.data()),
      } as Task;
      
      if (task.clientId) {
        if (!tasksByClient[task.clientId]) {
          tasksByClient[task.clientId] = [];
        }
        tasksByClient[task.clientId].push(task);
      }
    });
    
    logFirestoreOperation('READ', path, orgId, true);
    return tasksByClient;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return {};
  }
}

// ============================================
// NBA (Next Best Action) Queue Functions
// ============================================

export async function fetchNBAQueue(orgId: string, authReady: boolean = false): Promise<NBAAction[]> {
  const path = `orgs/${orgId}/actionQueue`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const queueRef = collection(db, 'orgs', orgId, 'actionQueue');
    const q = query(queueRef, where('status', '==', 'open'), limit(50));
    const snapshot = await getDocs(q);
    const actions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as NBAAction[];
    actions.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    
    logFirestoreOperation('READ', path, orgId, true);
    return actions;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function fetchNBAAction(orgId: string, actionId: string, authReady: boolean = false): Promise<NBAAction | null> {
  const path = `orgs/${orgId}/actionQueue/${actionId}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'actionQueue', actionId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return { id: docSnap.id, ...convertTimestampToDate(docSnap.data()) } as NBAAction;
    }
    
    logFirestoreOperation('READ', path, orgId, true);
    return null;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function createNBAAction(orgId: string, action: Omit<NBAAction, 'id'>, authReady: boolean = false): Promise<NBAAction> {
  const path = `orgs/${orgId}/actionQueue`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create NBA action: not authenticated or no orgId');
  }
  
  try {
    const cleanedAction = removeUndefinedFields(action);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedAction,
      createdAt: now,
      updatedAt: now,
    });
    const queueRef = collection(db, 'orgs', orgId, 'actionQueue');
    const docRef = await addDoc(queueRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedAction, id: docRef.id, createdAt: now, updatedAt: now } as NBAAction;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateNBAAction(orgId: string, actionId: string, updates: Partial<NBAAction>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/actionQueue/${actionId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update NBA action: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'actionQueue', actionId);
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

export async function completeNBAAction(orgId: string, actionId: string, authReady: boolean = false): Promise<void> {
  await updateNBAAction(orgId, actionId, {
    status: 'done',
    updatedAt: new Date(),
  }, authReady);
}

export async function dismissNBAAction(orgId: string, actionId: string, reason: string, authReady: boolean = false): Promise<void> {
  const suppressUntil = new Date();
  suppressUntil.setHours(suppressUntil.getHours() + 48);
  
  await updateNBAAction(orgId, actionId, {
    status: 'dismissed',
    dismissedReason: reason,
    dismissedAt: new Date(),
    suppressUntil,
    updatedAt: new Date(),
  }, authReady);
}

export async function deleteNBAAction(orgId: string, actionId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/actionQueue/${actionId}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete NBA action: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'actionQueue', actionId);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

export async function checkNBADuplicate(orgId: string, fingerprint: string, authReady: boolean = false): Promise<boolean> {
  const path = `orgs/${orgId}/actionQueue`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return false;
  }
  
  try {
    const queueRef = collection(db, 'orgs', orgId, 'actionQueue');
    const q = query(queueRef, where('fingerprint', '==', fingerprint), limit(1));
    const snapshot = await getDocs(q);
    
    logFirestoreOperation('READ', path, orgId, true);
    return !snapshot.empty;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return false;
  }
}

// ============================================
// Lead History Functions
// ============================================

export async function fetchLeadHistory(orgId: string, leadId: string, authReady: boolean = false): Promise<LeadHistory[]> {
  const path = `orgs/${orgId}/leads/${leadId}/history`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const historyRef = collection(db, 'orgs', orgId, 'leads', leadId, 'history');
    const q = query(historyRef, orderBy('createdAt', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as LeadHistory[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return history;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createLeadHistoryEntry(
  orgId: string, 
  leadId: string, 
  entry: Omit<LeadHistory, 'id'>, 
  authReady: boolean = false
): Promise<LeadHistory> {
  const path = `orgs/${orgId}/leads/${leadId}/history`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create history entry: not authenticated or no orgId');
  }
  
  try {
    const cleanedEntry = removeUndefinedFields(entry);
    const dataToSave = convertDatesToTimestamp({
      ...cleanedEntry,
      createdAt: new Date(),
    });
    const historyRef = collection(db, 'orgs', orgId, 'leads', leadId, 'history');
    const docRef = await addDoc(historyRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedEntry, id: docRef.id, createdAt: new Date() } as LeadHistory;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Focus Mode Settings Functions
// ============================================

export async function fetchFocusModeSettings(userId: string, authReady: boolean = false): Promise<FocusModeSettings | null> {
  const path = `users/${userId}/settings/focusMode`;
  
  if (!authReady) {
    console.error('[Firestore] BLOCKED: READ - authReady is false. Path:', path);
    return null;
  }
  
  try {
    const docRef = doc(db, 'users', userId, 'settings', 'focusMode');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log('[Firestore] READ SUCCESS', { path, userId });
      return convertTimestampToDate(docSnap.data()) as FocusModeSettings;
    }
    
    return null;
  } catch (error: any) {
    console.error('[Firestore] READ FAILED', { path, userId, error });
    return null;
  }
}

export async function saveFocusModeSettings(
  userId: string, 
  settings: FocusModeSettings, 
  authReady: boolean = false
): Promise<void> {
  const path = `users/${userId}/settings/focusMode`;
  
  if (!authReady) {
    throw new Error('Cannot save focus mode: not authenticated');
  }
  
  try {
    const docRef = doc(db, 'users', userId, 'settings', 'focusMode');
    const dataToSave = convertDatesToTimestamp({
      ...settings,
      updatedAt: new Date(),
    });
    await updateDoc(docRef, dataToSave).catch(async () => {
      const { setDoc } = await import('./firebase');
      await setDoc(docRef, dataToSave);
    });
    
    console.log('[Firestore] WRITE SUCCESS', { path, userId });
  } catch (error: any) {
    console.error('[Firestore] WRITE FAILED', { path, userId, error });
    throw error;
  }
}

// ============================================
// Client Management Functions
// ============================================

export async function fetchClients(orgId: string, authReady: boolean = false, filterByUserId?: string): Promise<Client[]> {
  const path = `orgs/${orgId}/clients`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const clientsRef = collection(db, 'orgs', orgId, 'clients');
    // Use simple where() without orderBy to avoid requiring a composite index.
    const q = filterByUserId
      ? query(clientsRef, where('userId', '==', filterByUserId))
      : query(clientsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const clients = snapshot.docs.map(doc => {
      const clientData = {
        id: doc.id,
        ...convertTimestampToDate(doc.data()),
      } as Client;
      // Recalculate health on load to ensure it's current
      const healthResult = calculateClientHealth(clientData);
      return {
        ...clientData,
        churnRiskScore: healthResult.churnRiskScore,
        healthStatus: healthResult.healthStatus,
        healthReasons: healthResult.healthReasons,
      };
    }).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    
    logFirestoreOperation('READ', path, orgId, true);
    return clients;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function fetchClient(orgId: string, id: string, authReady: boolean = false): Promise<Client | null> {
  const path = `orgs/${orgId}/clients/${id}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      const clientData = { id: docSnap.id, ...convertTimestampToDate(docSnap.data()) } as Client;
      // Recalculate health on load to ensure it's current
      const healthResult = calculateClientHealth(clientData);
      return {
        ...clientData,
        churnRiskScore: healthResult.churnRiskScore,
        healthStatus: healthResult.healthStatus,
        healthReasons: healthResult.healthReasons,
      };
    }
    
    logFirestoreOperation('READ', path, orgId, true);
    return null;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function createClient(orgId: string, client: Omit<Client, 'id'>, authReady: boolean = false): Promise<Client> {
  const path = `orgs/${orgId}/clients`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create client: not authenticated or no orgId');
  }
  
  try {
    const cleanedClient = removeUndefinedFields(client);
    const dataToSave = convertDatesToTimestamp({
      ...cleanedClient,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const clientsRef = collection(db, 'orgs', orgId, 'clients');
    const docRef = await addDoc(clientsRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedClient, id: docRef.id, createdAt: new Date(), updatedAt: new Date() } as Client;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateClientInFirestore(orgId: string, id: string, updates: Partial<Client>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${id}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update client: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', id);
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

export async function recalculateClientHealth(orgId: string, client: Client, authReady: boolean = false): Promise<Client> {
  const healthResult = calculateClientHealth(client);
  const updates = {
    churnRiskScore: healthResult.churnRiskScore,
    healthStatus: healthResult.healthStatus,
    healthReasons: healthResult.healthReasons,
    updatedAt: new Date(),
  };
  
  await updateClientInFirestore(orgId, client.id, updates, authReady);
  
  return {
    ...client,
    ...updates,
  };
}

export async function deleteClientFromFirestore(orgId: string, id: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${id}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete client: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', id);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchClientHistory(orgId: string, clientId: string, authReady: boolean = false): Promise<ClientHistory[]> {
  const path = `orgs/${orgId}/clients/${clientId}/history`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const historyRef = collection(db, 'orgs', orgId, 'clients', clientId, 'history');
    const q = query(historyRef, orderBy('createdAt', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as ClientHistory[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return history;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createClientHistoryEntry(
  orgId: string, 
  clientId: string, 
  entry: Omit<ClientHistory, 'id'>, 
  authReady: boolean = false
): Promise<ClientHistory> {
  const path = `orgs/${orgId}/clients/${clientId}/history`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create client history entry: not authenticated or no orgId');
  }
  
  try {
    const cleanedEntry = removeUndefinedFields(entry);
    const dataToSave = convertDatesToTimestamp({
      ...cleanedEntry,
      createdAt: new Date(),
    });
    const historyRef = collection(db, 'orgs', orgId, 'clients', clientId, 'history');
    const docRef = await addDoc(historyRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedEntry, id: docRef.id, createdAt: new Date() } as ClientHistory;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Deliverables (Project Tracking) Functions
// ============================================

export async function fetchDeliverables(orgId: string, clientId: string, authReady: boolean = false): Promise<Deliverable[]> {
  const path = `orgs/${orgId}/clients/${clientId}/deliverables`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const deliverablesRef = collection(db, 'orgs', orgId, 'clients', clientId, 'deliverables');
    const q = query(deliverablesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const deliverables = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Deliverable[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return deliverables;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function fetchDeliverable(orgId: string, clientId: string, deliverableId: string, authReady: boolean = false): Promise<Deliverable | null> {
  const path = `orgs/${orgId}/clients/${clientId}/deliverables/${deliverableId}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'deliverables', deliverableId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return { id: docSnap.id, ...convertTimestampToDate(docSnap.data()) } as Deliverable;
    }
    
    logFirestoreOperation('READ', path, orgId, true);
    return null;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function createDeliverable(orgId: string, clientId: string, deliverable: Omit<Deliverable, 'id'>, authReady: boolean = false): Promise<Deliverable> {
  const path = `orgs/${orgId}/clients/${clientId}/deliverables`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create deliverable: not authenticated or no orgId');
  }
  
  try {
    const cleanedDeliverable = removeUndefinedFields(deliverable);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedDeliverable,
      createdAt: now,
      updatedAt: now,
    });
    const deliverablesRef = collection(db, 'orgs', orgId, 'clients', clientId, 'deliverables');
    const docRef = await addDoc(deliverablesRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedDeliverable, id: docRef.id, createdAt: now, updatedAt: now } as Deliverable;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateDeliverable(orgId: string, clientId: string, deliverableId: string, updates: Partial<Deliverable>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/deliverables/${deliverableId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update deliverable: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'deliverables', deliverableId);
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

export async function deleteDeliverable(orgId: string, clientId: string, deliverableId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/deliverables/${deliverableId}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete deliverable: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'deliverables', deliverableId);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Strategy Session Functions
// ============================================

export async function fetchStrategySessions(orgId: string, clientId: string, authReady: boolean = false): Promise<StrategySession[]> {
  const path = `orgs/${orgId}/clients/${clientId}/strategySessions`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const sessionsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'strategySessions');
    const q = query(sessionsRef, orderBy('sessionDate', 'desc'));
    const snapshot = await getDocs(q);
    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as StrategySession[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return sessions;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createStrategySession(orgId: string, clientId: string, session: Omit<StrategySession, 'id'>, authReady: boolean = false): Promise<StrategySession> {
  const path = `orgs/${orgId}/clients/${clientId}/strategySessions`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create strategy session: not authenticated or no orgId');
  }
  
  try {
    const cleanedSession = removeUndefinedFields(session);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedSession,
      createdAt: now,
    });
    const sessionsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'strategySessions');
    const docRef = await addDoc(sessionsRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedSession, id: docRef.id, createdAt: now } as StrategySession;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateStrategySession(orgId: string, clientId: string, sessionId: string, updates: Partial<StrategySession>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategySessions/${sessionId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update strategy session: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategySessions', sessionId);
    const cleanedUpdates = removeUndefinedFields(updates);
    const dataToUpdate = convertDatesToTimestamp(cleanedUpdates);
    await updateDoc(docRef, dataToUpdate);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function deleteStrategySession(orgId: string, clientId: string, sessionId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategySessions/${sessionId}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete strategy session: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategySessions', sessionId);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Strategy Plan Functions
// ============================================

export async function fetchStrategyPlan(orgId: string, clientId: string, authReady: boolean = false): Promise<StrategyPlan | null> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyPlan`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyPlan', 'current');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return { id: docSnap.id, ...convertTimestampToDate(docSnap.data()) } as StrategyPlan;
    }
    
    logFirestoreOperation('READ', path, orgId, true);
    return null;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function saveStrategyPlan(orgId: string, clientId: string, plan: Omit<StrategyPlan, 'id'>, authReady: boolean = false): Promise<StrategyPlan> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyPlan/current`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save strategy plan: not authenticated or no orgId');
  }
  
  try {
    const cleanedPlan = removeUndefinedFields(plan);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedPlan,
      updatedAt: now,
      createdAt: plan.createdAt || now,
    });
    
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyPlan', 'current');
    
    const { setDoc } = await import('./firebase');
    await setDoc(docRef, dataToSave, { merge: true });
    
    logFirestoreOperation('WRITE', path, orgId, true);
    return { ...cleanedPlan, id: 'current', createdAt: plan.createdAt || now, updatedAt: now } as StrategyPlan;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function deleteStrategyPlan(orgId: string, clientId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyPlan/current`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete strategy plan: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyPlan', 'current');
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Content Draft Functions
// ============================================

export async function fetchContentDrafts(orgId: string, clientId: string, authReady: boolean = false): Promise<ContentDraft[]> {
  const path = `orgs/${orgId}/clients/${clientId}/contentDrafts`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const draftsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'contentDrafts');
    const q = query(draftsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const drafts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as ContentDraft[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return drafts;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createContentDraft(orgId: string, clientId: string, draft: Omit<ContentDraft, 'id'>, authReady: boolean = false): Promise<ContentDraft> {
  const path = `orgs/${orgId}/clients/${clientId}/contentDrafts`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create content draft: not authenticated or no orgId');
  }
  
  try {
    const cleanedDraft = removeUndefinedFields(draft);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedDraft,
      createdAt: now,
      updatedAt: now,
    });
    const draftsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'contentDrafts');
    const docRef = await addDoc(draftsRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedDraft, id: docRef.id, createdAt: now, updatedAt: now } as ContentDraft;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateContentDraft(orgId: string, clientId: string, draftId: string, updates: Partial<ContentDraft>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/contentDrafts/${draftId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update content draft: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'contentDrafts', draftId);
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

export async function deleteContentDraft(orgId: string, clientId: string, draftId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/contentDrafts/${draftId}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete content draft: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'contentDrafts', draftId);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Strategy Plans Collection (versioned)
// ============================================

export async function fetchStrategyPlans(orgId: string, clientId: string, authReady: boolean = false): Promise<StrategyPlan[]> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyPlans`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const plansRef = collection(db, 'orgs', orgId, 'clients', clientId, 'strategyPlans');
    const q = query(plansRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const plans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as StrategyPlan[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return plans;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createStrategyPlanVersioned(orgId: string, clientId: string, plan: Omit<StrategyPlan, 'id'>, authReady: boolean = false): Promise<StrategyPlan> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyPlans`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create strategy plan: not authenticated or no orgId');
  }
  
  try {
    const cleanedPlan = removeUndefinedFields(plan);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedPlan,
      createdAt: now,
      updatedAt: now,
    });
    const plansRef = collection(db, 'orgs', orgId, 'clients', clientId, 'strategyPlans');
    const docRef = await addDoc(plansRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedPlan, id: docRef.id, createdAt: now, updatedAt: now } as StrategyPlan;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateStrategyPlanVersioned(orgId: string, clientId: string, planId: string, updates: Partial<StrategyPlan>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyPlans/${planId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update strategy plan: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyPlans', planId);
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

// ============================================
// Channel Insights Functions (Evidence-Driven)
// ============================================

export async function fetchChannelInsights(orgId: string, clientId: string, authReady: boolean = false): Promise<ChannelInsight[]> {
  const path = `orgs/${orgId}/clients/${clientId}/insights`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const insightsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'insights');
    const q = query(insightsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const insights = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as ChannelInsight[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return insights;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function fetchChannelInsight(orgId: string, clientId: string, channel: InsightChannel, authReady: boolean = false): Promise<ChannelInsight | null> {
  const path = `orgs/${orgId}/clients/${clientId}/insights/${channel}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'insights', channel);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return { id: docSnap.id, ...convertTimestampToDate(docSnap.data()) } as ChannelInsight;
    }
    
    logFirestoreOperation('READ', path, orgId, true);
    return null;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function saveChannelInsight(orgId: string, clientId: string, insight: Omit<ChannelInsight, 'id'>, authReady: boolean = false): Promise<ChannelInsight> {
  const path = `orgs/${orgId}/clients/${clientId}/insights/${insight.channel}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save channel insight: not authenticated or no orgId');
  }
  
  try {
    const cleanedInsight = removeUndefinedFields(insight);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedInsight,
      updatedAt: now,
      createdAt: insight.createdAt || now,
    });
    
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'insights', insight.channel);
    
    const { setDoc } = await import('./firebase');
    await setDoc(docRef, dataToSave, { merge: true });
    
    logFirestoreOperation('WRITE', path, orgId, true);
    return { ...cleanedInsight, id: insight.channel, createdAt: insight.createdAt || now, updatedAt: now } as ChannelInsight;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Analytics Snapshots Functions
// ============================================

export async function fetchAnalyticsSnapshots(orgId: string, clientId: string, authReady: boolean = false): Promise<AnalyticsSnapshot[]> {
  const path = `orgs/${orgId}/clients/${clientId}/analyticsSnapshots`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const snapshotsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'analyticsSnapshots');
    const q = query(snapshotsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const snapshots = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as AnalyticsSnapshot[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return snapshots;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createAnalyticsSnapshot(orgId: string, clientId: string, snapshot: Omit<AnalyticsSnapshot, 'id'>, authReady: boolean = false): Promise<AnalyticsSnapshot> {
  const path = `orgs/${orgId}/clients/${clientId}/analyticsSnapshots`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create analytics snapshot: not authenticated or no orgId');
  }
  
  try {
    const cleanedSnapshot = removeUndefinedFields(snapshot);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedSnapshot,
      createdAt: now,
    });
    const snapshotsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'analyticsSnapshots');
    const docRef = await addDoc(snapshotsRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedSnapshot, id: docRef.id, createdAt: now } as AnalyticsSnapshot;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function deleteAnalyticsSnapshot(orgId: string, clientId: string, snapshotId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/analyticsSnapshots/${snapshotId}`;
  
  if (!checkAuthReady(orgId, authReady, 'DELETE', path)) {
    throw new Error('Cannot delete analytics snapshot: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'analyticsSnapshots', snapshotId);
    await deleteDoc(docRef);
    
    logFirestoreOperation('DELETE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('DELETE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Evidence Tasks Functions
// ============================================

export async function fetchEvidenceTasks(orgId: string, clientId: string, authReady: boolean = false): Promise<EvidenceTask[]> {
  const path = `orgs/${orgId}/clients/${clientId}/evidenceTasks`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const tasksRef = collection(db, 'orgs', orgId, 'clients', clientId, 'evidenceTasks');
    const q = query(tasksRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as EvidenceTask[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return tasks;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createEvidenceTask(orgId: string, clientId: string, task: Omit<EvidenceTask, 'id'>, authReady: boolean = false): Promise<EvidenceTask> {
  const path = `orgs/${orgId}/clients/${clientId}/evidenceTasks`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create evidence task: not authenticated or no orgId');
  }
  
  try {
    const cleanedTask = removeUndefinedFields(task);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedTask,
      createdAt: now,
      updatedAt: now,
    });
    const tasksRef = collection(db, 'orgs', orgId, 'clients', clientId, 'evidenceTasks');
    const docRef = await addDoc(tasksRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedTask, id: docRef.id, createdAt: now, updatedAt: now } as EvidenceTask;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateEvidenceTask(orgId: string, clientId: string, taskId: string, updates: Partial<EvidenceTask>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/evidenceTasks/${taskId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update evidence task: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'evidenceTasks', taskId);
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

// ============================================
// Daily Plan Functions (Firestore-Backed)
// ============================================

export async function fetchDailyPlan(orgId: string, userId: string, planDate: string, authReady: boolean = false): Promise<DailyPlanDoc | null> {
  const docId = `${orgId}_${userId}_${planDate}`;
  const path = `orgs/${orgId}/dailyPlans/${docId}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'dailyPlans', docId);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const data = { id: snapshot.id, ...convertTimestampToDate(snapshot.data()) } as DailyPlanDoc;
    logFirestoreOperation('READ', path, orgId, true);
    return data;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function upsertDailyPlan(orgId: string, userId: string, planDate: string, data: Partial<DailyPlanDoc>, authReady: boolean = false): Promise<DailyPlanDoc> {
  const docId = `${orgId}_${userId}_${planDate}`;
  const path = `orgs/${orgId}/dailyPlans/${docId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot upsert daily plan: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'dailyPlans', docId);
    const existing = await getDoc(docRef);
    const now = new Date();
    
    let finalData: DailyPlanDoc;
    if (existing.exists()) {
      const cleanedData = removeUndefinedFields(data);
      const dataToUpdate = convertDatesToTimestamp({
        ...cleanedData,
        updatedAt: now,
      });
      await updateDoc(docRef, dataToUpdate);
      finalData = { ...convertTimestampToDate(existing.data()), ...cleanedData, id: docId, updatedAt: now } as DailyPlanDoc;
    } else {
      const newDoc = createDefaultDailyPlanDoc(planDate, orgId, userId);
      const mergedData = { ...newDoc, ...removeUndefinedFields(data), createdAt: now, updatedAt: now };
      const dataToSave = convertDatesToTimestamp(mergedData);
      await setDoc(docRef, dataToSave);
      finalData = mergedData;
    }
    
    logFirestoreOperation('WRITE', path, orgId, true);
    return finalData;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateDailyPlanSection(
  orgId: string, 
  userId: string, 
  planDate: string, 
  section: 'timeBlocks' | 'targets' | 'routeStops' | 'battleScoreEarned',
  value: any,
  authReady: boolean = false
): Promise<void> {
  const docId = `${orgId}_${userId}_${planDate}`;
  const path = `orgs/${orgId}/dailyPlans/${docId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update daily plan section: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'dailyPlans', docId);
    const dataToUpdate = convertDatesToTimestamp({
      [section]: value,
      updatedAt: new Date(),
    });
    await updateDoc(docRef, dataToUpdate);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// AI Brief Functions
// ============================================

export async function fetchAIBrief(orgId: string, userId: string, planDate: string, authReady: boolean = false): Promise<AIBrief | null> {
  const docId = `${orgId}_${userId}_${planDate}`;
  const path = `orgs/${orgId}/aiBriefs/${docId}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'aiBriefs', docId);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const data = { id: snapshot.id, ...convertTimestampToDate(snapshot.data()) } as AIBrief;
    logFirestoreOperation('READ', path, orgId, true);
    return data;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function saveAIBrief(orgId: string, userId: string, brief: AIBrief, authReady: boolean = false): Promise<void> {
  const docId = `${orgId}_${userId}_${brief.planDate}`;
  const path = `orgs/${orgId}/aiBriefs/${docId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save AI brief: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'aiBriefs', docId);
    const dataToSave = convertDatesToTimestamp({ ...brief, id: docId });
    await setDoc(docRef, dataToSave);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// AI Debrief Functions
// ============================================

export async function fetchAIDebrief(orgId: string, userId: string, planDate: string, authReady: boolean = false): Promise<AIDebrief | null> {
  const docId = `${orgId}_${userId}_${planDate}`;
  const path = `orgs/${orgId}/aiDebriefs/${docId}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'aiDebriefs', docId);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const data = { id: snapshot.id, ...convertTimestampToDate(snapshot.data()) } as AIDebrief;
    logFirestoreOperation('READ', path, orgId, true);
    return data;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function saveAIDebrief(orgId: string, userId: string, debrief: AIDebrief, authReady: boolean = false): Promise<void> {
  const docId = `${orgId}_${userId}_${debrief.planDate}`;
  const path = `orgs/${orgId}/aiDebriefs/${docId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save AI debrief: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'aiDebriefs', docId);
    const dataToSave = convertDatesToTimestamp({ ...debrief, id: docId });
    await setDoc(docRef, dataToSave);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// User Daily Settings Functions
// ============================================

export async function fetchUserDailySettings(orgId: string, userId: string, authReady: boolean = false): Promise<UserDailySettings | null> {
  const path = `orgs/${orgId}/userSettings/${userId}`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'userSettings', userId);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const data = { id: snapshot.id, ...convertTimestampToDate(snapshot.data()) } as UserDailySettings;
    logFirestoreOperation('READ', path, orgId, true);
    return data;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function saveUserDailySettings(orgId: string, userId: string, settings: Omit<UserDailySettings, 'id' | 'userId' | 'orgId'>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/userSettings/${userId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save user settings: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'userSettings', userId);
    const dataToSave = convertDatesToTimestamp({
      ...settings,
      id: userId,
      userId,
      orgId,
      updatedAt: new Date(),
    });
    await setDoc(docRef, dataToSave, { merge: true });
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Plan Tasks Functions (Tasks with planDate)
// ============================================

export async function fetchPlanTasks(orgId: string, userId: string, planDate: string, authReady: boolean = false): Promise<Task[]> {
  const path = `orgs/${orgId}/tasks`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const tasksRef = collection(db, 'orgs', orgId, 'tasks');
    const q = query(
      tasksRef, 
      where('userId', '==', userId),
      where('planDate', '==', planDate),
      orderBy('sortOrder', 'asc')
    );
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Task[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return tasks;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function createPlanTask(orgId: string, task: Omit<Task, 'id'>, authReady: boolean = false): Promise<Task> {
  const path = `orgs/${orgId}/tasks`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot create task: not authenticated or no orgId');
  }
  
  try {
    const cleanedTask = removeUndefinedFields(task);
    const now = new Date();
    const dataToSave = convertDatesToTimestamp({
      ...cleanedTask,
      createdAt: now,
    });
    const tasksRef = collection(db, 'orgs', orgId, 'tasks');
    const docRef = await addDoc(tasksRef, dataToSave);
    
    logFirestoreOperation('WRITE', `${path}/${docRef.id}`, orgId, true);
    return { ...cleanedTask, id: docRef.id, createdAt: now } as Task;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updatePlanTask(orgId: string, taskId: string, updates: Partial<Task>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/tasks/${taskId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update task: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'tasks', taskId);
    const cleanedUpdates = removeUndefinedFields(updates);
    const dataToUpdate = convertDatesToTimestamp(cleanedUpdates);
    await updateDoc(docRef, dataToUpdate);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchOverdueTasks(orgId: string, userId: string, beforeDate: string, authReady: boolean = false): Promise<Task[]> {
  const path = `orgs/${orgId}/tasks`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const tasksRef = collection(db, 'orgs', orgId, 'tasks');
    const q = query(
      tasksRef, 
      where('userId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('dueAt', 'asc')
    );
    const snapshot = await getDocs(q);
    const allTasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as Task[];
    
    const tasks = allTasks.filter(t => {
      if (!t.planDate) return false;
      const [d1, m1, y1] = t.planDate.split('-').map(Number);
      const [d2, m2, y2] = beforeDate.split('-').map(Number);
      const date1 = new Date(y1, m1 - 1, d1);
      const date2 = new Date(y2, m2 - 1, d2);
      return date1 < date2;
    });
    
    logFirestoreOperation('READ', path, orgId, true);
    return tasks;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

// ============================================
// Task Load Functions (for Smart Scheduling)
// ============================================

/**
 * Fetch task counts per day for a date range (for workload balancing).
 * Returns { "YYYY-MM-DD": count, ... }
 */
export async function fetchTaskLoadByDateRange(
  orgId: string, 
  userId: string, 
  startDate: Date, 
  endDate: Date, 
  authReady: boolean = false
): Promise<Record<string, number>> {
  const path = `orgs/${orgId}/tasks`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return {};
  }
  
  try {
    const tasksRef = collection(db, 'orgs', orgId, 'tasks');
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];
    
    const q = query(
      tasksRef, 
      where('userId', '==', userId),
      where('planDateKey', '>=', startKey),
      where('planDateKey', '<=', endKey)
    );
    const snapshot = await getDocs(q);
    
    const taskLoad: Record<string, number> = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const dateKey = data.planDateKey;
      if (dateKey) {
        taskLoad[dateKey] = (taskLoad[dateKey] || 0) + 1;
      }
    });
    
    logFirestoreOperation('READ', path, orgId, true);
    return taskLoad;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return {};
  }
}

// ============================================
// Action Recommendations Functions
// ============================================

export async function fetchActionRecommendations(orgId: string, userId: string, planDate: string, authReady: boolean = false): Promise<PlanActionRecommendation[]> {
  const path = `orgs/${orgId}/actionRecommendations`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const recsRef = collection(db, 'orgs', orgId, 'actionRecommendations');
    const q = query(
      recsRef,
      where('planDate', '==', planDate),
      where('userId', '==', userId),
      orderBy('priorityScore', 'desc')
    );
    const snapshot = await getDocs(q);
    const recs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as PlanActionRecommendation[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return recs;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function saveActionRecommendations(orgId: string, userId: string, planDate: string, recommendations: PlanActionRecommendation[], authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/actionRecommendations`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save action recommendations: not authenticated or no orgId');
  }
  
  try {
    for (const rec of recommendations) {
      const docId = `${orgId}_${userId}_${planDate}_${rec.id}`;
      const docRef = doc(db, 'orgs', orgId, 'actionRecommendations', docId);
      const dataToSave = convertDatesToTimestamp({
        ...rec,
        planDate,
        userId,
        id: docId,
      });
      await setDoc(docRef, dataToSave);
    }
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateActionRecommendation(orgId: string, recId: string, updates: Partial<PlanActionRecommendation>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/actionRecommendations/${recId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update action recommendation: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'actionRecommendations', recId);
    const cleanedUpdates = removeUndefinedFields(updates);
    await updateDoc(docRef, cleanedUpdates);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Strategy Engine Functions
// ============================================

export async function fetchStrategyEngineState(orgId: string, clientId: string, authReady: boolean = false): Promise<StrategyEngineState | null> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyEngine/state`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyEngine', 'state');
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const data = convertTimestampToDate(snapshot.data()) as StrategyEngineState;
    logFirestoreOperation('READ', path, orgId, true);
    return data;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function saveStrategyEngineState(orgId: string, clientId: string, state: StrategyEngineState, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyEngine/state`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save strategy engine state: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyEngine', 'state');
    const dataToSave = convertDatesToTimestamp(state);
    await setDoc(docRef, dataToSave);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchStrategyEngineOutput(orgId: string, clientId: string, authReady: boolean = false): Promise<StrategyEngineOutput | null> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyEngine/output`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyEngine', 'output');
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const data = convertTimestampToDate(snapshot.data()) as StrategyEngineOutput;
    logFirestoreOperation('READ', path, orgId, true);
    return data;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function saveStrategyEngineOutput(orgId: string, clientId: string, output: StrategyEngineOutput, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyEngine/output`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save strategy engine output: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyEngine', 'output');
    const dataToSave = convertDatesToTimestamp(output);
    await setDoc(docRef, dataToSave);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchStrategyActions(orgId: string, clientId: string, authReady: boolean = false): Promise<StrategyAction[]> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyActions`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const actionsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'strategyActions');
    const q = query(actionsRef, orderBy('priority', 'asc'));
    const snapshot = await getDocs(q);
    const actions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as StrategyAction[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return actions;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function saveStrategyActions(orgId: string, clientId: string, actions: StrategyAction[], authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyActions`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save strategy actions: not authenticated or no orgId');
  }
  
  try {
    for (const action of actions) {
      const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyActions', action.id);
      // Sanitize: set optional fields to null if undefined, then remove any remaining undefined fields
      const sanitizedAction = {
        ...action,
        suggestedDueDate: action.suggestedDueDate ?? null,
        convertedTaskId: action.convertedTaskId ?? null,
      };
      const cleanedAction = removeUndefinedFields(sanitizedAction);
      const dataToSave = convertDatesToTimestamp(cleanedAction);
      await setDoc(docRef, dataToSave);
    }
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateStrategyAction(orgId: string, clientId: string, actionId: string, updates: Partial<StrategyAction>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/strategyActions/${actionId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update strategy action: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'strategyActions', actionId);
    const cleanedUpdates = removeUndefinedFields(updates);
    await updateDoc(docRef, cleanedUpdates);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

// ============================================
// Client App Integration System
// ============================================

import type { PairingCode, ClientIntegration, IntegrationEvent } from './types';

export async function savePairingCode(orgId: string, pairingCode: PairingCode, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/pairingCodes/${pairingCode.id}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save pairing code: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'pairingCodes', pairingCode.id);
    const dataToSave = convertDatesToTimestamp(removeUndefinedFields(pairingCode));
    await setDoc(docRef, dataToSave);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchPairingCodeByCode(orgId: string, code: string, authReady: boolean = false): Promise<PairingCode | null> {
  const path = `orgs/${orgId}/pairingCodes`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const codesRef = collection(db, 'orgs', orgId, 'pairingCodes');
    const q = query(codesRef, where('code', '==', code), where('status', '==', 'pending'), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    const docData = snapshot.docs[0];
    const pairingCode = {
      id: docData.id,
      ...convertTimestampToDate(docData.data()),
    } as PairingCode;
    
    logFirestoreOperation('READ', path, orgId, true);
    return pairingCode;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function fetchPendingPairingCodeForClient(orgId: string, clientId: string, authReady: boolean = false): Promise<PairingCode | null> {
  const path = `orgs/${orgId}/pairingCodes`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return null;
  }
  
  try {
    const codesRef = collection(db, 'orgs', orgId, 'pairingCodes');
    // Query by clientId only to avoid composite index requirement
    // Then filter by status client-side
    const q = query(
      codesRef, 
      where('clientId', '==', clientId)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      logFirestoreOperation('READ', path, orgId, true);
      return null;
    }
    
    // Find the most recent pending code that hasn't expired
    const now = new Date();
    let validCode: PairingCode | null = null;
    
    for (const docData of snapshot.docs) {
      const pairingCode = {
        id: docData.id,
        ...convertTimestampToDate(docData.data()),
      } as PairingCode;
      
      // Skip non-pending codes
      if (pairingCode.status !== 'pending') continue;
      
      // Check if expired - mark it as expired in Firestore
      if (now > pairingCode.expiresAt) {
        try {
          const docRef = doc(db, 'orgs', orgId, 'pairingCodes', pairingCode.id);
          await updateDoc(docRef, { status: 'expired' });
        } catch (e) {
          console.warn('Failed to mark pairing code as expired:', e);
        }
        continue;
      }
      
      // Found a valid pending code
      if (!validCode || pairingCode.createdAt > validCode.createdAt) {
        validCode = pairingCode;
      }
    }
    
    logFirestoreOperation('READ', path, orgId, true);
    return validCode;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return null;
  }
}

export async function markPairingCodeUsed(orgId: string, pairingCodeId: string, appId: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/pairingCodes/${pairingCodeId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update pairing code: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'pairingCodes', pairingCodeId);
    await updateDoc(docRef, {
      status: 'used',
      usedAt: Timestamp.fromDate(new Date()),
      usedByAppId: appId
    });
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function saveClientIntegration(orgId: string, integration: ClientIntegration, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${integration.clientId}/integrations/${integration.id}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save integration: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', integration.clientId, 'integrations', integration.id);
    const dataToSave = convertDatesToTimestamp(removeUndefinedFields(integration));
    await setDoc(docRef, dataToSave);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchClientIntegrations(orgId: string, clientId: string, authReady: boolean = false): Promise<ClientIntegration[]> {
  const path = `orgs/${orgId}/clients/${clientId}/integrations`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const integrationsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'integrations');
    const q = query(integrationsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const integrations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as ClientIntegration[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return integrations;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function updateClientIntegration(orgId: string, clientId: string, integrationId: string, updates: Partial<ClientIntegration>, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/integrations/${integrationId}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot update integration: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'integrations', integrationId);
    const cleanedUpdates = removeUndefinedFields(updates);
    await updateDoc(docRef, cleanedUpdates);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function saveIntegrationEvent(orgId: string, clientId: string, event: IntegrationEvent, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/integrationEvents/${event.id}`;
  
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) {
    throw new Error('Cannot save event: not authenticated or no orgId');
  }
  
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'integrationEvents', event.id);
    const dataToSave = convertDatesToTimestamp(removeUndefinedFields(event));
    await setDoc(docRef, dataToSave);
    
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function fetchRecentIntegrationEvents(orgId: string, clientId: string, limitCount: number = 20, authReady: boolean = false): Promise<IntegrationEvent[]> {
  const path = `orgs/${orgId}/clients/${clientId}/integrationEvents`;
  
  if (!checkAuthReady(orgId, authReady, 'READ', path)) {
    return [];
  }
  
  try {
    const eventsRef = collection(db, 'orgs', orgId, 'clients', clientId, 'integrationEvents');
    const q = query(eventsRef, orderBy('receivedAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestampToDate(doc.data()),
    })) as IntegrationEvent[];
    
    logFirestoreOperation('READ', path, orgId, true);
    return events;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

// ============================================================
// AI Actions — subcollection: orgs/{orgId}/clients/{clientId}/aiActions
// ============================================================

export async function fetchClientAIActions(orgId: string, clientId: string, authReady: boolean = false, limitCount = 20): Promise<AIAction[]> {
  const path = `orgs/${orgId}/clients/${clientId}/aiActions`;
  if (!checkAuthReady(orgId, authReady, 'READ', path)) return [];
  try {
    const ref = collection(db, 'orgs', orgId, 'clients', clientId, 'aiActions');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    const actions = snap.docs.map(d => ({ id: d.id, ...convertTimestampToDate(d.data()) })) as AIAction[];
    logFirestoreOperation('READ', path, orgId, true);
    return actions;
  } catch (error: any) {
    logFirestoreOperation('READ', path, orgId, false, error);
    return [];
  }
}

export async function addClientAIAction(orgId: string, clientId: string, action: Omit<AIAction, 'id'>, authReady: boolean = false): Promise<string> {
  const path = `orgs/${orgId}/clients/${clientId}/aiActions`;
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) throw new Error('Not authenticated');
  try {
    const ref = collection(db, 'orgs', orgId, 'clients', clientId, 'aiActions');
    const docRef = await addDoc(ref, convertDatesToTimestamp(action));
    logFirestoreOperation('WRITE', path, orgId, true);
    return docRef.id;
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function updateClientAIActionStatus(orgId: string, clientId: string, actionId: string, status: AIAction['status'], outcome?: string, authReady: boolean = false): Promise<void> {
  const path = `orgs/${orgId}/clients/${clientId}/aiActions/${actionId}`;
  if (!checkAuthReady(orgId, authReady, 'WRITE', path)) throw new Error('Not authenticated');
  try {
    const docRef = doc(db, 'orgs', orgId, 'clients', clientId, 'aiActions', actionId);
    const update: any = { status };
    if (status === 'done' || status === 'rejected') update.completedAt = Timestamp.fromDate(new Date());
    if (outcome) update.outcome = outcome;
    await updateDoc(docRef, update);
    logFirestoreOperation('WRITE', path, orgId, true);
  } catch (error: any) {
    logFirestoreOperation('WRITE', path, orgId, false, error);
    throw error;
  }
}

export async function computeIntelligenceScore(client: Client): Promise<{ overall: number; understanding: number; execution: number; performance: number; learning: number }> {
  let understanding = 0;
  if (client.clientOnboarding?.businessOverview) understanding += 20;
  if (client.clientOnboarding?.keyServices) understanding += 20;
  if (client.clientOnboarding?.targetCustomers) understanding += 15;
  if (client.gbpLocationName) understanding += 15;
  if (client.website) understanding += 15;
  if (client.clientOnboarding?.locations) understanding += 15;

  let execution = 0;
  const es = client.executionStatus;
  const channels = [es?.website, es?.seo, es?.gbp, es?.ads];
  channels.forEach(ch => {
    if (ch?.status === 'active') execution += 25;
    else if (ch?.status === 'in_progress') execution += 15;
    else if (ch?.status === 'ready') execution += 5;
  });

  let performance = 0;
  const health = client.healthStatus;
  if (health === 'green') performance = 80;
  else if (health === 'amber') performance = 50;
  else performance = 20;
  if (client.localFalconPlaceId) performance = Math.min(100, performance + 20);

  const learning = 20;

  const overall = Math.round((understanding + execution + performance + learning) / 4);
  return { overall, understanding, execution, performance, learning };
}

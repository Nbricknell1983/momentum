import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  type User 
} from '@/lib/firebase';

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  orgId: string | null;
  loading: boolean;
  authReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    console.log('[Auth] Setting up onAuthStateChanged listener');
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      console.log('[Auth] onAuthStateChanged fired, user:', firebaseUser?.uid || 'null');
      
      setAuthReady(false);
      
      if (firebaseUser) {
        const authUser: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        setUser(authUser);
        
        try {
          console.log('[Auth] Resolving org for user:', firebaseUser.uid);
          const resolvedOrgId = await resolveOrCreateOrg(firebaseUser);
          console.log('[Auth] Resolved orgId:', resolvedOrgId);
          setOrgId(resolvedOrgId);
          
          const membershipVerified = await verifyMembership(firebaseUser.uid, resolvedOrgId);
          if (membershipVerified) {
            console.log('[Auth] Membership verified, authReady = true');
            setAuthReady(true);
          } else {
            console.error('[Auth] Membership verification failed');
            setAuthReady(false);
          }
        } catch (error) {
          console.error('[Auth] Error resolving org:', error);
          setOrgId(null);
          setAuthReady(false);
        }
      } else {
        console.log('[Auth] No user, clearing state');
        setUser(null);
        setOrgId(null);
        setAuthReady(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function verifyMembership(uid: string, orgId: string): Promise<boolean> {
    try {
      console.log('[Auth] Verifying membership for uid:', uid, 'orgId:', orgId);
      const memberRef = doc(db, 'orgs', orgId, 'members', uid);
      const memberSnap = await getDoc(memberRef);
      
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        console.log('[Auth] Member document found:', memberData);
        return memberData.active === true;
      }
      
      console.log('[Auth] Member document not found, checking global memberships');
      const membershipsRef = collection(db, 'memberships');
      const q = query(membershipsRef, where('uid', '==', uid), where('orgId', '==', orgId), where('active', '==', true));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        console.log('[Auth] Found membership in global memberships collection');
        return true;
      }
      
      console.log('[Auth] No valid membership found');
      return false;
    } catch (error) {
      console.error('[Auth] Error verifying membership:', error);
      return false;
    }
  }

  async function resolveOrCreateOrg(firebaseUser: User): Promise<string> {
    console.log('[Auth] Looking for existing membership for uid:', firebaseUser.uid);
    
    const membershipsRef = collection(db, 'memberships');
    const q = query(membershipsRef, where('uid', '==', firebaseUser.uid), where('active', '==', true));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const membership = snapshot.docs[0].data();
      console.log('[Auth] Found existing membership, orgId:', membership.orgId);
      return membership.orgId;
    }

    console.log('[Auth] No existing membership, creating new org');
    const orgRef = doc(collection(db, 'orgs'));
    const newOrgId = orgRef.id;

    console.log('[Auth] Creating org document at path: /orgs/' + newOrgId);
    await setDoc(orgRef, {
      name: firebaseUser.displayName ? `${firebaseUser.displayName}'s Organization` : 'My Organization',
      createdAt: new Date(),
      createdBy: firebaseUser.uid,
    });

    console.log('[Auth] Creating member document at path: /orgs/' + newOrgId + '/members/' + firebaseUser.uid);
    const membershipRef = doc(db, 'orgs', newOrgId, 'members', firebaseUser.uid);
    await setDoc(membershipRef, {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      role: 'owner',
      active: true,
      joinedAt: new Date(),
    });

    console.log('[Auth] Creating global membership document');
    const globalMembershipRef = doc(collection(db, 'memberships'));
    await setDoc(globalMembershipRef, {
      uid: firebaseUser.uid,
      orgId: newOrgId,
      role: 'owner',
      active: true,
    });

    console.log('[Auth] Org and membership created successfully');
    return newOrgId;
  }

  async function signInWithGoogle() {
    try {
      console.log('[Auth] Starting Google sign-in');
      await signInWithPopup(auth, googleProvider);
      console.log('[Auth] Google sign-in successful');
    } catch (error) {
      console.error('[Auth] Google sign-in error:', error);
      throw error;
    }
  }

  async function signInWithEmail(email: string, password: string) {
    try {
      console.log('[Auth] Starting email sign-in for:', email);
      await signInWithEmailAndPassword(auth, email, password);
      console.log('[Auth] Email sign-in successful');
    } catch (error) {
      console.error('[Auth] Email sign-in error:', error);
      throw error;
    }
  }

  async function signUpWithEmail(email: string, password: string) {
    try {
      console.log('[Auth] Starting email sign-up for:', email);
      await createUserWithEmailAndPassword(auth, email, password);
      console.log('[Auth] Email sign-up successful');
    } catch (error) {
      console.error('[Auth] Email sign-up error:', error);
      throw error;
    }
  }

  async function signOut() {
    try {
      console.log('[Auth] Starting sign-out');
      await firebaseSignOut(auth);
      console.log('[Auth] Sign-out successful');
    } catch (error) {
      console.error('[Auth] Sign-out error:', error);
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      orgId,
      loading,
      authReady,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

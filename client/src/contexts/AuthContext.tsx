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
  sendPasswordResetEmail,
  doc,
  getDoc,
  setDoc,
  collection,
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
  membershipReady: boolean;
  orgError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [membershipReady, setMembershipReady] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[Auth] Setting up onAuthStateChanged listener');
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      console.log('[Auth] onAuthStateChanged fired, user:', firebaseUser?.uid || 'null');
      
      setAuthReady(false);
      setMembershipReady(false);
      setOrgError(null);
      
      if (firebaseUser) {
        const authUser: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        setUser(authUser);
        
        try {
          console.log('[Auth] Stage 1: Resolving org via /users/' + firebaseUser.uid);
          const resolvedOrgId = await resolveOrCreateUserProfile(firebaseUser);
          
          if (resolvedOrgId) {
            console.log('[Auth] Resolved orgId:', resolvedOrgId);
            setOrgId(resolvedOrgId);
            setAuthReady(true);
            console.log('[Auth] authReady = true');
            
            console.log('[Auth] Stage 2: Verifying membership at /orgs/' + resolvedOrgId + '/members/' + firebaseUser.uid);
            const membershipVerified = await verifyMembership(resolvedOrgId, firebaseUser.uid);
            
            if (membershipVerified) {
              console.log('[Auth] Membership verified, membershipReady = true');
              setMembershipReady(true);
            } else {
              console.error('[Auth] Membership verification failed - user is not an active member');
              setOrgError('Access denied. You are not an active member of this organisation.');
            }
          } else {
            console.error('[Auth] Failed to resolve orgId');
            setOrgId(null);
            setOrgError('Organisation not initialised.');
            setAuthReady(true);
          }
        } catch (error: any) {
          console.error('[Auth] Error during auth flow:', error);
          logFirestoreError('authFlow', `/users/${firebaseUser.uid}`, firebaseUser.uid, null, error);
          setOrgId(null);
          setOrgError('Failed to initialise organisation. Please try again.');
          setAuthReady(true);
        }
      } else {
        console.log('[Auth] No user, clearing state');
        setUser(null);
        setOrgId(null);
        setMembershipReady(false);
        setAuthReady(true);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  function logFirestoreError(operation: string, path: string, uid: string | null, orgId: string | null, error: any) {
    console.error('[Firestore Error]', {
      operation,
      path,
      uid: uid || 'NO_USER',
      orgId: orgId || 'NO_ORG',
      errorCode: error?.code,
      errorMessage: error?.message,
      timestamp: new Date().toISOString(),
    });
  }

  async function verifyMembership(orgId: string, uid: string): Promise<boolean> {
    try {
      const memberDocRef = doc(db, 'orgs', orgId, 'members', uid);
      const memberSnap = await getDoc(memberDocRef);
      
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        console.log('[Auth] Member doc found:', memberData);
        return memberData.active === true;
      }
      
      console.log('[Auth] Member doc not found');
      return false;
    } catch (error: any) {
      console.error('[Auth] Error verifying membership:', error);
      return false;
    }
  }

  async function resolveOrCreateUserProfile(firebaseUser: User): Promise<string | null> {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    
    try {
      console.log('[Auth] Reading user profile at /users/' + firebaseUser.uid);
      const userSnap = await getDoc(userDocRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        console.log('[Auth] User profile found:', userData);
        
        if (userData.orgId) {
          return userData.orgId;
        } else {
          console.error('[Auth] User profile exists but has no orgId');
          return null;
        }
      }
      
      console.log('[Auth] User profile not found, bootstrapping first-time user');
      return await bootstrapNewUser(firebaseUser);
    } catch (error: any) {
      if (error?.code === 'permission-denied') {
        console.log('[Auth] Permission denied reading user profile, attempting bootstrap');
        return await bootstrapNewUser(firebaseUser);
      }
      throw error;
    }
  }

  async function bootstrapNewUser(firebaseUser: User): Promise<string> {
    console.log('[Auth] Starting first-login bootstrap for uid:', firebaseUser.uid);
    
    const orgRef = doc(collection(db, 'orgs'));
    const newOrgId = orgRef.id;
    
    console.log('[Auth] Step 1: Creating org document at /orgs/' + newOrgId);
    await setDoc(orgRef, {
      name: firebaseUser.displayName ? `${firebaseUser.displayName}'s Organization` : 'My Organization',
      createdAt: new Date(),
      createdBy: firebaseUser.uid,
    });
    
    console.log('[Auth] Step 2: Creating member document at /orgs/' + newOrgId + '/members/' + firebaseUser.uid);
    const memberRef = doc(db, 'orgs', newOrgId, 'members', firebaseUser.uid);
    await setDoc(memberRef, {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      role: 'owner',
      active: true,
      joinedAt: new Date(),
    });
    
    console.log('[Auth] Step 3: Creating user profile at /users/' + firebaseUser.uid);
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    await setDoc(userDocRef, {
      orgId: newOrgId,
      role: 'owner',
      createdAt: new Date(),
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
    });
    
    console.log('[Auth] Bootstrap complete, orgId:', newOrgId);
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

  async function resetPassword(email: string) {
    try {
      console.log('[Auth] Sending password reset email to:', email);
      await sendPasswordResetEmail(auth, email);
      console.log('[Auth] Password reset email sent');
    } catch (error) {
      console.error('[Auth] Password reset error:', error);
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      orgId,
      loading,
      authReady,
      membershipReady,
      orgError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      resetPassword,
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

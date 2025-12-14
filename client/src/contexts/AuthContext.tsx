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

interface OrgMembership {
  orgId: string;
  role: 'owner' | 'admin' | 'member';
  active: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  orgId: string | null;
  loading: boolean;
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        const authUser: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        setUser(authUser);
        
        const resolvedOrgId = await resolveOrCreateOrg(firebaseUser);
        setOrgId(resolvedOrgId);
      } else {
        setUser(null);
        setOrgId(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function resolveOrCreateOrg(firebaseUser: User): Promise<string> {
    const membershipsRef = collection(db, 'memberships');
    const q = query(membershipsRef, where('uid', '==', firebaseUser.uid), where('active', '==', true));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const membership = snapshot.docs[0].data();
      return membership.orgId;
    }

    const orgRef = doc(collection(db, 'orgs'));
    const newOrgId = orgRef.id;

    await setDoc(orgRef, {
      name: firebaseUser.displayName ? `${firebaseUser.displayName}'s Organization` : 'My Organization',
      createdAt: new Date(),
      createdBy: firebaseUser.uid,
    });

    const membershipRef = doc(db, 'orgs', newOrgId, 'members', firebaseUser.uid);
    await setDoc(membershipRef, {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      role: 'owner',
      active: true,
      joinedAt: new Date(),
    });

    const globalMembershipRef = doc(collection(db, 'memberships'));
    await setDoc(globalMembershipRef, {
      uid: firebaseUser.uid,
      orgId: newOrgId,
      role: 'owner',
      active: true,
    });

    return newOrgId;
  }

  async function signInWithGoogle() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  }

  async function signInWithEmail(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Email sign-in error:', error);
      throw error;
    }
  }

  async function signUpWithEmail(email: string, password: string) {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Email sign-up error:', error);
      throw error;
    }
  }

  async function signOut() {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      orgId,
      loading,
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

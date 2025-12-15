import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc, query, orderBy, where, Timestamp, limit } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, type User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "prospectr-a8ef3.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: "prospectr-a8ef3.firebasestorage.app",
  messagingSenderId: "204358129964",
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: "G-S7FB5GLPL4",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc, query, orderBy, where, Timestamp, limit,
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  type User
};

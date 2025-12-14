import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp } from 'firebase/firestore';

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

export const leadsCollection = collection(db, 'leads');
export const activitiesCollection = collection(db, 'activities');

export { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp };

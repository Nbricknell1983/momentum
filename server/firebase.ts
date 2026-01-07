import admin from 'firebase-admin';

let firebaseInitialized = false;

if (!admin.apps.length && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    firebaseInitialized = true;
    console.log('[Firebase Admin] Initialized successfully');
  } catch (error) {
    console.warn('[Firebase Admin] Failed to initialize:', error);
  }
} else if (!admin.apps.length) {
  console.warn('[Firebase Admin] Missing credentials - FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY not set');
}

export const firestore = firebaseInitialized ? admin.firestore() : null;
export const isFirebaseAdminReady = () => firebaseInitialized && firestore !== null;
export default admin;

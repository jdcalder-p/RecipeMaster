import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'recipe-manager-dev',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-admin@recipe-manager-dev.iam.gserviceaccount.com',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };

  if (serviceAccount.privateKey && serviceAccount.clientEmail && serviceAccount.projectId) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    // Fallback for development - use emulator
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    initializeApp({
      projectId: 'recipe-manager-dev',
    });
  }
}

export const db = getFirestore();

// Collection names
export const COLLECTIONS = {
  RECIPES: 'recipes',
  MEAL_PLANS: 'mealPlans',
  SHOPPING_LIST: 'shoppingList',
} as const;

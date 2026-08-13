// ---------------------------------------------------------------
// PASTE YOUR FIREBASE CONFIG BELOW.
// Get this from: Firebase Console → Project Settings → General →
// "Your apps" → Web app → SDK setup and configuration → Config.
//
// Note: unlike most API keys, this one is safe to commit/publish —
// it just identifies your project. Real protection comes from your
// Firestore rules (see firestore.rules), not from hiding this file.
// ---------------------------------------------------------------
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCz0pCY92VlNOWlKiCYlXc7Qd98QSTXaU8",
  authDomain: "krazo-media-app.firebaseapp.com",
  projectId: "krazo-media-app",
  storageBucket: "krazo-media-app.firebasestorage.app",
  messagingSenderId: "115596582238",
  appId: "1:115596582238:web:6d5b8a526290976b5803cf",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

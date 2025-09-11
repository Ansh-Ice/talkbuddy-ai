// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";   // ✅ Add this
import { getFirestore } from "firebase/firestore";

import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBohWnsuvlxzspYWXC7_TdipOzIQteh0FI",
  authDomain: "talkbuddy-ai-f7d6a.firebaseapp.com",
  projectId: "talkbuddy-ai-f7d6a",
  storageBucket: "talkbuddy-ai-f7d6a.firebasestorage.app",
  messagingSenderId: "92103584883",
  appId: "1:92103584883:web:b7201fba74c1961f1a0e06",
  measurementId: "G-SWHXTX887B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// 🔹 Initialize Firebase Authentication with settings to handle COOP
export const auth = getAuth(app);

// Configure auth settings to handle COOP issues
auth.settings.appVerificationDisabledForTesting = false;
// 🔹 Initialize Firestore for registration registry
export const db = getFirestore(app);


export default app;
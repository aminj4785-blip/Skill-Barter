// firebase.js — Firebase initialization and the single place the rest of the app
// imports the Firebase SDK from. Every other module imports Firebase pieces from
// HERE, not from the CDN, so there's exactly one source of truth for config/SDK.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getStorage,
  ref as sRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyAUfz96oHM7yNZxRs_wtvvkjR-M9tNEays",
  authDomain: "skill-barter-ai.firebaseapp.com",
  projectId: "skill-barter-ai",
  storageBucket: "skill-barter-ai.appspot.com",
  messagingSenderId: "1018942678677",
  appId: "1:1018942678677:web:cac90dd08aec687bf25d9c",
  measurementId: "G-C41FT4VF07"
};

export const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Re-export the SDK functions so feature modules can do:
//   import { db, collection, addDoc } from './firebase.js';
export {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  collection,
  addDoc,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  updateDoc,
  serverTimestamp,
  sRef,
  uploadBytesResumable,
  getDownloadURL
};

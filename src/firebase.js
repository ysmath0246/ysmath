// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore }   from "firebase/firestore";

// ─────────────────────────────────────────────────────────────────────────────
// Firebase SDK 설정 (Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱(웹) → 
//               ‘Firebase SDK 설정 및 구성’ 복사)
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyA…",                                 // ← YOUR_API_KEY
  authDomain:        "myattendanceproject-45c1b.firebaseapp.com",// ← YOUR_PROJECT_ID.firebaseapp.com
  projectId:         "myattendanceproject-45c1b",                // ← YOUR_PROJECT_ID
  storageBucket:     "myattendanceproject-45c1b.appspot.com",    // ← YOUR_PROJECT_ID.appspot.com  (⚠️ 중요)
  messagingSenderId: "347137303283",                             // ← YOUR_MESSAGING_SENDER_ID
  appId:             "1:347137303283:web:9369753f976dffcf65cd86" // ← YOUR_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firestore DB 참조
export const db = getFirestore(app);

// 디버깅 (한번만 찍어보고 지워도 됩니다)
// console.log("🔥 FirebaseConfig:", firebaseConfig, "DB:", db);

// 1) ไปที่ Firebase Console > Project settings > Your apps > Web app
// 2) คัดลอก firebaseConfig ของโปรเจกต์มาแทนค่าด้านล่าง
// 3) เปิด Authentication > Sign-in method > Email/Password
// 4) สร้าง Firestore Database
//
// Firebase Web ใช้ modular SDK จาก CDN ตามรูปแบบปัจจุบันของ Firebase Docs.
// อย่าใส่ service-account private key ลงในไฟล์นี้

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQDXXy6KioAZ3lRZkQIvP-2Q35JaplmyA",
  authDomain: "motorcycle-workshop-edac5.firebaseapp.com",
  projectId: "motorcycle-workshop-edac5",
  storageBucket: "motorcycle-workshop-edac5.firebasestorage.app",
  messagingSenderId: "282582818664",
  appId: "1:282582818664:web:6b6cf0ee94ae3351b600dd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

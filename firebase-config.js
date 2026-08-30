// 1) ไปที่ Firebase Console > Project settings > Your apps > Web app
// 2) คัดลอก firebaseConfig ของโปรเจกต์มาแทนค่าด้านล่าง
// 3) เปิด Authentication > Sign-in method > Email/Password
// 4) สร้าง Firestore Database
//
// Firebase Web ใช้ modular SDK จาก CDN ตามรูปแบบปัจจุบันของ Firebase Docs.
// อย่าใส่ service-account private key ลงในไฟล์นี้

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

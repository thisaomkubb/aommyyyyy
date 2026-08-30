# MOTOBOX — Replit + Firebase

เว็บต้นแบบร้านซ่อม/ดูแลรถมอเตอร์ไซค์แบบ Bento Responsive Design
รองรับ 3 บทบาท:
- customer = ลูกค้า
- mechanic = ช่าง
- owner = เจ้าของร้าน

## 1. เอาเข้า Replit

อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้เข้า Replit แล้วเปิดเป็น Static/HTML project ได้เลย

ถ้า Replit ต้องการคำสั่งรัน ให้ใช้:
```bash
python3 -m http.server 3000
```

หรือใช้ Static deployment ที่รองรับไฟล์ `index.html`

## 2. ตั้งค่า Firebase

1. สร้าง Firebase Project
2. เพิ่ม Web App
3. คัดลอก `firebaseConfig` มาใส่ใน `firebase-config.js`
4. Firebase Authentication > Sign-in method > เปิด Email/Password
5. Firestore Database > Create database
6. นำกฎใน `firestore.rules` ไปวางใน Firestore Rules

## 3. บทบาทผู้ใช้งาน

เมื่อสมัครจากหน้าเว็บ จะสร้าง:
`users/{uid}`

ตัวอย่าง:
```json
{
  "uid": "firebase-uid",
  "name": "Somchai",
  "email": "somchai@example.com",
  "role": "customer"
}
```

สำหรับ owner ให้แก้ `role` ใน Firestore เป็น `owner`

## 4. Collections ที่ระบบใช้

- users
- motorcycles
- bookings
- repairs
- parts
- engineCalculations

## 5. Engine Lab

สูตรคำนวณและตรรกะหลักนำมาจากไฟล์ `engine calculate1.txt` เดิม:
- CC / Total Stroke
- Compression Ratio
- Rod Ratio
- MPS
- Gas Velocity (Vg)
- Injector Flow
- Throttle Body Diameter
- Exhaust Area / Header Diameter
- Build Sheet 9:16 และ export เป็น PNG

ระบบเพิ่มความสามารถบันทึกผลคำนวณลง Firestore ใน `engineCalculations`

## 6. หมายเหตุด้านความปลอดภัย

`firebase-config.js` เป็น client config ไม่ใช่ service-account private key
การจำกัดสิทธิ์จริงต้องใช้ Firestore Security Rules ซึ่งมีตัวอย่างให้ใน `firestore.rules`
บทบาท `owner` ควรกำหนดจากฝั่งแอดมิน/Firestore ไม่ควรเปิดให้ผู้สมัครใหม่เลือก owner

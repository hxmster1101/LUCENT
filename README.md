# LUCENT Discord Bot

ไฟล์พร้อมสำหรับ Railway โดยไม่ใช้ MongoDB

## Railway Variables
- TOKEN = Discord Bot Token
- CLIENT_ID = Application/Client ID
- GUILD_ID = Server ID (แนะนำให้ใส่เพื่อให้ Slash Commands อัปเดตเร็ว)

## ไฟล์
- index.js
- package.json
- data.json (สร้างอัตโนมัติครั้งแรก)

## คำสั่งหลัก
/paymentsetting หรือ /pymentsetting
/storeadd
/gift
/gachasetup
/gachastart
/gachareward
/gacharemove
/addgift
/bagpack
/setup

## หมายเหตุ
ระบบบันทึกข้อมูลลง data.json บน filesystem ของ Railway เท่านั้น หากต้องการเก็บข้อมูลถาวรข้ามการ redeploy/restart ควรผูก Railway Volume ในภายหลัง

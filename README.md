# LUCENT Discord Bot

ระบบรวมในโปรเจกต์เดียว:
- เติมเงิน: TrueMoney / ธนาคาร / QR / สลิป / แอดมินอนุมัติ / เพิ่ม Coins อัตโนมัติ
- ร้านค้า: ROLE / ITEM / Gacha Ticket
- `/storeadd` เพิ่มสินค้าแล้วอัปเดตหน้าร้านทันที
- ระบบแลกรางวัลด้วยเกลือ
- กาชา 1/5/10 ครั้ง, Loading 5 วินาที, ROLE/ITEM/COINS/SALT
- กระเป๋า Coins / เกลือ / ไอเท็ม / ตั๋ว
- SQLite

## Railway

1. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้เข้า GitHub repository
2. Railway -> Deploy from GitHub Repo
3. Variables -> เพิ่ม `DISCORD_TOKEN` = Token ของบอท
4. ไม่ต้องตั้ง Start Command เองก็ได้ เพราะ package.json มี `npm start`
5. ถ้าบอทอยู่แค่ 1 เซิร์ฟเวอร์ ระบบจะลง Slash Commands ให้อัตโนมัติ
6. ถ้าอยู่หลายเซิร์ฟเวอร์ ให้เพิ่ม `GUILD_ID` เพื่อให้คำสั่งขึ้นทันทีในเซิร์ฟเวอร์เป้าหมาย

## Discord Developer Portal

เปิด Bot -> เปิด:
- Server Members Intent
- Message Content Intent

Invite bot ด้วย scopes:
- bot
- applications.commands

Permissions ที่แนะนำ:
- Administrator (ง่ายที่สุดสำหรับระบบร้าน/ยศ/สร้างห้อง)
หรือกำหนดสิทธิ์อย่างน้อย Manage Channels, Manage Roles, Send Messages, Embed Links, Attach Files, Read Message History.

## วิธีเริ่ม

1. `/pymentsetting`
2. ตั้งค่าหน้าระบบ
3. ตั้ง TrueMoney / ธนาคาร / QR จากปุ่มที่ขึ้น
4. `/startstore`
5. `/storesetup`
6. `/storeadd`
7. `/gift` และ `/addgift`
8. `/gachasetup`
9. `/gachareward`
10. `/gachastart`

### สำคัญเรื่อง ROLE
ระบบจะพยายามหายศจาก **ชื่อที่กรอก** ก่อนอัตโนมัติ เช่น ถ้ากรอก `VIP` และในเซิร์ฟเวอร์มียศชื่อ `VIP` ก็ใช้ได้ทันที
ถ้าต้องการระบุ ID แบบชัดเจน:
- `/storeadd`: ใส่ `Role ID: 123456789012345678` ในรายละเอียดสินค้า
- `/addgift` และ `/gachareward`: ใช้ช่อง Role ID ที่มีให้

บอทจะสวมยศให้เมื่อซื้อ/แลก/สุ่มได้

### เกลือ
รางวัล Gacha ประเภท SALT จะเพิ่มเกลือเข้าบัญชี และเกลือใช้แลกของในร้านผ่าน `/addgift`.

### การเก็บข้อมูล
ข้อมูลอยู่ใน `data/lucent.sqlite`. บน Railway ถ้าต้องการให้ฐานข้อมูลคงอยู่หลัง redeploy/restart ควรผูก Persistent Volume ให้กับโฟลเดอร์ `/app/data`.

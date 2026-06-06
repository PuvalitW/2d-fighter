# Deploy guide — Vercel (client) + Render (server)

เกมต้องการ 2 services เพราะ Vercel functions มี timeout ไม่รองรับ Socket.IO tick loop:
- **Client** (Next.js) → Vercel
- **Server** (Node + Socket.IO) → Render free tier

**Repo**: https://github.com/PuvalitW/2d-fighter

---

## 1. Deploy server บน Render (ทำก่อน เพราะต้องเอา URL ไปใส่ใน Vercel)

1. ไปที่ https://dashboard.render.com → **New +** → **Blueprint**
2. **Connect GitHub** (ครั้งแรก authorize Render กับ GitHub account) แล้วเลือก repo **PuvalitW/2d-fighter**
3. Render จะอ่าน `render.yaml` ใน repo อัตโนมัติ → เห็น service ชื่อ `2d-fighter-server`
4. Region = Singapore (set ใน yaml แล้ว)
5. **Environment variables** ที่ต้องตั้งเอง:
   - `CLIENT_ORIGIN` → ใส่หลังจากได้ Vercel URL (ขั้น 2.5) — ตอนนี้ทิ้งว่างไว้ก่อน หรือใส่ `*` ชั่วคราว
6. กด **Apply** → รอ build (~3-5 นาที)
7. เมื่อ deploy เสร็จ จะได้ URL แบบ `https://2d-fighter-server.onrender.com` (หรือชื่อใกล้เคียง)
8. **เปิด URL + `/health`** → ควรเห็น `{"ok":true,"time":...}` ถ้าได้ = server พร้อม

> ⚠️ Render free tier จะ **sleep หลัง idle 15 นาที** request แรกจะช้า ~30 วินาที. ปกติสำหรับ dev/showcase

---

## 2. Deploy client บน Vercel

1. ไปที่ https://vercel.com/new → เลือก **PuvalitW/2d-fighter**
2. Vercel จะอ่าน `vercel.json` อัตโนมัติ — ทุกอย่าง preset ไว้:
   - Build command: `npm run build:shared && npm run build -w @game/client`
   - Output: `packages/client/.next`
   - Framework: Next.js
3. **ตั้ง Environment Variable**:
   - Key: `NEXT_PUBLIC_SERVER_URL`
   - Value: `https://2d-fighter-server.onrender.com` (URL จากขั้น 1.7)
   - Apply to: **Production + Preview + Development** ทั้ง 3
4. กด **Deploy** → รอ ~2-3 นาที
5. เสร็จแล้วจะได้ URL เช่น `https://2d-fighter-puvalitw.vercel.app`

### 2.5 อัปเดต CORS server

1. กลับไปที่ Render → service settings → **Environment**
2. แก้ `CLIENT_ORIGIN` → ใส่ Vercel URL (ทั้ง URL แบบ `https://...` ห้ามมี `/` ท้าย)
   - ถ้ามีหลาย URL (preview, custom domain) → คั่นด้วย `,` เช่น
     `https://2d-fighter-puvalitw.vercel.app,https://2d-fighter.vercel.app`
3. Render จะ auto-redeploy

---

## 3. เล่นเลย

1. เปิด `https://2d-fighter-puvalitw.vercel.app` ใน browser ของคุณ → ใส่ชื่อ → **สร้างห้องใหม่**
2. Copy รหัสห้อง (6 ตัวอักษร) → ส่งให้เพื่อน
3. เพื่อนเปิด URL เดียวกัน → ใส่ชื่อ → ใส่รหัส → **เข้าห้อง**
4. ทั้งคู่เลือกตัวละคร → ซื้ออาวุธ + 2 สกิล → กด Ready → ฟัด

---

## Troubleshoot

**Client ขึ้น แต่ไม่ต่อ server** (Lobby ค้างที่ "รหัสห้อง: -")
- เช็ค `NEXT_PUBLIC_SERVER_URL` ใน Vercel ตรงกับ URL Render
- เช็ค Render service ตื่นอยู่ ลอง `https://<server>/health`
- เช็ค `CLIENT_ORIGIN` บน Render ใส่ URL Vercel ถูกต้อง (ไม่มี `/` ท้าย)
- เปิด DevTools → Console ดู error WebSocket / CORS

**"WebSocket handshake failed"**
- 99% เป็น CORS — `CLIENT_ORIGIN` ใส่ไม่ตรง URL Vercel ที่ใช้อยู่
- preview deploy ของ Vercel จะมี URL ต่างจาก production ต้องใส่หลาย URL คั่น `,`

**Server sleep ตอบช้า**
- Render free tier sleep 15 นาที ครั้งแรกหลัง sleep จะช้า ~30s
- ทางแก้: upgrade Render Starter ($7/mo) หรือใช้ uptime ping (UptimeRobot) ทุก 14 นาที

---

## Local development (อ้างอิง)

```bash
npm install
npm run build:shared
npm run dev:server    # terminal A → localhost:4000
npm run dev:client    # terminal B → localhost:3000
```

`packages/client/.env.local`:
```
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

# 2D Fighter — Web Multiplayer

เกมต่อสู้ 2 มิติบน browser เล่นได้พร้อมกัน 2 คนคนละเครื่อง มี Shop ซื้ออาวุธ/สกิลก่อนเริ่มแมตช์

## Stack
- **Client**: Next.js + Phaser 3 + TypeScript (deploy → Vercel)
- **Server**: Node.js + Socket.IO authoritative game server, tick 30Hz (deploy → Railway/Fly.io)
- **Shared**: types/constants/event contracts

## Run locally

```bash
# 1. Install
npm install

# 2. Build shared package (other packages import from it)
npm run build:shared

# 3. Run server (terminal A)
npm run dev:server
# → http://localhost:4000

# 4. Run client (terminal B)
npm run dev:client
# → http://localhost:3000
```

เปิด 2 tab ที่ `http://localhost:3000` (tab สอง incognito) สำหรับเล่น 2 คน

## Controls
- **A / D** ซ้าย / ขวา
- **W** กระโดด
- **S** บล็อก (ลด damage 50%)
- **J** โจมตีด้วยอาวุธหลัก
- **K** สกิล slot 1
- **L** สกิล slot 2

## Game flow
1. หน้าแรก: ใส่ชื่อ → Create room หรือ Join ด้วย code
2. Lobby: รออีกฝ่าย, เลือกตัวละคร (Brawler / Ranger)
3. Shop: ซื้ออาวุธ 1 ชิ้น + สกิล 2 ชิ้น ด้วยเหรียญเริ่มต้น 1000 → Ready
4. Match: ต่อสู้กัน HP = 0 = แพ้
5. Result: กลับ Shop เริ่ม round ใหม่

## Environment

`packages/client/.env.local`:
```
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

`packages/server/.env` (optional):
```
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
```

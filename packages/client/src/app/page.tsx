'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getSocket } from '@/game/network/socket';

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillCode = params.get('code') ?? '';

  const [name, setName] = useState('');
  const [code, setCode] = useState(prefillCode);
  const [status, setStatus] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const busy = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('fighter:name') ?? '';
    if (saved) setName(saved);
  }, []);

  function persistName(n: string) {
    setName(n);
    window.localStorage.setItem('fighter:name', n);
  }

  async function create() {
    if (busy.current) return;
    if (!name.trim()) {
      setStatus('ใส่ชื่อก่อน');
      return;
    }
    busy.current = true;
    setStatus('สร้างห้อง...');
    const socket = getSocket();
    socket.emit('room:create', { name: name.trim() }, (ack) => {
      busy.current = false;
      if (!ack.ok) {
        setStatus('สร้างไม่สำเร็จ');
        return;
      }
      window.sessionStorage.setItem('fighter:playerId', ack.playerId);
      window.sessionStorage.setItem('fighter:roomCode', ack.code);
      router.push(`/game?code=${ack.code}`);
    });
  }

  async function practice() {
    if (busy.current) return;
    if (!name.trim()) {
      setStatus('ใส่ชื่อก่อน');
      return;
    }
    busy.current = true;
    setStatus('เริ่มโหมดฝึก...');
    const socket = getSocket();
    socket.emit('room:practice', { name: name.trim(), difficulty }, (ack) => {
      busy.current = false;
      if (!ack.ok) {
        setStatus('เริ่มไม่สำเร็จ');
        return;
      }
      window.sessionStorage.setItem('fighter:playerId', ack.playerId);
      window.sessionStorage.setItem('fighter:roomCode', ack.code);
      router.push(`/game?code=${ack.code}`);
    });
  }

  async function join() {
    if (busy.current) return;
    if (!name.trim()) {
      setStatus('ใส่ชื่อก่อน');
      return;
    }
    if (!code.trim()) {
      setStatus('ใส่รหัสห้อง');
      return;
    }
    busy.current = true;
    setStatus('เข้าห้อง...');
    const socket = getSocket();
    socket.emit(
      'room:join',
      { code: code.trim().toUpperCase(), name: name.trim() },
      (ack) => {
        busy.current = false;
        if (!ack.ok) {
          setStatus(ack.error ?? 'เข้าห้องไม่สำเร็จ');
          return;
        }
        window.sessionStorage.setItem('fighter:playerId', ack.playerId ?? '');
        window.sessionStorage.setItem('fighter:roomCode', ack.code ?? '');
        router.push(`/game?code=${ack.code}`);
      }
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 440,
          maxWidth: '100%',
          background: '#151821',
          padding: 28,
          borderRadius: 12,
          border: '1px solid #1f2331',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
        }}
      >
        <h1 style={{ fontSize: 30, marginBottom: 6 }}>2D Fighter</h1>
        <p style={{ color: '#888d99', marginBottom: 20 }}>
          เล่นกับเพื่อน 2 คน หรือฝึกกับ Bot
        </p>

        <label style={{ display: 'block', fontSize: 13, color: '#aab', marginBottom: 6 }}>
          ชื่อผู้เล่น
        </label>
        <input
          value={name}
          onChange={(e) => persistName(e.target.value)}
          maxLength={16}
          placeholder="ชื่อของคุณ"
          style={inputStyle}
        />

        <div style={{ height: 22 }} />

        {/* Bot mode */}
        <div
          style={{
            background: '#0f1320',
            border: '1px solid #2a3146',
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 13, color: '#aab', marginBottom: 8 }}>
            เล่นกับ Bot (1 คน)
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['easy', 'normal', 'hard'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                style={{
                  flex: 1,
                  background: difficulty === d ? '#5a8dee' : '#1a1f2e',
                  border: `1px solid ${difficulty === d ? '#5a8dee' : '#262b3a'}`,
                  color: '#fff',
                  padding: '8px 0',
                  borderRadius: 6,
                  fontSize: 13,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                {d === 'easy' ? 'ง่าย' : d === 'normal' ? 'ปานกลาง' : 'ยาก'}
              </button>
            ))}
          </div>
          <button onClick={practice} style={botBtn}>
            🤖 เล่นกับ Bot
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#262b3a' }} />
          <div style={{ color: '#666c79', fontSize: 12 }}>หรือเล่นกับเพื่อน</div>
          <div style={{ flex: 1, height: 1, background: '#262b3a' }} />
        </div>

        <button onClick={create} style={primaryBtn}>
          สร้างห้องใหม่
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
          <div style={{ flex: 1, height: 1, background: '#262b3a' }} />
          <div style={{ color: '#666c79', fontSize: 12 }}>หรือ</div>
          <div style={{ flex: 1, height: 1, background: '#262b3a' }} />
        </div>

        <label style={{ display: 'block', fontSize: 13, color: '#aab', marginBottom: 6 }}>
          รหัสห้อง
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABCDEF"
          style={{ ...inputStyle, letterSpacing: 4, textTransform: 'uppercase' }}
        />
        <div style={{ height: 12 }} />
        <button onClick={join} style={secondaryBtn}>
          เข้าห้อง
        </button>

        {status && (
          <p style={{ marginTop: 16, color: '#ffb45c', fontSize: 14 }}>{status}</p>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #1f2331', margin: '22px 0' }} />
        <details style={{ fontSize: 13, color: '#888d99' }}>
          <summary style={{ cursor: 'pointer' }}>คีย์ลัด</summary>
          <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.7 }}>
            <li><b>A / D</b> ซ้าย / ขวา</li>
            <li><b>W</b> กระโดด</li>
            <li><b>S</b> บล็อก (ลดดาเมจ 50%)</li>
            <li><b>J</b> โจมตี</li>
            <li><b>K / L</b> สกิล 1 / 2</li>
          </ul>
        </details>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0d1019',
  border: '1px solid #262b3a',
  color: '#fff',
  padding: '12px 14px',
  borderRadius: 8,
  outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  width: '100%',
  background: '#5a8dee',
  border: 'none',
  color: '#fff',
  padding: '14px 16px',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 15,
};

const secondaryBtn: React.CSSProperties = {
  width: '100%',
  background: '#262b3a',
  border: 'none',
  color: '#fff',
  padding: '14px 16px',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 15,
};

const botBtn: React.CSSProperties = {
  width: '100%',
  background: 'linear-gradient(180deg, #39c46a 0%, #2ea455 100%)',
  border: 'none',
  color: '#fff',
  padding: '14px 16px',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: 0.5,
};

export default function Page() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

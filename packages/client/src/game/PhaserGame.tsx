'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSocket } from './network/socket';
import type Phaser from 'phaser';

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code');

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!containerRef.current) return;
      if (!code) {
        router.replace('/');
        return;
      }
      const playerId = window.sessionStorage.getItem('fighter:playerId');
      if (!playerId) {
        router.replace('/');
        return;
      }
      const socket = getSocket();
      // wait for connect
      if (!socket.connected) {
        await new Promise<void>((resolve) => {
          if (socket.connected) resolve();
          else socket.once('connect', () => resolve());
        });
      }

      const Phaser = (await import('phaser')).default;
      const { BootScene } = await import('./scenes/BootScene');
      const { LobbyScene } = await import('./scenes/LobbyScene');
      const { ShopScene } = await import('./scenes/ShopScene');
      const { MatchScene } = await import('./scenes/MatchScene');
      const { ResultScene } = await import('./scenes/ResultScene');

      if (cancelled) return;

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 1280,
        height: 720,
        backgroundColor: '#1a1d28',
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [BootScene, LobbyScene, ShopScene, MatchScene, ResultScene],
      });

      // route to home if room closes
      socket.on('room:closed', () => {
        if (cancelled) return;
        alert('ห้องถูกปิด (อีกฝ่ายออก)');
        router.replace('/');
      });
    }

    void boot();
    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      const socket = getSocket();
      socket.off('room:closed');
    };
  }, [code, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0b0d12',
        padding: 12,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          maxWidth: 1280,
          aspectRatio: '16 / 9',
          border: '1px solid #1f2331',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
}

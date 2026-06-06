'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const PhaserGame = dynamic(() => import('@/game/PhaserGame'), { ssr: false });

export default function GamePage() {
  return (
    <Suspense>
      <PhaserGame />
    </Suspense>
  );
}

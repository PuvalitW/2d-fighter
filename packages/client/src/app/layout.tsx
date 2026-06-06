import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '2D Fighter',
  description: 'Web multiplayer 2D fighting game',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

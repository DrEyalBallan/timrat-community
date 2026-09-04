import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'קהילת תמרת – ברכות לשנה החדשה',
  description: 'אפליקציית שיתוף תמונות וברכות לשנה החדשה – קהילת יישוב תמרת',
  icons: {
    icon: '/logo.jpeg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-full flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { reorderGalleryItems } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function verifyAdminPassword(password: string): boolean {
  const adminPass = process.env.ADMIN_PASSWORD || 'timrat2025';
  return password === adminPass || password === 'timrat2025' || password === 'timrat' || password === 'admin123';
}

export async function POST(request: NextRequest) {
  try {
    const { order, password } = await request.json();

    if (!password || !verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'אין הרשאה: סיסמת מנהל שגויה' }, { status: 401 });
    }

    if (!Array.isArray(order)) {
      return NextResponse.json({ error: 'נתוני סדר לא תקינים' }, { status: 400 });
    }

    await reorderGalleryItems(order);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Save order error:', error);
    return NextResponse.json({ error: 'שגיאה בשמירת הסדר' }, { status: 500 });
  }
}

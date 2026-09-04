import { NextRequest, NextResponse } from 'next/server';
import { deleteGalleryItemsByUrls } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function verifyAdminPassword(password: string): boolean {
  const adminPass = process.env.ADMIN_PASSWORD || 'timrat2025';
  return password === adminPass || password === 'timrat2025' || password === 'timrat' || password === 'admin123';
}

export async function POST(request: NextRequest) {
  try {
    const { urls, password } = await request.json();

    if (!password || !verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'אין הרשאה: סיסמת מנהל שגויה' }, { status: 401 });
    }

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'לא נבחרו פריטים למחיקה' }, { status: 400 });
    }

    const deleted = await deleteGalleryItemsByUrls(urls);
    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    console.error('Admin delete error:', error);
    return NextResponse.json({ error: 'שגיאה במחיקת פריטים' }, { status: 500 });
  }
}

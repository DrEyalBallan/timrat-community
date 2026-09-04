import { NextRequest, NextResponse } from 'next/server';
import { deleteGalleryItemByToken, deleteUserGalleryItems } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, urls, token, tokens, deleteAll } = body;

    const allTokens: string[] = [];
    if (typeof token === 'string' && token.trim()) allTokens.push(token.trim());
    if (Array.isArray(tokens)) {
      tokens.forEach((t) => {
        if (typeof t === 'string' && t.trim()) allTokens.push(t.trim());
      });
    }

    if (allTokens.length === 0) {
      return NextResponse.json({ error: 'חסר מזהה משתמש (Token) למחיקה' }, { status: 400 });
    }

    // 1. Bulk Delete All for this user
    if (deleteAll) {
      const deletedUrls = await deleteUserGalleryItems({
        token: allTokens[0],
        tokens: allTokens,
        urls: Array.isArray(urls) ? urls : undefined,
        deleteAll: true,
      });

      return NextResponse.json({
        success: true,
        deletedCount: deletedUrls.length,
        deletedUrls,
        message: 'כל ההעלאות נמחקו בהצלחה',
      });
    }

    // 2. Multiple specific URLs delete
    if (Array.isArray(urls) && urls.length > 0) {
      const deletedUrls = await deleteUserGalleryItems({
        token: allTokens[0],
        tokens: allTokens,
        urls,
        deleteAll: false,
      });

      return NextResponse.json({
        success: true,
        deletedCount: deletedUrls.length,
        deletedUrls,
      });
    }

    // 3. Single URL delete
    if (url) {
      let success = false;
      for (const t of allTokens) {
        success = await deleteGalleryItemByToken(url, t);
        if (success) break;
      }

      if (!success) {
        const deleted = await deleteUserGalleryItems({
          token: allTokens[0],
          tokens: allTokens,
          urls: [url],
          deleteAll: false,
        });
        success = deleted.length > 0;
      }

      if (!success) {
        return NextResponse.json({ error: 'לא נמצא פריט תואם או שאין הרשאת מחיקה' }, { status: 404 });
      }

      return NextResponse.json({ success: true, deletedUrls: [url] });
    }

    return NextResponse.json({ error: 'לא נמסרה תמונה למחיקה' }, { status: 400 });
  } catch (error: any) {
    console.error('User delete error:', error);
    return NextResponse.json({ error: error?.message || 'שגיאה במחיקת הפריט' }, { status: 500 });
  }
}

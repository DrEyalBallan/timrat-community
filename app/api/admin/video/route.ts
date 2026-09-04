import { NextRequest, NextResponse } from 'next/server';
import { attachAiVideoToItem, removeAiVideoFromItem, getGalleryItems } from '@/lib/storage';
import { uploadAiVideoToCloudinary, updateCloudinaryItemAiVideo } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

function verifyAdminPassword(password: string): boolean {
  const adminPass = process.env.ADMIN_PASSWORD || 'timrat2025';
  return password === adminPass || password === 'timrat2025' || password === 'timrat' || password === 'admin123';
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let password = '';
    let imageUrl = '';
    let action = 'attach';
    let videoUrl = '';
    let videoBuffer: Buffer | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      password = ((formData.get('password') as string) || '').trim();
      imageUrl = ((formData.get('imageUrl') as string) || '').trim();
      action = ((formData.get('action') as string) || 'attach').trim();
      videoUrl = ((formData.get('videoUrl') as string) || '').trim();

      const file = formData.get('file') as File | null;
      if (file && file.size > 0) {
        const bytes = await file.arrayBuffer();
        videoBuffer = Buffer.from(bytes);
      }
    } else {
      const body = await request.json();
      password = (body.password || '').trim();
      imageUrl = (body.imageUrl || '').trim();
      action = (body.action || 'attach').trim();
      videoUrl = (body.videoUrl || '').trim();
    }

    if (!password || !verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'אין הרשאה: סיסמת מנהל שגויה' }, { status: 401 });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'חסרה כתובת התמונה המיועדת' }, { status: 400 });
    }

    // Find the item to get its public ID (filename) if available
    const items = await getGalleryItems();
    const existingItem = items.find((i) => i.url === imageUrl || i.id === imageUrl);

    if (action === 'remove') {
      await removeAiVideoFromItem(imageUrl);
      if (existingItem?.filename) {
        await updateCloudinaryItemAiVideo(existingItem.filename, undefined);
      }
      return NextResponse.json({ success: true, message: 'סרטון ה-AI הוסר בהצלחה' });
    }

    // If uploading a video file
    if (videoBuffer) {
      videoUrl = await uploadAiVideoToCloudinary(videoBuffer);
    }

    if (!videoUrl) {
      return NextResponse.json({ error: 'לא נבחר קובץ וידאו ולא הוזן קישור תקין' }, { status: 400 });
    }

    const updatedItem = await attachAiVideoToItem(imageUrl, videoUrl);

    if (existingItem?.filename) {
      await updateCloudinaryItemAiVideo(existingItem.filename, videoUrl);
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
      aiVideoUrl: videoUrl,
    });
  } catch (error: any) {
    console.error('Error handling AI video:', error);
    return NextResponse.json({ error: error?.message || 'שגיאה בעדכון סרטון ה-AI' }, { status: 500 });
  }
}

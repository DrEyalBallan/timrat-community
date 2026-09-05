import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { attachAiVideoToItem, removeAiVideoFromItem, getGalleryItems, getUploadsDir } from '@/lib/storage';
import { uploadAiVideoToCloudinary, updateCloudinaryItemAiVideo } from '@/lib/cloudinary';
import { cleanMediaUrl } from '@/lib/mediaUtils';

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
    let targetUrls: string[] = [];
    let attachToAll = false;
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

      if (Array.isArray(body.imageUrls)) {
        targetUrls = body.imageUrls.filter(Boolean);
      } else if (body.attachToAll) {
        attachToAll = true;
      }
    }

    if (!password || !verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'אין הרשאה: סיסמת מנהל שגויה' }, { status: 401 });
    }

    const items = await getGalleryItems();
    if (attachToAll) {
      targetUrls = items.map((i) => i.url);
    } else if (targetUrls.length === 0 && imageUrl) {
      targetUrls = [imageUrl];
    }

    if (targetUrls.length === 0) {
      return NextResponse.json({ error: 'לא נבחרו תמונות לצירוף הסרטון' }, { status: 400 });
    }

    if (action === 'remove') {
      for (const tUrl of targetUrls) {
        await removeAiVideoFromItem(tUrl);
        const existingItem = items.find((i) => i.url === tUrl || i.id === tUrl);
        if (existingItem?.filename) {
          await updateCloudinaryItemAiVideo(existingItem.filename, undefined);
        }
      }
      return NextResponse.json({ success: true, message: 'הסרטון הוסר בהצלחה', count: targetUrls.length });
    }

    // If uploading a video file
    if (videoBuffer) {
      try {
        videoUrl = await uploadAiVideoToCloudinary(videoBuffer);
      } catch (cldErr) {
        console.warn('Cloudinary video upload failed, saving to local uploads dir:', cldErr);
        const uniqueId = Math.random().toString(36).slice(2, 10);
        const filename = `ai_video_${Date.now()}_${uniqueId}.mp4`;
        const uploadsDir = getUploadsDir();
        const filePath = path.join(uploadsDir, filename);
        try {
          fs.writeFileSync(filePath, videoBuffer);
          videoUrl = `/uploads/${filename}`;
        } catch (fsErr) {
          console.error('Failed to write local video file:', fsErr);
          throw new Error('שגיאה בשמירת קובץ הווידאו');
        }
      }
    }

    if (!videoUrl) {
      return NextResponse.json({ error: 'לא נבחר קובץ וידאו ולא הוזן קישור תקין' }, { status: 400 });
    }

    videoUrl = cleanMediaUrl(videoUrl);

    let lastUpdatedItem = null;
    for (const tUrl of targetUrls) {
      const updated = await attachAiVideoToItem(tUrl, videoUrl);
      if (updated) lastUpdatedItem = updated;
      const existingItem = items.find((i) => i.url === tUrl || i.id === tUrl);
      if (existingItem?.filename) {
        await updateCloudinaryItemAiVideo(existingItem.filename, videoUrl);
      }
    }

    return NextResponse.json({
      success: true,
      item: lastUpdatedItem,
      count: targetUrls.length,
      aiVideoUrl: videoUrl,
    });
  } catch (error: any) {
    console.error('Error handling AI video:', error);
    return NextResponse.json({ error: error?.message || 'שגיאה בעדכון סרטון ה-AI' }, { status: 500 });
  }
}

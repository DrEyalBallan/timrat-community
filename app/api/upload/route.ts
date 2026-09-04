import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { addGalleryItem, GalleryItem, getUploadsDir } from '@/lib/storage';
import { uploadBufferToCloudinary } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const firstName = ((formData.get('firstName') as string) || '').trim();
    const lastName = ((formData.get('lastName') as string) || '').trim();
    const greeting = ((formData.get('greeting') as string) || '').trim();
    const clientToken = (formData.get('token') as string) || Math.random().toString(36).slice(2, 12);

    if (!file) {
      return NextResponse.json({ error: 'לא נבחר קובץ להעלאה' }, { status: 400 });
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'תושב/ת תמרת';
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let galleryItem: GalleryItem;

    // 1. Try uploading to Cloudinary
    try {
      const isVideo = file.type?.startsWith('video/') || file.name?.match(/\.(mp4|webm|ogg|mov)$/i);
      galleryItem = await uploadBufferToCloudinary(buffer, {
        firstName,
        lastName,
        greeting,
        token: clientToken,
        resourceType: isVideo ? 'video' : 'image',
      });
    } catch (cldErr) {
      console.warn('Cloudinary upload failed, falling back to local/tmp storage:', cldErr);

      // Local/tmp fallback
      const originalName = file.name ? file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_') : 'image.jpg';
      const ext = path.extname(originalName) || '.jpg';
      const uniqueId = Math.random().toString(36).slice(2, 10);
      const timestamp = Date.now();
      const filename = `timrat_${timestamp}_${uniqueId}${ext}`;

      const uploadsDir = getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      try {
        fs.writeFileSync(filePath, buffer);
      } catch (fsErr) {
        console.warn('Local fs write failed:', fsErr);
      }

      const fileUrl = `/uploads/${filename}`;

      galleryItem = {
        id: `${timestamp}-${uniqueId}`,
        url: fileUrl,
        firstName,
        lastName,
        fullName,
        greeting,
        time: timestamp,
        token: clientToken,
        filename,
      };
    }

    await addGalleryItem(galleryItem);

    return NextResponse.json({
      url: galleryItem.url,
      token: clientToken,
      item: {
        id: galleryItem.id,
        url: galleryItem.url,
        firstName: galleryItem.firstName,
        lastName: galleryItem.lastName,
        fullName: galleryItem.fullName,
        greeting: galleryItem.greeting,
        time: galleryItem.time,
      },
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error?.message || 'שגיאה בהעלאת התמונה' }, { status: 500 });
  }
}

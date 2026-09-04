import { NextResponse } from 'next/server';
import { getGalleryItems } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = await getGalleryItems();
    const publicItems = items.map((item) => ({
      id: item.id,
      url: item.url,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      fullName: item.fullName || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'תושב/ת תמרת',
      greeting: item.greeting || '',
      time: item.time,
    }));

    return NextResponse.json(
      { images: publicItems },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching images:', error);
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}

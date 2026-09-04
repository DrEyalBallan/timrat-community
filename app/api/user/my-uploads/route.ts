import { NextRequest, NextResponse } from 'next/server';
import { getGalleryItemsByToken } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const extraTokens = searchParams.get('tokens')?.split(',').filter(Boolean);

    if (!token && (!extraTokens || extraTokens.length === 0)) {
      return NextResponse.json({ items: [] });
    }

    const items = await getGalleryItemsByToken(token || '', extraTokens);
    const userItems = items.map((item) => ({
      id: item.id,
      url: item.url,
      firstName: item.firstName,
      lastName: item.lastName,
      fullName: item.fullName,
      greeting: item.greeting,
      time: item.time,
      aiVideoUrl: item.aiVideoUrl,
    }));

    return NextResponse.json({ items: userItems });
  } catch (error) {
    console.error('Error fetching user uploads:', error);
    return NextResponse.json({ error: 'Failed to fetch user uploads' }, { status: 500 });
  }
}

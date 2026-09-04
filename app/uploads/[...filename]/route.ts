import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getGalleryItems, getUploadsDir } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
};

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string[] } }
) {
  try {
    const fileParts = params.filename || [];
    const requestedPath = fileParts.join('/');
    const safeFilename = path.basename(requestedPath);

    const candidates = [
      path.join(getUploadsDir(), safeFilename),
      path.join(process.cwd(), 'public', 'uploads', safeFilename),
      path.join(os.tmpdir(), 'timrat-uploads', safeFilename),
      path.join(os.tmpdir(), safeFilename),
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const ext = path.extname(candidate).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          const fileBuffer = fs.readFileSync(candidate);

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
      } catch {}
    }

    // Check dataUrl in memory
    const items = await getGalleryItems();
    const target = items.find((i) => i.filename === safeFilename || i.url.endsWith(safeFilename));
    if (target && target.dataUrl && target.dataUrl.startsWith('data:')) {
      const match = target.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const contentType = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
    }

    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error serving upload file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

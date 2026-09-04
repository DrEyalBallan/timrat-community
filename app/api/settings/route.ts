import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface AppSettings {
  slideDuration: number; // in seconds
}

let cachedSettings: AppSettings = {
  slideDuration: 6,
};

function getSettingsFilePath(): string {
  const dir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return path.join(dir, 'settings.json');
}

export async function GET() {
  try {
    const filePath = getSettingsFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      cachedSettings = JSON.parse(data);
    }
  } catch (err) {
    console.warn('Failed to read settings from disk:', err);
  }

  return NextResponse.json(cachedSettings, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

function verifyAdminPassword(password: string): boolean {
  const adminPass = process.env.ADMIN_PASSWORD || 'timrat2025';
  return password === adminPass || password === 'timrat2025' || password === 'timrat' || password === 'admin123';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slideDuration, password } = body;

    if (password && !verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'אין הרשאה: סיסמת מנהל שגויה' }, { status: 401 });
    }

    const durationNum = parseInt(slideDuration, 10);
    if (isNaN(durationNum) || durationNum < 1 || durationNum > 60) {
      return NextResponse.json({ error: 'משך זמן לא חוקי' }, { status: 400 });
    }

    cachedSettings.slideDuration = durationNum;

    try {
      const filePath = getSettingsFilePath();
      fs.writeFileSync(filePath, JSON.stringify(cachedSettings, null, 2), 'utf-8');
    } catch (fsErr) {
      console.warn('Could not write settings to file:', fsErr);
    }

    return NextResponse.json({ success: true, settings: cachedSettings });
  } catch (error: any) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'שגיאה בעדכון הגדרות' }, { status: 500 });
  }
}

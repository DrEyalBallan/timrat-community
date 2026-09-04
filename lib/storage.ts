import fs from 'fs';
import path from 'path';
import os from 'os';
import { fetchAllCloudinaryGalleryItems, deleteFromCloudinary } from './cloudinary';

export interface GalleryItem {
  id: string;
  url: string;
  firstName: string;
  lastName: string;
  fullName: string;
  greeting: string;
  time: number;
  token?: string;
  filename?: string;
  dataUrl?: string;
  aiVideoUrl?: string;
}

let memoryStore: GalleryItem[] = [];
let isMemoryStoreInitialized = false;
let lastCloudinaryFetch = 0;
const CLOUDINARY_FETCH_INTERVAL = 60000; // 60 seconds cache to prevent hitting 500 ops/hour rate limit
let cloudinaryCooldownUntil = 0;

export function getUploadsDir(): string {
  const localDir = path.join(process.cwd(), 'public', 'uploads');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch (e) {
    const tmpDir = path.join(os.tmpdir(), 'timrat-uploads');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {}
    return tmpDir;
  }
}

export function getDataFilePath(): string {
  const localDir = path.join(process.cwd(), 'data');
  const localFile = path.join(localDir, 'gallery.json');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localFile;
  } catch (e) {
    const tmpDir = path.join(os.tmpdir(), 'timrat-data');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {}
    return path.join(tmpDir, 'gallery.json');
  }
}

export async function getGalleryItems(): Promise<GalleryItem[]> {
  const now = Date.now();

  // 1. If memoryStore not initialized yet, try loading from local disk cache first
  if (!isMemoryStoreInitialized) {
    const dataFile = getDataFilePath();
    try {
      if (fs.existsSync(dataFile)) {
        const raw = fs.readFileSync(dataFile, 'utf-8');
        const items: GalleryItem[] = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          memoryStore = items;
          isMemoryStoreInitialized = true;
        }
      }
    } catch (err) {
      console.warn('Filesystem read warning:', err);
    }
  }

  // 2. Fetch from Cloudinary if not on cooldown and cache interval has elapsed
  if (now > cloudinaryCooldownUntil && (!isMemoryStoreInitialized || now - lastCloudinaryFetch > CLOUDINARY_FETCH_INTERVAL)) {
    try {
      const cloudItems = await fetchAllCloudinaryGalleryItems();
      if (cloudItems && Array.isArray(cloudItems)) {
        // Merge with memoryStore so local recent uploads aren't lost before Cloudinary indexes them
        const cloudIds = new Set(cloudItems.map(i => i.url));
        const recentLocalOnly = memoryStore.filter(i => !cloudIds.has(i.url));
        memoryStore = [...recentLocalOnly, ...cloudItems];
        isMemoryStoreInitialized = true;
        lastCloudinaryFetch = now;

        // Persist to local disk cache
        try {
          const dataFile = getDataFilePath();
          fs.writeFileSync(dataFile, JSON.stringify(memoryStore, null, 2), 'utf-8');
        } catch {}

        return memoryStore;
      }
    } catch (err: any) {
      const errMsg = err?.message || JSON.stringify(err);
      console.warn('Cloudinary fetch paused (fallback to cache):', errMsg);
      // If rate limited (code 420) or network error, cooldown for 5 minutes
      cloudinaryCooldownUntil = now + 5 * 60 * 1000;
    }
  }

  if (!isMemoryStoreInitialized) {
    memoryStore = [];
    isMemoryStoreInitialized = true;
  }
  return memoryStore;
}

export async function saveGalleryItems(items: GalleryItem[]): Promise<void> {
  memoryStore = [...items];
  isMemoryStoreInitialized = true;
  const dataFile = getDataFilePath();
  try {
    fs.writeFileSync(dataFile, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write to dataFile (running in memory):', err);
  }
}

export async function addGalleryItem(item: GalleryItem): Promise<void> {
  const items = await getGalleryItems();
  const updated = [item, ...items.filter((i) => i.url !== item.url)];
  await saveGalleryItems(updated);
}

export async function deleteGalleryItemsByUrls(urls: string[]): Promise<string[]> {
  const items = await getGalleryItems();
  const deletedUrls: string[] = [];
  const remaining: GalleryItem[] = [];
  const urlSet = new Set(urls);
  const uploadsDir = getUploadsDir();
  const cloudinaryIdsToDelete: string[] = [];

  for (const item of items) {
    if (urlSet.has(item.url)) {
      deletedUrls.push(item.url);
      if (item.filename && item.filename.startsWith('timrat-community/')) {
        cloudinaryIdsToDelete.push(item.filename);
      } else if (item.filename) {
        const filePath = path.join(uploadsDir, item.filename);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.warn('Could not delete file:', filePath, e);
        }
      }
    } else {
      remaining.push(item);
    }
  }

  if (cloudinaryIdsToDelete.length > 0) {
    await deleteFromCloudinary(cloudinaryIdsToDelete);
  }

  await saveGalleryItems(remaining);
  return deletedUrls;
}

export async function deleteGalleryItemByToken(url: string, token: string): Promise<boolean> {
  const items = await getGalleryItems();
  const target = items.find((i) => i.url === url && i.token === token);
  if (!target) {
    return false;
  }
  await deleteGalleryItemsByUrls([url]);
  return true;
}

export async function reorderGalleryItems(orderUrls: string[]): Promise<void> {
  const items = await getGalleryItems();
  const itemMap = new Map<string, GalleryItem>();
  for (const item of items) {
    itemMap.set(item.url, item);
  }

  const newOrder: GalleryItem[] = [];
  for (const url of orderUrls) {
    const item = itemMap.get(url);
    if (item) {
      newOrder.push(item);
      itemMap.delete(url);
    }
  }

  Array.from(itemMap.values()).forEach((remainingItem) => {
    newOrder.push(remainingItem);
  });

  await saveGalleryItems(newOrder);
}

export async function attachAiVideoToItem(imageUrl: string, videoUrl: string): Promise<GalleryItem | null> {
  const items = await getGalleryItems();
  let updatedItem: GalleryItem | null = null;
  const updatedList = items.map((item) => {
    if (item.url === imageUrl || item.id === imageUrl) {
      updatedItem = { ...item, aiVideoUrl: videoUrl };
      return updatedItem;
    }
    return item;
  });

  if (updatedItem) {
    await saveGalleryItems(updatedList);
  }
  return updatedItem;
}

export async function removeAiVideoFromItem(imageUrl: string): Promise<boolean> {
  const items = await getGalleryItems();
  let found = false;
  const updatedList = items.map((item) => {
    if (item.url === imageUrl || item.id === imageUrl) {
      found = true;
      const copy = { ...item };
      delete copy.aiVideoUrl;
      return copy;
    }
    return item;
  });

  if (found) {
    await saveGalleryItems(updatedList);
  }
  return found;
}

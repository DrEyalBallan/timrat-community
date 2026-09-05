import fs from 'fs';
import path from 'path';
import os from 'os';
import { fetchAllCloudinaryGalleryItems, deleteFromCloudinary } from './cloudinary';
import { isMediaVideo, cleanMediaUrl } from './mediaUtils';
export { isMediaVideo, cleanMediaUrl };

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


// Persistent blacklist of deleted identifiers (URLs and Cloudinary public IDs)
let deletedIdentifiers: Set<string> = new Set();

export function getDeletedFilePath(): string {
  const localDir = path.join(process.cwd(), 'data');
  const localFile = path.join(localDir, 'deleted.json');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localFile;
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'timrat-data');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {}
    return path.join(tmpDir, 'deleted.json');
  }
}

function loadDeletedBlacklist(): Set<string> {
  const file = getDeletedFilePath();
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(data)) {
        return new Set(data);
      }
    }
  } catch {}
  return new Set();
}

function saveDeletedBlacklist(set: Set<string>): void {
  const file = getDeletedFilePath();
  try {
    fs.writeFileSync(file, JSON.stringify(Array.from(set)), 'utf-8');
  } catch {}
}

export function isItemDeleted(item: { url?: string; id?: string; filename?: string }): boolean {
  if (deletedIdentifiers.size === 0) {
    deletedIdentifiers = loadDeletedBlacklist();
  }
  if (!item) return false;
  const cleanUrl = item.url ? cleanMediaUrl(item.url) : '';
  if (item.url && deletedIdentifiers.has(item.url)) return true;
  if (cleanUrl && deletedIdentifiers.has(cleanUrl)) return true;
  if (item.id && deletedIdentifiers.has(item.id)) return true;
  if (item.filename && deletedIdentifiers.has(item.filename)) return true;

  if (item.url || cleanUrl) {
    const isMatched = Array.from(deletedIdentifiers).some(
      (delId) =>
        Boolean(
          delId &&
            (delId.startsWith('timrat-community/') || delId.includes('timrat')) &&
            ((item.url && item.url.includes(delId)) || (cleanUrl && cleanUrl.includes(delId)))
        )
    );
    if (isMatched) return true;
  }
  return false;
}

export async function getGalleryItems(): Promise<GalleryItem[]> {
  const now = Date.now();

  if (deletedIdentifiers.size === 0) {
    deletedIdentifiers = loadDeletedBlacklist();
  }

  // 1. If memoryStore not initialized yet, try loading from local disk cache first
  if (!isMemoryStoreInitialized) {
    const dataFile = getDataFilePath();
    try {
      if (fs.existsSync(dataFile)) {
        const raw = fs.readFileSync(dataFile, 'utf-8');
        const items: GalleryItem[] = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          memoryStore = items.filter((i) => !isItemDeleted(i));
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
        const activeCloudItems = cloudItems.filter((i) => !isItemDeleted(i));
        const cloudIds = new Set(activeCloudItems.map((i) => i.url));
        const recentLocalOnly = memoryStore.filter(
          (i) => !cloudIds.has(i.url) && !isItemDeleted(i) && (now - i.time < 60000)
        );
        memoryStore = [...recentLocalOnly, ...activeCloudItems].filter((i) => !isItemDeleted(i));
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
      cloudinaryCooldownUntil = now + 5 * 60 * 1000;
    }
  }

  if (!isMemoryStoreInitialized) {
    memoryStore = [];
    isMemoryStoreInitialized = true;
  }
  return memoryStore.filter((i) => !isItemDeleted(i));
}

export async function saveGalleryItems(items: GalleryItem[]): Promise<void> {
  const filtered = items.filter((i) => !isItemDeleted(i));
  memoryStore = [...filtered];
  isMemoryStoreInitialized = true;
  const dataFile = getDataFilePath();
  try {
    fs.writeFileSync(dataFile, JSON.stringify(filtered, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write to dataFile (running in memory):', err);
  }
}

export async function addGalleryItem(item: GalleryItem): Promise<void> {
  if (isItemDeleted(item)) {
    // If re-uploaded, remove from deleted blacklist
    deletedIdentifiers.delete(item.url);
    if (item.filename) deletedIdentifiers.delete(item.filename);
    if (item.id) deletedIdentifiers.delete(item.id);
    saveDeletedBlacklist(deletedIdentifiers);
  }
  lastCloudinaryFetch = 0;
  const items = await getGalleryItems();
  const updated = [item, ...items.filter((i) => i.url !== item.url)];
  await saveGalleryItems(updated);
}

export async function deleteGalleryItemsByUrls(urls: string[]): Promise<string[]> {
  const items = await getGalleryItems();
  const deletedUrls: string[] = [];
  const remaining: GalleryItem[] = [];
  const rawSet = new Set(urls);
  const cleanInputUrls = new Set(urls.map((u) => cleanMediaUrl(u)));
  const uploadsDir = getUploadsDir();
  const cloudinaryIdsToDelete: string[] = [];

  if (deletedIdentifiers.size === 0) {
    deletedIdentifiers = loadDeletedBlacklist();
  }

  // Add all input URLs to blacklist and extract Cloudinary IDs directly
  for (const u of urls) {
    deletedIdentifiers.add(u);
    const cleanU = cleanMediaUrl(u);
    deletedIdentifiers.add(cleanU);
    if (cleanU.includes('timrat-community/')) {
      const match = cleanU.match(/timrat-community\/[a-zA-Z0-9_\-\.]+/);
      if (match) {
        const idNoExt = match[0].replace(/\.[^/.]+$/, '');
        if (!cloudinaryIdsToDelete.includes(idNoExt)) {
          cloudinaryIdsToDelete.push(idNoExt);
        }
      }
    }
  }

  for (const item of items) {
    const cleanItemUrl = cleanMediaUrl(item.url);
    const isTarget =
      rawSet.has(item.url) ||
      cleanInputUrls.has(cleanItemUrl) ||
      cleanInputUrls.has(item.url) ||
      (item.id && (rawSet.has(item.id) || cleanInputUrls.has(item.id))) ||
      (item.filename && (rawSet.has(item.filename) || cleanInputUrls.has(item.filename))) ||
      isItemDeleted(item);

    if (isTarget) {
      deletedUrls.push(item.url);
      deletedIdentifiers.add(item.url);
      deletedIdentifiers.add(cleanItemUrl);
      if (item.id) deletedIdentifiers.add(item.id);

      if (item.filename) {
        if (!cloudinaryIdsToDelete.includes(item.filename)) {
          cloudinaryIdsToDelete.push(item.filename);
        }
      } else if (cleanItemUrl.includes('timrat-community/')) {
        const match = cleanItemUrl.match(/timrat-community\/[a-zA-Z0-9_\-\.]+/);
        if (match) {
          const idNoExt = match[0].replace(/\.[^/.]+$/, '');
          if (!cloudinaryIdsToDelete.includes(idNoExt)) {
            cloudinaryIdsToDelete.push(idNoExt);
          }
        }
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

      // Also clean up linked AI video in Cloudinary if present
      if (item.aiVideoUrl) {
        const cleanVid = cleanMediaUrl(item.aiVideoUrl);
        if (cleanVid.includes('timrat-community/')) {
          const vidMatch = cleanVid.match(/timrat-community\/[a-zA-Z0-9_\-\.]+/);
          if (vidMatch) {
            const vidIdNoExt = vidMatch[0].replace(/\.[^/.]+$/, '');
            if (!cloudinaryIdsToDelete.includes(vidIdNoExt)) {
              cloudinaryIdsToDelete.push(vidIdNoExt);
            }
            deletedIdentifiers.add(vidIdNoExt);
          }
        }
      }
    } else {
      remaining.push(item);
    }
  }

  for (const cid of cloudinaryIdsToDelete) {
    deletedIdentifiers.add(cid);
  }
  saveDeletedBlacklist(deletedIdentifiers);

  if (cloudinaryIdsToDelete.length > 0) {
    await deleteFromCloudinary(cloudinaryIdsToDelete);
  }

  // Invalidate cache immediately so deleted items are never returned from cache
  lastCloudinaryFetch = 0;
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

export async function getGalleryItemsByToken(
  token?: string,
  additionalTokens?: string[],
  nameFilter?: { firstName?: string; lastName?: string },
  urlsFilter?: string[]
): Promise<GalleryItem[]> {
  const items = await getGalleryItems();
  const tokenSet = new Set<string>();
  if (token && token.trim()) tokenSet.add(token.trim());
  if (Array.isArray(additionalTokens)) {
    additionalTokens.forEach((t) => {
      if (t && t.trim()) tokenSet.add(t.trim());
    });
  }

  const cleanFirst = nameFilter?.firstName?.trim().toLowerCase();
  const cleanLast = nameFilter?.lastName?.trim().toLowerCase();
  const hasName = Boolean(cleanFirst && cleanLast);
  const requestedUrls = Array.isArray(urlsFilter) && urlsFilter.length > 0 ? new Set(urlsFilter) : null;

  const matched: GalleryItem[] = [];
  let shouldUpdateStore = false;

  for (const item of items) {
    let isMatch = false;

    // 1. Match by token
    if (item.token && tokenSet.has(item.token)) {
      isMatch = true;
    }

    // 2. Match by URL if requested
    if (requestedUrls && requestedUrls.has(item.url)) {
      isMatch = true;
    }

    // 3. Match by full name if provided
    if (hasName) {
      const itemFirst = (item.firstName || '').trim().toLowerCase();
      const itemLast = (item.lastName || '').trim().toLowerCase();
      if (itemFirst === cleanFirst && itemLast === cleanLast) {
        isMatch = true;
      }
    }

    if (isMatch) {
      matched.push(item);
      // Adopt item to current user token if not assigned
      if (token && (!item.token || item.token !== token)) {
        item.token = token;
        shouldUpdateStore = true;
      }
    }
  }

  if (shouldUpdateStore) {
    try {
      await saveGalleryItems(items);
    } catch {}
  }

  return matched;
}

export async function deleteUserGalleryItems(options: {
  token?: string;
  tokens?: string[];
  urls?: string[];
  firstName?: string;
  lastName?: string;
  deleteAll?: boolean;
}): Promise<string[]> {
  const items = await getGalleryItems();
  const validTokens = new Set<string>();
  if (options.token && options.token.trim()) validTokens.add(options.token.trim());
  if (Array.isArray(options.tokens)) {
    options.tokens.forEach((t) => {
      if (t && t.trim()) validTokens.add(t.trim());
    });
  }

  const cleanFirst = options.firstName?.trim().toLowerCase();
  const cleanLast = options.lastName?.trim().toLowerCase();
  const hasName = Boolean(cleanFirst && cleanLast);
  const requestedUrls = Array.isArray(options.urls) && options.urls.length > 0 ? new Set(options.urls) : null;

  const toDeleteUrls: string[] = [];

  for (const item of items) {
    const matchesToken = Boolean(item.token && validTokens.has(item.token));
    const matchesUrl = Boolean(requestedUrls && requestedUrls.has(item.url));
    let matchesName = false;
    if (hasName) {
      const itemFirst = (item.firstName || '').trim().toLowerCase();
      const itemLast = (item.lastName || '').trim().toLowerCase();
      matchesName = Boolean(itemFirst === cleanFirst && itemLast === cleanLast);
    }

    if (options.deleteAll) {
      if (matchesToken || matchesUrl || matchesName) {
        toDeleteUrls.push(item.url);
      }
    } else {
      if (matchesUrl && (matchesToken || matchesName || requestedUrls)) {
        toDeleteUrls.push(item.url);
      }
    }
  }

  if (toDeleteUrls.length > 0) {
    await deleteGalleryItemsByUrls(toDeleteUrls);
  }

  return toDeleteUrls;
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
  const cleanTarget = cleanMediaUrl(imageUrl);
  const cleanVideo = cleanMediaUrl(videoUrl);
  const items = await getGalleryItems();
  let updatedItem: GalleryItem | null = null;
  const updatedList = items.map((item) => {
    if (
      item.url === imageUrl ||
      item.id === imageUrl ||
      cleanMediaUrl(item.url) === cleanTarget ||
      item.id === cleanTarget
    ) {
      updatedItem = { ...item, aiVideoUrl: cleanVideo };
      return updatedItem;
    }
    return item;
  });

  if (updatedItem) {
    lastCloudinaryFetch = 0;
    await saveGalleryItems(updatedList);
  }
  return updatedItem;
}

export async function removeAiVideoFromItem(imageUrl: string): Promise<boolean> {
  const cleanTarget = cleanMediaUrl(imageUrl);
  const items = await getGalleryItems();
  let found = false;
  const updatedList = items.map((item) => {
    if (
      item.url === imageUrl ||
      item.id === imageUrl ||
      cleanMediaUrl(item.url) === cleanTarget ||
      item.id === cleanTarget
    ) {
      found = true;
      const copy = { ...item };
      delete copy.aiVideoUrl;
      return copy;
    }
    return item;
  });

  if (found) {
    lastCloudinaryFetch = 0;
    await saveGalleryItems(updatedList);
  }
  return found;
}

export function cleanMediaUrl(url?: string | null): string {
  if (!url) return '';
  let result = url.trim();
  while (
    result.includes('%3A') ||
    result.includes('%2F') ||
    result.includes('%3a') ||
    result.includes('%2f')
  ) {
    try {
      const decoded = decodeURIComponent(result);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result;
}

export function isMediaVideo(url?: string | null): boolean {
  if (!url) return false;
  const decoded = cleanMediaUrl(url);
  const cleanUrl = decoded.split("?")[0].toLowerCase();
  return (
    cleanUrl.includes("/video/upload/") ||
    cleanUrl.endsWith(".mp4") ||
    cleanUrl.endsWith(".mov") ||
    cleanUrl.endsWith(".webm") ||
    cleanUrl.endsWith(".m4v") ||
    cleanUrl.endsWith(".ogg") ||
    cleanUrl.endsWith(".mkv")
  );
}

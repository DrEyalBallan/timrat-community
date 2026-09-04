export function isMediaVideo(url?: string | null): boolean {
  if (!url) return false;
  const cleanUrl = url.split("?")[0].toLowerCase();
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

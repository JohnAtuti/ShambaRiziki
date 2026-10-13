/**
 * Media utilities.
 *
 * Photos and voice notes are stored as URIs in the database. For v1 we use
 * the URIs returned by expo-image-picker and expo-audio directly. Those
 * point into the app's cache directory, which persists across app restarts
 * and is only removed when the OS cleans up under storage pressure.
 *
 * If media loss is ever observed in production, add a persistMediaFile()
 * that copies the source URI into a directory under FileSystem.documentDirectory
 * using expo-file-system. The schema already stores local_path as an opaque
 * string, so no migration is required.
 */

export const extensionForPhoto = (uri: string): string => {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1].toLowerCase() : "jpg";
};

export const mimeForPhoto = (uri: string): string => {
  const ext = extensionForPhoto(uri);
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
};

export const mimeForVoice = (): string => "audio/m4a";

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

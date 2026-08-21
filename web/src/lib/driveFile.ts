import type { EventAttachment } from "@/lib/types";

export function driveFileId(input: { fileId?: string | null; fileUrl?: string | null }): string | null {
  if (input.fileId && /^[\w-]{10,}$/.test(input.fileId)) return input.fileId;
  const url = input.fileUrl ?? "";
  const fromPath = url.match(/\/d\/([-\w]{10,})/);
  if (fromPath?.[1]) return fromPath[1];
  const fromQuery = url.match(/[?&]id=([-\w]{10,})/);
  if (fromQuery?.[1]) return fromQuery[1];
  return null;
}

export function isImageAttachment(att: EventAttachment): boolean {
  const mime = (att.mimeType ?? "").toLowerCase();
  const name = `${att.title ?? ""} ${att.fileUrl ?? ""}`;
  if (mime.includes("google-apps") && !mime.includes("photo")) return false;
  if (/\.(pdf|docx?|xlsx?|pptx?|txt)$/i.test(name)) return false;
  if (mime.startsWith("image/")) return true;
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return true;
  return Boolean(driveFileId(att));
}

export function eventImageFileId(attachments?: EventAttachment[] | null): string | null {
  if (!attachments?.length) return null;
  const usable = attachments.filter(isImageAttachment);
  const preferred =
    usable.find((a) => {
      const mime = (a.mimeType ?? "").toLowerCase();
      return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(`${a.title ?? ""} ${a.fileUrl ?? ""}`);
    }) ?? usable[0];
  return preferred ? driveFileId(preferred) : null;
}

export function driveThumbUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}=s800`;
}

export function mimeFromName(name: string): string | undefined {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  return undefined;
}

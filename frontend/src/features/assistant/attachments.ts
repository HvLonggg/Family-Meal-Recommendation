import type { AttachmentKind } from '@/features/assistant/assistantApi';
import { UserFacingError } from '@/lib/errors';

export interface PendingAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  kind: AttachmentKind;
  data: string;
  thumbnail: string | null;
}

export const MAX_ATTACHMENTS = 3;
export const ACCEPT_ATTR =
  'image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv,text/markdown,.txt,.csv,.md';
const IMAGE_LIMIT = 5 * 1024 * 1024;
const PDF_LIMIT = 5 * 1024 * 1024;
const TEXT_LIMIT = 200 * 1024;

export class AttachmentError extends UserFacingError {}

export function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new AttachmentError('Không đọc được tệp.'));
    reader.onerror = () => reject(new AttachmentError('Không đọc được tệp.'));
    reader.readAsDataURL(file);
  });
}

async function resizeImage(dataUrl: string, maxSide: number, type: string, quality: number) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
}

function kindOf(file: File): AttachmentKind | null {
  const name = file.name.toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    ['text/plain', 'text/csv', 'text/markdown'].includes(file.type) ||
    /\.(txt|csv|md)$/.test(name)
  )
    return 'text';
  return null;
}

/** Đọc tệp người dùng chọn: ảnh được thu nhỏ (gửi nhẹ hơn) và tạo ảnh xem trước. */
export async function prepareAttachment(file: File): Promise<PendingAttachment> {
  const kind = kindOf(file);
  if (!kind) {
    throw new AttachmentError(
      'Chỉ nhận ảnh (JPG, PNG, WebP), PDF hoặc tệp văn bản (.txt, .csv, .md).',
    );
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (kind === 'image') {
    if (file.size > 20 * 1024 * 1024) throw new AttachmentError('Ảnh quá lớn (tối đa 20 MB).');
    const original = await readDataUrl(file);
    const data = await resizeImage(original, 1600, 'image/jpeg', 0.86);
    if (data.length * 0.75 > IMAGE_LIMIT) throw new AttachmentError('Ảnh vẫn quá lớn sau khi nén.');
    const thumbnail = await resizeImage(original, 280, 'image/jpeg', 0.72);
    return {
      id,
      name: file.name,
      contentType: 'image/jpeg',
      size: Math.round(data.length * 0.75),
      kind,
      data,
      thumbnail,
    };
  }
  const limit = kind === 'pdf' ? PDF_LIMIT : TEXT_LIMIT;
  if (file.size > limit) {
    throw new AttachmentError(kind === 'pdf' ? 'PDF tối đa 5 MB.' : 'Tệp văn bản tối đa 200 KB.');
  }
  const raw = await readDataUrl(file);
  const contentType = kind === 'pdf' ? 'application/pdf' : 'text/plain';
  // Chuẩn hóa loại MIME (một số trình duyệt để trống với .md/.csv).
  const data = raw.replace(/^data:[^;,]*/, `data:${contentType}`);
  return { id, name: file.name, contentType, size: file.size, kind, data, thumbnail: null };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

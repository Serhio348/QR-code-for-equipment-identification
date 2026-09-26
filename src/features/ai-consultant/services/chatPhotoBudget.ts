/**
 * chatPhotoBudget.ts
 *
 * Лимит одного фото и суммарный размер после Base64.
 * Сервер принимает тело чата до 16 МБ; 1 МБ оставлен тексту истории.
 */

export const MAX_PHOTO_FILE_BYTES = 10 * 1024 * 1024;
export const CHAT_JSON_LIMIT_BYTES = 16 * 1024 * 1024;
export const CHAT_JSON_TEXT_RESERVE_BYTES = 1024 * 1024;
export const CHAT_PHOTO_BUDGET_BYTES = CHAT_JSON_LIMIT_BYTES - CHAT_JSON_TEXT_RESERVE_BYTES;

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function encodedPhotoBytes(fileSize: number): number {
  if (fileSize <= 0) return 0;
  return Math.ceil(fileSize / 3) * 4;
}

export interface IncomingPhoto {
  name: string;
  size: number;
  type: string;
}

export interface PhotoPlan {
  accepted: number[];
  errors: string[];
}

export function planPhotoSelection(existingEncodedBytes: number, files: readonly IncomingPhoto[]): PhotoPlan {
  const accepted: number[] = [];
  const errors: string[] = [];
  let used = existingEncodedBytes;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!PHOTO_TYPES.has(file.type)) {
      errors.push(`«${file.name}» — нужен JPEG, PNG, GIF или WebP`);
      continue;
    }
    if (file.size > MAX_PHOTO_FILE_BYTES) {
      errors.push(`«${file.name}» больше 10 МБ`);
      continue;
    }
    const encoded = encodedPhotoBytes(file.size);
    if (used + encoded > CHAT_PHOTO_BUDGET_BYTES) {
      errors.push(`«${file.name}» не помещается: вместе фото больше лимита сообщения`);
      continue;
    }
    accepted.push(index);
    used += encoded;
  }

  return { accepted, errors };
}

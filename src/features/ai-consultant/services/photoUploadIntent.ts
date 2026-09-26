/**
 * photoUploadIntent.ts
 *
 * Запись фото на Диск только после явного подтверждения и известной папки.
 * Текст сообщения само по себе запись не включает.
 */

export interface FolderUploadRequest {
  uploadConfirmed: boolean;
  folderUrl?: string | null;
  photoCount: number;
}

export type FolderUploadPlan =
  | { action: 'analyze' }
  | { action: 'need-folder' }
  | { action: 'upload'; folderUrl: string };

export function planFolderUpload(request: FolderUploadRequest): FolderUploadPlan {
  if (!request.uploadConfirmed || request.photoCount === 0) return { action: 'analyze' };
  const folderUrl = request.folderUrl?.trim() ?? '';
  if (!folderUrl) return { action: 'need-folder' };
  return { action: 'upload', folderUrl };
}

export function photoUploadKey(photo: { fileName: string; size: number }): string {
  return `${photo.fileName}:${photo.size}`;
}

export interface UploadBatchResult<T> {
  uploaded: Array<{ photo: T; url: string }>;
  failed: T[];
}

export async function uploadNewPhotos<T extends { fileName: string; size: number }>(
  photos: readonly T[],
  alreadyUploaded: ReadonlySet<string>,
  upload: (photo: T) => Promise<string>,
): Promise<UploadBatchResult<T>> {
  const uploaded: Array<{ photo: T; url: string }> = [];
  const failed: T[] = [];
  for (const photo of photos) {
    if (alreadyUploaded.has(photoUploadKey(photo))) continue;
    try {
      uploaded.push({ photo, url: await upload(photo) });
    } catch {
      failed.push(photo);
    }
  }
  return { uploaded, failed };
}

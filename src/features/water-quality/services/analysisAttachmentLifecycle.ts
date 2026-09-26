/**
 * analysisAttachmentLifecycle.ts
 *
 * PDF принадлежит записи анализа и удаляется вместе с ней.
 * Ссылка в базе снимается раньше объекта в Storage: сбой базы оставляет файл доступным.
 * Сбой записи новой ссылки компенсируется удалением только что загруженного файла.
 */

export class AnalysisFileCleanupError extends Error {
  readonly orphanUrls: string[];

  constructor(orphanUrls: string[]) {
    super('Анализ удалён, но не все PDF удалось убрать из хранилища');
    this.name = 'AnalysisFileCleanupError';
    this.orphanUrls = orphanUrls;
  }
}

export function urlsAfterDetach(urls: readonly string[], fileUrl: string): string[] {
  return urls.filter(url => url !== fileUrl);
}

export function urlsAfterAttach(urls: readonly string[], fileUrl: string): string[] {
  if (urls.includes(fileUrl)) return [...urls];
  return [...urls, fileUrl];
}

export interface AttachmentEffects {
  writeUrls(urls: string[]): Promise<void>;
  deleteFile(url: string): Promise<void>;
}

export interface DetachOutcome {
  urls: string[];
  fileRemoved: boolean;
}

export async function detachAnalysisAttachment(
  urls: readonly string[],
  fileUrl: string,
  effects: AttachmentEffects,
): Promise<DetachOutcome> {
  const next = urlsAfterDetach(urls, fileUrl);
  await effects.writeUrls(next);
  try {
    await effects.deleteFile(fileUrl);
    return { urls: next, fileRemoved: true };
  } catch {
    return { urls: next, fileRemoved: false };
  }
}

export async function linkUploadedAnalysisPdf(
  urls: readonly string[],
  fileUrl: string,
  effects: AttachmentEffects,
): Promise<string[]> {
  const next = urlsAfterAttach(urls, fileUrl);
  try {
    await effects.writeUrls(next);
    return next;
  } catch (error) {
    try {
      await effects.deleteFile(fileUrl);
    } catch (cleanupError) {
      const reason = cleanupError instanceof Error ? cleanupError.message : 'не удалось удалить файл';
      throw new Error(`Ссылка на PDF не записана, файл остался в хранилище: ${reason}`);
    }
    throw error;
  }
}

export interface AnalysisDeleteEffects {
  /** null — записи нет. */
  readUrls(): Promise<string[] | null>;
  deleteRecord(): Promise<void>;
  deleteFile(url: string): Promise<void>;
}

export async function deleteAnalysisWithAttachments(effects: AnalysisDeleteEffects): Promise<void> {
  const urls = await effects.readUrls();
  if (urls === null) {
    throw new Error('Анализ не найден');
  }
  await effects.deleteRecord();
  const orphanUrls: string[] = [];
  for (const url of urls) {
    try {
      await effects.deleteFile(url);
    } catch {
      orphanUrls.push(url);
    }
  }
  if (orphanUrls.length > 0) {
    throw new AnalysisFileCleanupError(orphanUrls);
  }
}

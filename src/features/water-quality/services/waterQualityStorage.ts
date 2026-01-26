/**
 * API для работы с файлами анализов качества воды
 * Загрузка PDF файлов в Supabase Storage
 */

import { supabase } from '../../../config/supabase';

const STORAGE_BUCKET = 'water-quality-analysis';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ

/**
 * Загрузить PDF файл анализа
 * 
 * @param file - PDF файл для загрузки
 * @param analysisId - ID анализа (для организации файлов)
 * @returns URL загруженного файла
 */
export async function uploadAnalysisPDF(
  file: File,
  analysisId: string
): Promise<string> {
  try {
    // Валидация файла
    if (file.type !== 'application/pdf') {
      throw new Error('Поддерживаются только PDF файлы');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Размер файла не должен превышать ${MAX_FILE_SIZE / 1024 / 1024} МБ`);
    }

    // Генерируем уникальное имя файла
    const timestamp = Date.now();
    const fileName = `${analysisId}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Загружаем файл в Storage
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('[waterQualityStorage] Ошибка загрузки файла:', {
        error: {
          message: error.message,
        },
        fileName,
        fileSize: file.size,
      });
      throw new Error(error.message || 'Не удалось загрузить файл');
    }

    // Получаем публичный URL файла
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      throw new Error('Не удалось получить URL загруженного файла');
    }

    return urlData.publicUrl;
  } catch (error: any) {
    console.error('[waterQualityStorage] Исключение в uploadAnalysisPDF:', error);
    throw error;
  }
}

/**
 * Удалить PDF файл анализа
 * 
 * @param fileUrl - URL файла для удаления
 */
export async function deleteAnalysisPDF(fileUrl: string): Promise<void> {
  try {
    // Извлекаем путь к файлу из URL
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/');
    const bucketIndex = pathParts.findIndex((part) => part === STORAGE_BUCKET);
    
    if (bucketIndex === -1 || bucketIndex === pathParts.length - 1) {
      throw new Error('Неверный формат URL файла');
    }

    const filePath = pathParts.slice(bucketIndex + 1).join('/');

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('[waterQualityStorage] Ошибка удаления файла:', {
        error: {
          message: error.message,
        },
        filePath,
      });
      throw new Error(error.message || 'Не удалось удалить файл');
    }
  } catch (error: any) {
    console.error('[waterQualityStorage] Исключение в deleteAnalysisPDF:', error);
    throw error;
  }
}

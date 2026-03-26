/**
 * driveWriteTools.ts
 *
 * Tools (инструменты) для ЗАПИСИ в Google Drive:
 * - создание подпапок внутри указанной папки
 * - загрузка фото в указанную папку (или созданную подпапку)
 *
 * Зачем:
 * В отличие от photoTools (которые грузят в фиксированную подпапку "Фото обслуживания"),
 * эти инструменты позволяют пользователю явно указать целевую папку и/или путь подпапок
 * внутри папки оборудования.
 *
 * Ограничения:
 * - Реальная запись в Drive выполняется через GAS backend (gasClient.post).
 * - GAS должен поддерживать actions:
 *   1) ensureDriveFolderPath
 *   2) uploadPhotosToFolder
 *
 * Файл экспортирует:
 * - driveWriteTools — массив определений tools
 * - executeDriveWriteTool — функция выполнения tool по имени
 */

// ============================================
// Импорты
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import { gasClient } from '../services/equipment/index.js';

// ============================================
// Определения tools
// ============================================

export const driveWriteTools: Anthropic.Tool[] = [
  {
    name: 'ensure_drive_folder_path',
    description:
      'Создать (если нужно) подпапки внутри указанной папки Google Drive по пути subfolder_path. ' +
      'Используй для организации структуры внутри папки оборудования: например "Фото/2026-03-26/До ремонта". ' +
      'Возвращает URL/ID итоговой папки и какие сегменты были созданы.',
    input_schema: {
      type: 'object' as const,
      properties: {
        parent_folder_url: {
          type: 'string',
          description: 'URL или ID родительской папки Google Drive (например папка оборудования)',
        },
        subfolder_path: {
          type: 'string',
          description:
            'Путь подпапок внутри parent_folder_url. Сегменты разделяй "/". Пример: "Фото/2026-03-26/До ремонта".',
        },
      },
      required: ['parent_folder_url', 'subfolder_path'],
    },
  },
  {
    name: 'upload_photos_to_folder',
    description:
      'Загрузить одно или несколько фото (Base64) в указанную папку Google Drive. ' +
      'Используй вместе с ensure_drive_folder_path, если нужно сначала создать подпапку. ' +
      'ВАЖНО: Перед загрузкой попроси подтверждение у пользователя.',
    input_schema: {
      type: 'object' as const,
      properties: {
        folder_url: {
          type: 'string',
          description: 'URL или ID папки Google Drive, куда загрузить фото',
        },
        photos: {
          type: 'array',
          description: 'Массив фото для загрузки',
          items: {
            type: 'object',
            properties: {
              photo_base64: {
                type: 'string',
                description: 'Фото в формате Base64 (без префикса data:image/...)',
              },
              mime_type: {
                type: 'string',
                enum: ['image/jpeg', 'image/png'],
                description: 'MIME тип изображения',
              },
              name: {
                type: 'string',
                description: 'Опционально: имя файла (если не указано — сформирует GAS)',
              },
              description: {
                type: 'string',
                description: 'Опционально: описание фото (для имени/метаданных)',
              },
            },
            required: ['photo_base64'],
          },
        },
        date: {
          type: 'string',
          description: 'Опционально: дата работ в формате YYYY-MM-DD (для имени/описания)',
        },
        maintenance_type: {
          type: 'string',
          description: 'Опционально: тип работ (ТО, Ремонт, Осмотр, ...)',
        },
        general_description: {
          type: 'string',
          description: 'Опционально: общее описание (используется если у фото нет description)',
        },
      },
      required: ['folder_url', 'photos'],
    },
  },
];

// ============================================
// Выполнение tools
// ============================================

export async function executeDriveWriteTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  console.log(`[DriveWriteTool] ${name} called:`, {
    inputKeys: Object.keys(input),
    timestamp: new Date().toISOString(),
  });

  switch (name) {
    case 'ensure_drive_folder_path':
      return await gasClient.post('ensureDriveFolderPath', {
        parentFolderId: extractDriveId(input.parent_folder_url as string),
        subfolderPath: input.subfolder_path as string,
      });

    case 'upload_photos_to_folder':
      return await handleUploadPhotosToFolder(input);

    default:
      throw new Error(`Unknown drive write tool: ${name}`);
  }
}

// ============================================
// Вспомогательные функции
// ============================================

async function handleUploadPhotosToFolder(input: Record<string, unknown>): Promise<unknown> {
  const folderUrl = input.folder_url as string;
  const photos = input.photos as Array<{
    photo_base64: string;
    mime_type?: string;
    name?: string;
    description?: string;
  }>;

  if (!photos || photos.length === 0) {
    throw new Error('Массив photos пуст');
  }

  const results: unknown[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const description = (photo.description || input.general_description || '') as string;

    const result = await gasClient.post('uploadPhotosToFolder', {
      folderId: extractDriveId(folderUrl),
      photoBase64: photo.photo_base64,
      mimeType: photo.mime_type || 'image/jpeg',
      name: photo.name,
      description,
      date: input.date || new Date().toISOString().split('T')[0],
      maintenanceType: input.maintenance_type || 'Фото',
      index: i + 1,
      total: photos.length,
    });

    results.push(result);
  }

  return {
    success: true,
    uploaded: results.length,
    results,
  };
}

function extractDriveId(urlOrId: string): string {
  if (!urlOrId) return '';

  const foldersMatch = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch) return foldersMatch[1];

  const fileMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const idMatch = urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) {
    return urlOrId;
  }

  return urlOrId;
}


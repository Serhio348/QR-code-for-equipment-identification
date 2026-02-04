/**
 * photoTools.ts
 *
 * Определения tools для работы с фото обслуживания оборудования.
 *
 * Позволяет Claude AI:
 * 1. Загружать фото (одно или несколько) в папку оборудования на Google Drive
 * 2. Получать список всех фото обслуживания для оборудования
 * 3. Искать фото по описанию, дате или типу работ
 *
 * Фото привязываются к записям журнала обслуживания через описание и дату.
 * Хранятся в подпапке "Фото обслуживания" внутри папки оборудования на Google Drive.
 *
 * Цепочка:
 *   Пользователь прикрепляет фото → Claude вызывает upload_maintenance_photo →
 *   Backend отправляет Base64 в GAS → GAS сохраняет в Google Drive
 */

import Anthropic from '@anthropic-ai/sdk';
import { gasClient } from '../services/gasClient.js';

// ============================================
// Определения tools
// ============================================

export const photoTools: Anthropic.Tool[] = [
    {
        name: 'upload_maintenance_photo',
        description:
            'Загрузить одно или несколько фото обслуживания в папку оборудования на Google Drive. ' +
            'Автоматически создаёт подпапку "Фото обслуживания" если её нет. ' +
            'Фото привязывается к работе через дату, тип работ и описание. ' +
            'ВАЖНО: Перед загрузкой покажи пользователю информацию о фото и запроси подтверждение.',
        input_schema: {
            type: 'object' as const,
            properties: {
                equipment_id: {
                    type: 'string',
                    description: 'ID оборудования',
                },
                photos: {
                    type: 'array',
                    description: 'Массив фото для загрузки (поддержка нескольких фото)',
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
                            description: {
                                type: 'string',
                                description: 'Краткое описание конкретного фото',
                            },
                        },
                        required: ['photo_base64'],
                    },
                },
                date: {
                    type: 'string',
                    description: 'Дата работ в формате YYYY-MM-DD',
                },
                maintenance_type: {
                    type: 'string',
                    description: 'Тип работ (ТО, Ремонт, Осмотр, Замена и т.д.)',
                },
                general_description: {
                    type: 'string',
                    description: 'Общее описание выполненной работы (для привязки к журналу)',
                },
            },
            required: ['equipment_id', 'photos'],
        },
    },
    {
        name: 'get_maintenance_photos',
        description:
            'Получить список всех фото обслуживания для оборудования. ' +
            'Возвращает ссылки на фото, даты, описания.',
        input_schema: {
            type: 'object' as const,
            properties: {
                equipment_id: {
                    type: 'string',
                    description: 'ID оборудования',
                },
            },
            required: ['equipment_id'],
        },
    },
    {
        name: 'search_maintenance_photos',
        description:
            'Поиск фото обслуживания по названию файла, дате или описанию. ' +
            'Полезно для поиска фото конкретных работ или за определённый период.',
        input_schema: {
            type: 'object' as const,
            properties: {
                equipment_id: {
                    type: 'string',
                    description: 'ID оборудования',
                },
                query: {
                    type: 'string',
                    description: 'Поисковый запрос (часть имени файла, дата, тип работ)',
                },
            },
            required: ['equipment_id'],
        },
    },
];

// ============================================
// Выполнение tools
// ============================================

export async function executePhotoTool(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    console.log(`[PhotoTool] ${name} called:`, {
        inputKeys: Object.keys(input),
        timestamp: new Date().toISOString(),
    });

    switch (name) {
        case 'upload_maintenance_photo':
            return await handleUploadPhotos(input);

        case 'get_maintenance_photos':
            return await gasClient.get('getMaintenancePhotos', {
                equipmentId: input.equipment_id as string,
            });

        case 'search_maintenance_photos':
            return await handleSearchPhotos(input);

        default:
            throw new Error(`Unknown photo tool: ${name}`);
    }
}

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Загрузка нескольких фото последовательно.
 * Каждое фото загружается отдельным запросом к GAS API.
 */
async function handleUploadPhotos(
    input: Record<string, unknown>
): Promise<unknown> {
    const photos = input.photos as Array<{
        photo_base64: string;
        mime_type?: string;
        description?: string;
    }>;

    if (!photos || photos.length === 0) {
        throw new Error('Массив фото пуст');
    }

    const results = [];

    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const photoDescription = photo.description
            || (input.general_description as string)
            || '';

        // Добавляем номер если несколько фото с одинаковым описанием
        const finalDescription = photos.length > 1
            ? `${photoDescription}_${i + 1}`
            : photoDescription;

        const result = await gasClient.post('uploadMaintenancePhoto', {
            equipmentId: input.equipment_id,
            photoBase64: photo.photo_base64,
            mimeType: photo.mime_type || 'image/jpeg',
            description: finalDescription,
            date: input.date || new Date().toISOString().split('T')[0],
            maintenanceType: input.maintenance_type || 'Обслуживание',
        });

        results.push(result);
    }

    return {
        success: true,
        uploaded: results.length,
        results,
    };
}

/**
 * Поиск фото: получаем все фото и фильтруем по запросу на стороне сервера.
 */
async function handleSearchPhotos(
    input: Record<string, unknown>
): Promise<unknown> {
    const allPhotos = await gasClient.get<{
        success: boolean;
        photos: Array<{ name: string; url: string; thumbnailUrl: string; createdTime: string }>;
        folderUrl?: string;
    }>('getMaintenancePhotos', {
        equipmentId: input.equipment_id as string,
    });

    const query = (input.query as string || '').toLowerCase();

    if (!query || !allPhotos.photos) {
        return allPhotos;
    }

    const filtered = allPhotos.photos.filter(photo =>
        photo.name.toLowerCase().includes(query)
    );

    return {
        success: true,
        photos: filtered,
        totalPhotos: allPhotos.photos.length,
        matchedPhotos: filtered.length,
        query,
        folderUrl: allPhotos.folderUrl,
    };
}

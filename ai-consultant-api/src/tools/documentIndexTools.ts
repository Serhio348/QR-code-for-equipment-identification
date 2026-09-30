/**
 * documentIndexTools.ts
 *
 * Инструмент гибридного поиска по постоянному индексу документации.
 *
 * Структура / что умеет:
 * 1. search_indexed_documents — точные совпадения и поиск по смыслу внутри карточки
 */

import Anthropic from '@anthropic-ai/sdk';
import { getToolContext } from '../services/ai/toolContext.js';
import { searchIndexedChunks } from '../services/ai/documentIndexStore.js';

export const DOCUMENT_INDEX_PROMPT = `- Если пользователь хочет найти информацию в документации оборудования — СНАЧАЛА вызови search_indexed_documents. Это гибридный поиск по заранее проиндексированным страницам текущего оборудования.
- Если индекс ещё не готов, фрагментов недостаточно или нужен файл, которого нет в выдаче, используй search_files_in_folder и read_file_content.`;

export const documentIndexTools: Anthropic.Tool[] = [
  {
    name: 'search_indexed_documents',
    description: `Найти фрагменты документации текущего оборудования по смыслу и точным обозначениям.

Используй ПЕРВЫМ для вопросов о паспорте, инструкции, характеристиках, неисправностях и пунктах документа.
Не используй для открытия ссылки на файл, журнала обслуживания, фото или счетов.
Если результат пуст или не отвечает на вопрос — переходи к search_files_in_folder и read_file_content.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Вопрос или искомые термины пользователя',
        },
        equipment_id: {
          type: 'string',
          description: 'ID оборудования. Можно не указывать, если открыта его карточка.',
        },
      },
      required: ['query'],
    },
  },
];

export async function executeDocumentIndexTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (name !== 'search_indexed_documents') throw new Error(`Unknown document index tool: ${name}`);
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const equipmentId = (typeof input.equipment_id === 'string' && input.equipment_id.trim())
    || getToolContext()?.equipmentId
    || '';
  if (!query) return { found: false, message: 'Пустой поисковый запрос' };
  if (!equipmentId) {
    return {
      found: false,
      message: 'Сначала определи оборудование через карточку или get_equipment_details, затем повтори поиск.',
    };
  }

  const chunks = await searchIndexedChunks(equipmentId, query);
  if (chunks.length === 0) {
    return {
      found: false,
      equipmentId,
      message: 'В постоянном индексе этого оборудования пока нет подходящих фрагментов. Используй search_files_in_folder и read_file_content.',
    };
  }

  return {
    found: true,
    equipmentId,
    strategy: 'hybrid',
    chunks,
    instruction: 'Отвечай по этим фрагментам и укажи название файла и страницы. При противоречии или нехватке данных прочитай исходный файл через read_file_content.',
  };
}

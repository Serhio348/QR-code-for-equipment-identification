/**
 * documentIndexWorker.ts
 *
 * Фоновая очередь индексации документации.
 *
 * Структура / что умеет:
 * 1. startDocumentIndexWorker — периодически обнаруживает и индексирует один файл
 */

import { config } from '../../config/env.js';
import { EmbeddingQuotaPause } from './embeddingClient.js';
import { discoverEquipmentDocuments, indexNextDocument } from './documentIndexer.js';

let started = false;
let running = false;
let pausedUntil = 0;

export function startDocumentIndexWorker(): void {
  if (started || !config.documentIndexEnabled) return;
  if (!config.geminiApiKey) {
    console.warn('[DocumentIndex] Индексация выключена: нет GEMINI_API_KEY');
    return;
  }
  started = true;
  console.log('[DocumentIndex] Фоновая индексация документации запущена');
  const timer = setInterval(() => {
    void runIndexTick();
  }, config.documentIndexIntervalMs);
  timer.unref?.();
  void runIndexTick();
}

async function runIndexTick(): Promise<void> {
  if (running || Date.now() < pausedUntil) return;
  running = true;
  try {
    const indexed = await indexNextDocument();
    if (!indexed) {
      const discovered = await discoverEquipmentDocuments();
      if (discovered > 0) console.log(`[DocumentIndex] В очередь добавлено файлов: ${discovered}`);
    }
  } catch (error) {
    if (error instanceof EmbeddingQuotaPause) {
      pausedUntil = error.retryAt;
      console.warn(`[DocumentIndex] ${error.message}`);
      return;
    }
    console.error('[DocumentIndex] Ошибка фонового прохода:', error);
  } finally {
    running = false;
  }
}

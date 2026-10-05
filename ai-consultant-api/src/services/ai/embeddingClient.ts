/**
 * embeddingClient.ts
 *
 * Преобразует текст в embedding через Gemini.
 *
 * Структура / что умеет:
 * 1. embedDocumentChunks — векторы фрагментов для индекса
 * 2. embedSearchQuery — вектор пользовательского вопроса
 *
 * Пример:
 * "насос перегревается" → number[768]
 */

import { config } from '../../config/env.js';

const DOCUMENT_TASK = 'RETRIEVAL_DOCUMENT';
const QUERY_TASK = 'RETRIEVAL_QUERY';
/** Бесплатный gemini-embedding-001: 100 запросов/мин, 30 000 токенов/мин, 1 000 запросов/сутки. */
const BATCH_SIZE = 3;
const BATCH_GAP_MS = 15_000;
const MAX_INPUT_CHARS = 4_000;
const INDEX_DAILY_BUDGET = 800;
const MAX_ATTEMPTS = 4;

let nextSlotAt = 0;
let budgetDay = '';
let indexRequestsToday = 0;

export class EmbeddingQuotaPause extends Error {
  readonly retryAt = nextQuotaReset();

  constructor() {
    super('Дневной лимит бесплатных embeddings Gemini исчерпан, индексация продолжится позже');
    this.name = 'EmbeddingQuotaPause';
  }
}

export async function embedDocumentChunks(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += BATCH_SIZE) {
    vectors.push(...await embedBatch(texts.slice(index, index + BATCH_SIZE), DOCUMENT_TASK));
  }
  return vectors;
}

export async function embedSearchQuery(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text], QUERY_TASK);
  if (!vector) throw new Error('Gemini не вернул embedding запроса');
  return vector;
}

async function embedBatch(texts: string[], taskType: string): Promise<number[][]> {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY не настроен для индексации');
  const clipped = texts.map((text) => text.slice(0, MAX_INPUT_CHARS));
  if (taskType === DOCUMENT_TASK) reserveIndexBudget(clipped.length);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await waitForSlot();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.embeddingModel}:batchEmbedContents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.geminiApiKey,
        },
        body: JSON.stringify({
          requests: clipped.map((text) => ({
            model: `models/${config.embeddingModel}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: config.embeddingDimensions,
          })),
        }),
        signal: AbortSignal.timeout(config.apiTimeout),
      },
    );
    if (response.status === 429 || response.status === 503) {
      if (attempt === MAX_ATTEMPTS) {
        if (taskType === DOCUMENT_TASK) throw new EmbeddingQuotaPause();
        throw new Error(`Gemini embeddings HTTP ${response.status}`);
      }
      await delay(retryDelayMs(response, attempt));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Gemini embeddings HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }

    const body = await response.json() as { embeddings?: Array<{ values?: number[] }> };
    const vectors = (body.embeddings ?? []).map((item) => item.values ?? []);
    if (vectors.length !== clipped.length || vectors.some((vector) => vector.length !== config.embeddingDimensions)) {
      throw new Error(`Gemini вернул ${vectors.length} embeddings вместо ${clipped.length}`);
    }
    if (taskType === DOCUMENT_TASK) indexRequestsToday += clipped.length;
    return vectors;
  }

  throw new EmbeddingQuotaPause();
}

function reserveIndexBudget(count: number): void {
  const day = pacificDay(Date.now());
  if (day !== budgetDay) {
    budgetDay = day;
    indexRequestsToday = 0;
  }
  if (indexRequestsToday + count > INDEX_DAILY_BUDGET) throw new EmbeddingQuotaPause();
}

async function waitForSlot(): Promise<void> {
  const wait = nextSlotAt - Date.now();
  if (wait > 0) await delay(wait);
  nextSlotAt = Date.now() + BATCH_GAP_MS;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 20_000 * attempt;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextQuotaReset(): number {
  const today = pacificDay(Date.now());
  let probe = Date.now() + 60_000;
  const limit = Date.now() + 26 * 60 * 60 * 1000;
  while (pacificDay(probe) === today && probe < limit) probe += 15 * 60 * 1000;
  return probe;
}

function pacificDay(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

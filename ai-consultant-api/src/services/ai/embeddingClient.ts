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

export async function embedDocumentChunks(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += 8) {
    vectors.push(...await embedBatch(texts.slice(index, index + 8), DOCUMENT_TASK));
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
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.embeddingModel}:batchEmbedContents`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.geminiApiKey,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${config.embeddingModel}`,
          content: { parts: [{ text: text.slice(0, 12_000) }] },
          taskType,
          outputDimensionality: config.embeddingDimensions,
        })),
      }),
      signal: AbortSignal.timeout(config.apiTimeout),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini embeddings HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const body = await response.json() as { embeddings?: Array<{ values?: number[] }> };
  const vectors = (body.embeddings ?? []).map((item) => item.values ?? []);
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== config.embeddingDimensions)) {
    throw new Error(`Gemini вернул ${vectors.length} embeddings вместо ${texts.length}`);
  }
  return vectors;
}

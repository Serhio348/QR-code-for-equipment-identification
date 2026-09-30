/**
 * documentSearchFusion.ts
 *
 * Объединяет независимые списки кандидатов без сравнения их исходных оценок.
 *
 * Структура / что умеет:
 * 1. reciprocalRankFusion — Reciprocal Rank Fusion для точного и смыслового поиска
 */

export interface RankedHit {
  id: string;
  score: number;
  sources: string[];
}

export function reciprocalRankFusion(
  lists: Array<{ source: string; ids: string[] }>,
  k = 60,
): RankedHit[] {
  const hits = new Map<string, RankedHit>();

  for (const list of lists) {
    list.ids.forEach((id, index) => {
      const current = hits.get(id) ?? { id, score: 0, sources: [] };
      current.score += 1 / (k + index + 1);
      if (!current.sources.includes(list.source)) current.sources.push(list.source);
      hits.set(id, current);
    });
  }

  return [...hits.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

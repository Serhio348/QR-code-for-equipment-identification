/**
 * analysisSavePlan.ts
 *
 * План сохранения анализа и результатов как одной операции.
 * Повтор с тем же id обновляет запись, а не создаёт вторую.
 */

export interface ExistingResultRef {
  id: string;
  parameterName: string;
}

export interface ResultDraft {
  parameterName: string;
  parameterLabel: string;
  valueText: string;
  unit: string;
  method?: string;
}

export interface PlannedResult {
  parameterName: string;
  parameterLabel: string;
  value: number;
  unit: string;
  method: string | null;
}

export interface AnalysisSavePlan {
  results: PlannedResult[];
  deleteResultIds: string[];
}

export interface MemoryResult {
  id: string;
  parameterName: string;
  value: number;
}

export interface MemoryAnalysis {
  id: string;
  notes: string;
  results: MemoryResult[];
}

export interface MemoryStore {
  analyses: MemoryAnalysis[];
}

export function planAnalysisResults(
  drafts: readonly ResultDraft[],
  existing: readonly ExistingResultRef[] = [],
): AnalysisSavePlan {
  const existingByParam = new Map(existing.map(result => [result.parameterName, result]));
  const results: PlannedResult[] = [];
  const deleteResultIds: string[] = [];

  for (const draft of drafts) {
    const trimmed = draft.valueText.trim();
    const existingResult = existingByParam.get(draft.parameterName);
    if (!trimmed) {
      if (existingResult) deleteResultIds.push(existingResult.id);
      continue;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value)) continue;
    results.push({
      parameterName: draft.parameterName,
      parameterLabel: draft.parameterLabel,
      value,
      unit: draft.unit,
      method: draft.method?.trim() || null,
    });
  }

  return { results, deleteResultIds };
}

/**
 * Применяет план целиком. Сбой любого шага возвращает хранилище к снимку до записи.
 */
export function commitAnalysisSave(
  store: MemoryStore,
  analysisId: string,
  notes: string,
  plan: AnalysisSavePlan,
  options?: { failOnResultIndex?: number; failOnDelete?: boolean },
): void {
  const snapshot: MemoryStore = {
    analyses: store.analyses.map(analysis => ({
      ...analysis,
      results: analysis.results.map(result => ({ ...result })),
    })),
  };

  try {
    let row = store.analyses.find(analysis => analysis.id === analysisId);
    if (!row) {
      row = { id: analysisId, notes, results: [] };
      store.analyses.push(row);
    } else {
      row.notes = notes;
    }

    if (options?.failOnDelete && plan.deleteResultIds.length > 0) {
      throw new Error('не удалось удалить результат');
    }

    row.results = row.results.filter(result => !plan.deleteResultIds.includes(result.id));
    plan.results.forEach((result, index) => {
      if (options?.failOnResultIndex === index) {
        throw new Error('сбой записи результата');
      }
      const current = row.results.find(item => item.parameterName === result.parameterName);
      if (current) {
        current.value = result.value;
        return;
      }
      row.results.push({
        id: `new-${result.parameterName}`,
        parameterName: result.parameterName,
        value: result.value,
      });
    });
  } catch (error) {
    store.analyses = snapshot.analyses;
    throw error;
  }
}

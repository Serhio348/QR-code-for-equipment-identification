import { describe, expect, it } from 'vitest';
import {
  commitAnalysisSave,
  planAnalysisResults,
  type MemoryStore,
} from './analysisSavePlan';

const DRAFTS = [
  { parameterName: 'iron', parameterLabel: 'Железо', valueText: '0.2', unit: 'мг/л' },
  { parameterName: 'ph', parameterLabel: 'pH', valueText: '7.1', unit: '' },
];

describe('planAnalysisResults', () => {
  it('plans a delete when a previously entered value is cleared', () => {
    const plan = planAnalysisResults(
      [
        { parameterName: 'iron', parameterLabel: 'Железо', valueText: '', unit: 'мг/л' },
        { parameterName: 'ph', parameterLabel: 'pH', valueText: '7', unit: '' },
      ],
      [{ id: 'result-iron', parameterName: 'iron' }],
    );

    expect(plan.deleteResultIds).toEqual(['result-iron']);
    expect(plan.results.map(result => result.parameterName)).toEqual(['ph']);
  });
});

describe('commitAnalysisSave', () => {
  it('rolls back when the second result fails', () => {
    const store: MemoryStore = { analyses: [] };
    const plan = planAnalysisResults(DRAFTS);

    expect(() => commitAnalysisSave(store, 'analysis-1', 'заметка', plan, { failOnResultIndex: 1 })).toThrow(
      'сбой записи результата',
    );
    expect(store.analyses).toEqual([]);
  });

  it('rolls back when deleting a previous result fails', () => {
    const store: MemoryStore = {
      analyses: [{
        id: 'analysis-1',
        notes: 'было',
        results: [{ id: 'result-iron', parameterName: 'iron', value: 0.3 }],
      }],
    };
    const plan = planAnalysisResults(
      [{ parameterName: 'iron', parameterLabel: 'Железо', valueText: '', unit: 'мг/л' }],
      [{ id: 'result-iron', parameterName: 'iron' }],
    );

    expect(() => commitAnalysisSave(store, 'analysis-1', 'стало', plan, { failOnDelete: true })).toThrow(
      'не удалось удалить результат',
    );
    expect(store.analyses[0]?.notes).toBe('было');
    expect(store.analyses[0]?.results).toEqual([
      { id: 'result-iron', parameterName: 'iron', value: 0.3 },
    ]);
  });

  it('updates the same analysis when the save is repeated', () => {
    const store: MemoryStore = { analyses: [] };
    const plan = planAnalysisResults(DRAFTS);

    commitAnalysisSave(store, 'analysis-1', 'первый', plan);
    commitAnalysisSave(store, 'analysis-1', 'повтор', plan);

    expect(store.analyses).toHaveLength(1);
    expect(store.analyses[0]?.notes).toBe('повтор');
    expect(store.analyses[0]?.results).toHaveLength(2);
  });
});

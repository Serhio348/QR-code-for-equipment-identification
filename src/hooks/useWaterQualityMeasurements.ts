/**
 * useWaterQualityMeasurements.ts
 * 
 * Хук для работы с лабораторными анализами качества воды
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAllWaterAnalyses,
  getWaterAnalysisById,
  createWaterAnalysis,
  updateWaterAnalysis,
  deleteWaterAnalysis,
  getAnalysisResults,
  createAnalysisResult,
  createAnalysisResults,
  updateAnalysisResult,
  deleteAnalysisResult,
} from '../services/api/supabaseWaterQualityApi';
import type {
  WaterAnalysis,
  WaterAnalysisInput,
  WaterAnalysisWithResults,
  AnalysisResult,
  AnalysisResultInput,
} from '../types/waterQuality';

interface UseWaterAnalysesResult {
  analyses: WaterAnalysis[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseWaterAnalysisResult {
  analysis: WaterAnalysisWithResults | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface AnalysisFilters {
  samplingPointId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Хук для получения всех анализов
 */
export function useWaterAnalyses(filters?: AnalysisFilters): UseWaterAnalysesResult {
  const [analyses, setAnalyses] = useState<WaterAnalysis[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllWaterAnalyses(filters);
      setAnalyses(data);
    } catch (err: any) {
      console.error('[useWaterAnalyses] Ошибка загрузки:', err);
      setError(err.message || 'Не удалось загрузить анализы');
      setAnalyses([]);
    } finally {
      setLoading(false);
    }
  }, [filters?.samplingPointId, filters?.status, filters?.startDate, filters?.endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    analyses,
    loading,
    error,
    refetch: loadData,
  };
}

/**
 * Хук для получения одного анализа
 */
export function useWaterAnalysis(id: string | null): UseWaterAnalysisResult {
  const [analysis, setAnalysis] = useState<WaterAnalysisWithResults | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) {
      setAnalysis(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getWaterAnalysisById(id);
      setAnalysis(data);
    } catch (err: any) {
      console.error('[useWaterAnalysis] Ошибка загрузки:', err);
      setError(err.message || 'Не удалось загрузить анализ');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    analysis,
    loading,
    error,
    refetch: loadData,
  };
}

/**
 * Хук для управления анализами (CRUD операции)
 */
export function useWaterAnalysisManagement() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: WaterAnalysisInput): Promise<WaterAnalysis | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await createWaterAnalysis(input);
      return result;
    } catch (err: any) {
      console.error('[useWaterAnalysisManagement] Ошибка создания:', err);
      setError(err.message || 'Не удалось создать анализ');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (
    id: string,
    input: Partial<WaterAnalysisInput>
  ): Promise<WaterAnalysis | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await updateWaterAnalysis(id, input);
      return result;
    } catch (err: any) {
      console.error('[useWaterAnalysisManagement] Ошибка обновления:', err);
      setError(err.message || 'Не удалось обновить анализ');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      await deleteWaterAnalysis(id);
      return true;
    } catch (err: any) {
      console.error('[useWaterAnalysisManagement] Ошибка удаления:', err);
      setError(err.message || 'Не удалось удалить анализ');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    create,
    update,
    remove,
    loading,
    error,
  };
}

/**
 * Хук для работы с результатами измерений
 */
export function useAnalysisResults(
  analysisId: string | null,
  options?: { limit?: number; offset?: number; filter?: { parameterName?: string; minValue?: number; maxValue?: number } }
) {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!analysisId) {
      setResults([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getAnalysisResults(analysisId, options);
      setResults(response.data);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err: any) {
      console.error('[useAnalysisResults] Ошибка загрузки:', err);
      setError(err.message || 'Не удалось загрузить результаты');
      setResults([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [analysisId, options?.limit, options?.offset, options?.filter?.parameterName, options?.filter?.minValue, options?.filter?.maxValue]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createSingle = useCallback(async (input: AnalysisResultInput): Promise<AnalysisResult | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await createAnalysisResult(input);
      await loadData(); // Перезагружаем список
      return result;
    } catch (err: any) {
      console.error('[useAnalysisResults] Ошибка создания:', err);
      setError(err.message || 'Не удалось создать результат');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  const createMultiple = useCallback(async (inputs: AnalysisResultInput[]): Promise<AnalysisResult[] | null> => {
    try {
      setLoading(true);
      setError(null);
      const results = await createAnalysisResults(inputs);
      await loadData(); // Перезагружаем список
      return results;
    } catch (err: any) {
      console.error('[useAnalysisResults] Ошибка создания:', err);
      setError(err.message || 'Не удалось создать результаты');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  const update = useCallback(async (
    id: string,
    input: Partial<Omit<AnalysisResultInput, 'analysisId' | 'parameterName'>>
  ): Promise<AnalysisResult | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await updateAnalysisResult(id, input);
      await loadData(); // Перезагружаем список
      return result;
    } catch (err: any) {
      console.error('[useAnalysisResults] Ошибка обновления:', err);
      setError(err.message || 'Не удалось обновить результат');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      await deleteAnalysisResult(id);
      await loadData(); // Перезагружаем список
      return true;
    } catch (err: any) {
      console.error('[useAnalysisResults] Ошибка удаления:', err);
      setError(err.message || 'Не удалось удалить результат');
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  return {
    results,
    total,
    hasMore,
    loading,
    error,
    createSingle,
    createMultiple,
    update,
    remove,
    refetch: loadData,
  };
}

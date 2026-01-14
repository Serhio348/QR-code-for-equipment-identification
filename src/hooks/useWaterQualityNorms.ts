/**
 * useWaterQualityNorms.ts
 * 
 * Хук для работы с нормативами качества воды
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAllWaterQualityNorms,
  getWaterQualityNormById,
  createWaterQualityNorm,
  updateWaterQualityNorm,
  deleteWaterQualityNorm,
} from '../services/api/waterQuality/waterQualityNorms';
import type { WaterQualityNorm, WaterQualityNormInput } from '../types/waterQuality';

interface UseWaterQualityNormsResult {
  norms: WaterQualityNorm[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseWaterQualityNormResult {
  norm: WaterQualityNorm | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface NormFilters {
  samplingPointId?: string;
  equipmentId?: string;
  parameterName?: string;
}

/**
 * Хук для получения всех нормативов
 */
export function useWaterQualityNorms(filters?: NormFilters): UseWaterQualityNormsResult {
  const [norms, setNorms] = useState<WaterQualityNorm[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllWaterQualityNorms(filters);
      setNorms(data);
    } catch (err: any) {
      console.error('[useWaterQualityNorms] Ошибка загрузки:', err);
      setError(err.message || 'Не удалось загрузить нормативы');
      setNorms([]);
    } finally {
      setLoading(false);
    }
  }, [filters?.samplingPointId, filters?.equipmentId, filters?.parameterName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    norms,
    loading,
    error,
    refetch: loadData,
  };
}

/**
 * Хук для получения одного норматива
 */
export function useWaterQualityNorm(id: string | null): UseWaterQualityNormResult {
  const [norm, setNorm] = useState<WaterQualityNorm | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) {
      setNorm(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getWaterQualityNormById(id);
      setNorm(data);
    } catch (err: any) {
      console.error('[useWaterQualityNorm] Ошибка загрузки:', err);
      setError(err.message || 'Не удалось загрузить норматив');
      setNorm(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    norm,
    loading,
    error,
    refetch: loadData,
  };
}

/**
 * Хук для управления нормативами (CRUD операции)
 */
export function useWaterQualityNormManagement() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: WaterQualityNormInput): Promise<WaterQualityNorm | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await createWaterQualityNorm(input);
      return result;
    } catch (err: any) {
      console.error('[useWaterQualityNormManagement] Ошибка создания:', err);
      setError(err.message || 'Не удалось создать норматив');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (
    id: string,
    input: Partial<WaterQualityNormInput>
  ): Promise<WaterQualityNorm | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await updateWaterQualityNorm(id, input);
      return result;
    } catch (err: any) {
      console.error('[useWaterQualityNormManagement] Ошибка обновления:', err);
      setError(err.message || 'Не удалось обновить норматив');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      await deleteWaterQualityNorm(id);
      return true;
    } catch (err: any) {
      console.error('[useWaterQualityNormManagement] Ошибка удаления:', err);
      setError(err.message || 'Не удалось удалить норматив');
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

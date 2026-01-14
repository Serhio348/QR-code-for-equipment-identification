/**
 * useSamplingPoints.ts
 * 
 * Хук для работы с пунктами отбора проб
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAllSamplingPoints,
  getSamplingPointById,
  createSamplingPoint,
  updateSamplingPoint,
  deleteSamplingPoint,
} from '../services/api/waterQuality/samplingPoints';
import type { SamplingPoint, SamplingPointInput } from '../types/waterQuality';

interface UseSamplingPointsResult {
  samplingPoints: SamplingPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseSamplingPointResult {
  samplingPoint: SamplingPoint | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Хук для получения всех пунктов отбора проб
 */
export function useSamplingPoints(): UseSamplingPointsResult {
  const [samplingPoints, setSamplingPoints] = useState<SamplingPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllSamplingPoints();
      setSamplingPoints(data);
    } catch (err: any) {
      console.error('[useSamplingPoints] Ошибка загрузки:', err);
      setError(err.message || 'Не удалось загрузить пункты отбора проб');
      setSamplingPoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    samplingPoints,
    loading,
    error,
    refetch: loadData,
  };
}

/**
 * Хук для получения одного пункта отбора проб
 */
export function useSamplingPoint(id: string | null): UseSamplingPointResult {
  const [samplingPoint, setSamplingPoint] = useState<SamplingPoint | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) {
      setSamplingPoint(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getSamplingPointById(id);
      setSamplingPoint(data);
    } catch (err: any) {
      console.error('[useSamplingPoint] Ошибка загрузки:', err);
      setError(err.message || 'Не удалось загрузить пункт отбора проб');
      setSamplingPoint(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    samplingPoint,
    loading,
    error,
    refetch: loadData,
  };
}

/**
 * Хук для управления пунктами отбора проб (CRUD операции)
 */
export function useSamplingPointManagement() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: SamplingPointInput): Promise<SamplingPoint | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await createSamplingPoint(input);
      return result;
    } catch (err: any) {
      console.error('[useSamplingPointManagement] Ошибка создания:', err);
      setError(err.message || 'Не удалось создать пункт отбора проб');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (
    id: string,
    input: Partial<SamplingPointInput>
  ): Promise<SamplingPoint | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await updateSamplingPoint(id, input);
      return result;
    } catch (err: any) {
      console.error('[useSamplingPointManagement] Ошибка обновления:', err);
      setError(err.message || 'Не удалось обновить пункт отбора проб');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      await deleteSamplingPoint(id);
      return true;
    } catch (err: any) {
      console.error('[useSamplingPointManagement] Ошибка удаления:', err);
      setError(err.message || 'Не удалось удалить пункт отбора проб');
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

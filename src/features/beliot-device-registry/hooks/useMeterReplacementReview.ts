import { useCallback, useEffect, useState } from 'react';
import {
  confirmMeterReplacement,
  dismissMeterReplacement,
  getMeterReplacementEvents,
} from '../services/beliotDeviceRegistryApi';
import type {
  ConfirmMeterReplacementInput,
  MeterReplacementEvent,
} from '../types/beliotDeviceRegistry';

interface UseMeterReplacementReviewResult {
  events: MeterReplacementEvent[];
  loading: boolean;
  busyEventId: string | null;
  error: string | null;
  reload: () => Promise<void>;
  confirm: (eventId: string, input: ConfirmMeterReplacementInput) => Promise<boolean>;
  dismiss: (eventId: string, reason: string | null) => Promise<boolean>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось обработать событие замены';
}

export function useMeterReplacementReview(): UseMeterReplacementReviewResult {
  const [events, setEvents] = useState<MeterReplacementEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await getMeterReplacementEvents());
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const confirm = useCallback(async (
    eventId: string,
    input: ConfirmMeterReplacementInput,
  ): Promise<boolean> => {
    setBusyEventId(eventId);
    setError(null);
    try {
      await confirmMeterReplacement(eventId, input);
      setEvents(current => current.filter(event => event.id !== eventId));
      return true;
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setBusyEventId(null);
    }
  }, []);

  const dismiss = useCallback(async (
    eventId: string,
    reason: string | null,
  ): Promise<boolean> => {
    setBusyEventId(eventId);
    setError(null);
    try {
      await dismissMeterReplacement(eventId, reason);
      setEvents(current => current.filter(event => event.id !== eventId));
      return true;
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setBusyEventId(null);
    }
  }, []);

  return {
    events,
    loading,
    busyEventId,
    error,
    reload,
    confirm,
    dismiss,
  };
}

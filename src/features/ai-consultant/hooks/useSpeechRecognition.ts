/**
 * useSpeechRecognition.ts
 *
 * React-хук для голосового ввода через Web Speech API.
 *
 * Возможности:
 * - Распознавание речи на русском языке (ru-RU)
 * - Режим одной фразы (continuous=false) — без дублей на русском
 * - Preflight getUserMedia перед start() — критично для iOS Safari/PWA
 * - Понятные ошибки на русском
 *
 * Совместимость:
 * - Chrome, Edge — webkitSpeechRecognition
 * - Safari iOS 14.5+ / macOS 14.1+ — частичная поддержка
 * - Требуется HTTPS и Permissions-Policy: microphone=(self)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { isIOS } from '@/shared/utils/deviceDetection';

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionError {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export interface UseSpeechRecognitionReturn {
  /** Поддерживает ли текущий браузер Web Speech API */
  isSupported: boolean;
  /** true пока микрофон активен и идёт запись */
  isListening: boolean;
  /** Накопленный распознанный текст (только финальные результаты) */
  transcript: string;
  /** Текст ошибки на русском или null */
  error: string | null;
  /** Начать запись — сбрасывает transcript и ошибку */
  startListening: () => void;
  /** Остановить запись (graceful — дожидается последнего результата) */
  stopListening: () => void;
  /** Очистить transcript и ошибку без остановки записи */
  resetTranscript: () => void;
}

function mapSpeechError(code: string): string {
  switch (code) {
    case 'no-speech':
      return 'Речь не обнаружена. Попробуйте ещё раз.';
    case 'audio-capture':
      return 'Микрофон не найден или не работает.';
    case 'not-allowed':
      return isIOS()
        ? 'Нет доступа к микрофону. Настройки → [это приложение] → Микрофон → Разрешить.'
        : 'Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.';
    case 'service-not-allowed':
      return 'Распознавание речи недоступно. Проверьте соединение и разрешения микрофона.';
    case 'network':
      return 'Нет сети для распознавания речи. Проверьте интернет и попробуйте снова.';
    case 'language-not-supported':
      return 'Распознавание русского языка не поддерживается на этом устройстве.';
    case 'aborted':
      return '';
    default:
      return `Ошибка распознавания: ${code}`;
  }
}

/**
 * Хук для голосового ввода через Web Speech API.
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const startingRef = useRef(false);

  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'ru-RU';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0];
      if (result && result.isFinal) {
        const text = result[0].transcript.trim();
        if (text) {
          setTranscript((prev) => (prev ? `${prev} ${text}` : text));
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionError) => {
      console.error('Speech recognition error:', event.error);
      const message = mapSpeechError(event.error);
      if (message) {
        setError(message);
      }
      isListeningRef.current = false;
      setIsListening(false);
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [isSupported]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListeningRef.current || startingRef.current) {
      return;
    }

    setError(null);
    setTranscript('');

    const startRecognition = (): void => {
      try {
        recognitionRef.current?.start();
        isListeningRef.current = true;
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start recognition:', err);
        setError('Не удалось запустить распознавание речи');
        isListeningRef.current = false;
        setIsListening(false);
      }
    };

    // iOS Safari: явный getUserMedia в обработчике клика перед SpeechRecognition.
    if (isIOS() && navigator.mediaDevices?.getUserMedia) {
      startingRef.current = true;
      void navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          startRecognition();
        })
        .catch((err: unknown) => {
          console.error('Microphone permission failed:', err);
          const name =
            err && typeof err === 'object' && 'name' in err
              ? String((err as { name: string }).name)
              : '';
          if (name === 'NotAllowedError') {
            setError(mapSpeechError('not-allowed'));
          } else if (name === 'NotFoundError') {
            setError(mapSpeechError('audio-capture'));
          } else {
            setError('Не удалось получить доступ к микрофону');
          }
        })
        .finally(() => {
          startingRef.current = false;
        });
      return;
    }

    startRecognition();
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListeningRef.current) return;

    recognitionRef.current.stop();
    isListeningRef.current = false;
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}

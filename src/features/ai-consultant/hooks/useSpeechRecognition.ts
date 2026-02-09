/**
 * useSpeechRecognition.ts
 *
 * React-хук для голосового ввода через Web Speech API.
 *
 * Возможности:
 * - Распознавание речи на русском языке (ru-RU)
 * - Непрерывный режим (continuous) — слушает до явной остановки
 * - Промежуточные результаты (interimResults) — для отзывчивого UI
 * - Обработка ошибок с понятными сообщениями на русском
 * - Автоматическая очистка при размонтировании компонента
 *
 * Поток данных:
 * ┌──────────────┐  startListening()  ┌─────────────────────┐
 * │  VoiceButton │ ─────────────────▶ │ useSpeechRecognition│
 * │  (компонент) │                    │                     │
 * └──────────────┘                    │ 1. recognition      │
 *                                     │    .start()         │
 * ┌──────────────┐  transcript,       │ 2. onresult →       │
 * │  ChatInput   │  isListening       │    setTranscript()  │
 * │  (компонент) │ ◀──────────────── │ 3. stopListening()  │
 * └──────────────┘                    │    → передать текст │
 *                                     └─────────────────────┘
 *
 * Совместимость:
 * - Chrome, Edge — полная поддержка (webkitSpeechRecognition)
 * - Firefox, Safari — НЕ поддерживается (isSupported = false)
 * - Требуется HTTPS (кроме localhost)
 */

// ============================================
// Импорты
// ============================================

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================
// Типы для Web Speech API
// ============================================

/**
 * Событие результата распознавания речи.
 * Web Speech API не имеет встроенных TypeScript-типов,
 * поэтому определяем их вручную.
 */
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

/**
 * Событие ошибки распознавания.
 * error — код ошибки (no-speech, audio-capture, not-allowed и др.)
 */
interface SpeechRecognitionError {
  error: string;
  message?: string;
}

/**
 * Интерфейс Web Speech API SpeechRecognition.
 * Описывает основные свойства и методы, используемые хуком.
 *
 * continuous — непрерывный режим (не останавливается после первой фразы)
 * interimResults — возвращать промежуточные результаты (пока пользователь говорит)
 * lang — язык распознавания (BCP 47 формат, например 'ru-RU')
 */
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

/**
 * Расширение глобального Window для Web Speech API.
 * SpeechRecognition — стандартный API (пока не реализован ни в одном браузере)
 * webkitSpeechRecognition — префиксная версия (Chrome, Edge)
 */
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

// ============================================
// Возвращаемый интерфейс
// ============================================

/**
 * Интерфейс, возвращаемый хуком useSpeechRecognition.
 */
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

// ============================================
// Хук useSpeechRecognition
// ============================================

/**
 * Хук для голосового ввода через Web Speech API.
 *
 * @example
 * const { isSupported, isListening, transcript, startListening, stopListening } = useSpeechRecognition();
 *
 * // В компоненте:
 * <button onClick={isListening ? stopListening : startListening}>
 *   {isListening ? '⏹ Стоп' : '🎤 Голос'}
 * </button>
 * <p>{transcript}</p>
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  // --- Состояние ---
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // useRef вместо useState — не нужен ре-рендер при смене объекта recognition.
  // Хранит единственный экземпляр SpeechRecognition на всё время жизни компонента
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Отслеживаем уже обработанные индексы результатов,
  // чтобы не добавлять один и тот же финальный результат повторно
  const processedIndicesRef = useRef<Set<number>>(new Set());

  // Проверка поддержки браузером.
  // SSR-safe: проверяем typeof window !== 'undefined'
  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // --- Инициализация SpeechRecognition ---
  // Создаём один экземпляр при монтировании и настраиваем обработчики.
  // При размонтировании — abort() для немедленной остановки
  useEffect(() => {
    if (!isSupported) return;

    // Выбираем доступную реализацию (стандартную или с webkit-префиксом)
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();

    // continuous: false — останавливается после первой фразы (после паузы).
    // Это предотвращает дублирование слов, которое возникает в continuous режиме.
    // Пользователь нажимает кнопку для каждого нового высказывания.
    recognition.continuous = false;

    // interimResults: false — только финальный результат.
    // Промежуточные результаты вызывают дублирование в русском языке.
    recognition.interimResults = false;

    // Язык распознавания — русский
    recognition.lang = 'ru-RU';

    // --- Обработчик результатов ---
    // С continuous=false и interimResults=false получаем один чистый результат.
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0];
      if (result && result.isFinal) {
        const text = result[0].transcript.trim();
        if (text) {
          setTranscript(prev => prev ? prev + ' ' + text : text);
        }
      }
    };

    // --- Обработчик ошибок ---
    // Переводим технические коды ошибок в понятные сообщения на русском
    recognition.onerror = (event: SpeechRecognitionError) => {
      console.error('Speech recognition error:', event.error);

      switch (event.error) {
        case 'no-speech':
          // Микрофон активен, но речь не обнаружена (тишина)
          setError('Речь не обнаружена. Попробуйте ещё раз.');
          break;
        case 'audio-capture':
          // Микрофон не подключён или заблокирован ОС
          setError('Микрофон не найден или не работает.');
          break;
        case 'not-allowed':
          // Пользователь отклонил запрос на доступ к микрофону
          setError('Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.');
          break;
        default:
          setError(`Ошибка распознавания: ${event.error}`);
      }

      // При ошибке автоматически останавливаем запись
      setIsListening(false);
    };

    // --- Обработчик завершения ---
    // Вызывается при любом завершении (stop(), ошибка, потеря аудиопотока)
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    // Cleanup: abort() — немедленная остановка без ожидания последнего результата.
    // Используем abort() вместо stop(), чтобы не получить onresult после unmount
    return () => {
      recognition.abort();
    };
  }, [isSupported]);

  // --- Управление записью ---

  /**
   * Начать запись.
   * Сбрасывает предыдущий transcript и ошибку перед стартом.
   * Защита от повторного вызова: проверяет isListening
   */
  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    setError(null);
    setTranscript('');
    processedIndicesRef.current.clear();

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      // Может выбросить DOMException если recognition уже запущен
      console.error('Failed to start recognition:', err);
      setError('Не удалось запустить распознавание');
    }
  }, [isListening]);

  /**
   * Остановить запись (graceful).
   * stop() — дожидается последнего результата перед завершением.
   * В отличие от abort(), позволяет получить финальный фрагмент речи
   */
  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;

    recognitionRef.current.stop();
    setIsListening(false);
  }, [isListening]);

  /**
   * Очистить transcript и ошибку.
   * Не останавливает запись — можно вызывать во время прослушивания
   */
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  // ============================================
  // Возвращаемый интерфейс
  // ============================================

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
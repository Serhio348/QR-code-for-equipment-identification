/**
 * useSpeechRecognition.ts
 *
 * Голосовой ввод:
 * - Android/desktop Chrome: Web Speech API
 * - iOS / без SpeechRecognition: MediaRecorder → POST /api/transcribe
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { isIOS } from '@/shared/utils/deviceDetection';
import { transcribeAudio } from '../services/consultantApi';

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
  isSupported: boolean;
  isListening: boolean;
  /** true пока аудио отправляется на сервер (только MediaRecorder-путь) */
  isTranscribing: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
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

function pickRecorderMimeType(): string {
  const candidates = [
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'mp4';
}

/**
 * Хук голосового ввода: Web Speech или MediaRecorder+API на iOS.
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const startingRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef('');

  const hasSpeechApi =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasMediaRecorder =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  // Только iOS: MediaRecorder + API. Android остаётся на Web Speech как раньше.
  const useMediaRecorderPath = isIOS();
  const isSupported = useMediaRecorderPath ? hasMediaRecorder : hasSpeechApi;

  useEffect(() => {
    if (useMediaRecorderPath || !hasSpeechApi) {
      return;
    }

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
  }, [useMediaRecorderPath, hasSpeechApi]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopMediaTracks = (): void => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  };

  const finishMediaRecording = useCallback(async (blob: Blob): Promise<void> => {
    if (blob.size < 100) {
      setError('Запись слишком короткая. Удерживайте кнопку дольше.');
      return;
    }

    setIsTranscribing(true);
    setError(null);
    try {
      const ext = extensionForMime(blob.type || mimeTypeRef.current);
      const file = new File([blob], `voice.${ext}`, {
        type: blob.type || mimeTypeRef.current || 'audio/mp4',
      });
      const text = await transcribeAudio(file);
      if (!text) {
        setError('Речь не распознана. Попробуйте ещё раз.');
        return;
      }
      setTranscript((prev) => (prev ? `${prev} ${text}` : text));
    } catch (err) {
      console.error('Transcription failed:', err);
      setError(err instanceof Error ? err.message : 'Не удалось распознать речь');
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const startMediaRecording = useCallback(async (): Promise<void> => {
    if (startingRef.current || isListeningRef.current) {
      return;
    }
    startingRef.current = true;
    setError(null);
    setTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      mediaStreamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      mimeTypeRef.current = mimeType;
      chunksRef.current = [];

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = mimeTypeRef.current || recorder.mimeType || 'audio/mp4';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        stopMediaTracks();
        void finishMediaRecording(blob);
      };

      recorder.start();
      isListeningRef.current = true;
      setIsListening(true);
    } catch (err) {
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
      stopMediaTracks();
      isListeningRef.current = false;
      setIsListening(false);
    } finally {
      startingRef.current = false;
    }
  }, [finishMediaRecording]);

  const stopMediaRecording = useCallback((): void => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      stopMediaTracks();
      isListeningRef.current = false;
      setIsListening(false);
      return;
    }
    recorder.stop();
    isListeningRef.current = false;
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (useMediaRecorderPath) {
      void startMediaRecording();
      return;
    }

    if (!recognitionRef.current || isListeningRef.current || startingRef.current) {
      return;
    }

    setError(null);
    setTranscript('');

    try {
      recognitionRef.current.start();
      isListeningRef.current = true;
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError('Не удалось запустить распознавание речи');
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [useMediaRecorderPath, startMediaRecording]);

  const stopListening = useCallback(() => {
    if (useMediaRecorderPath) {
      stopMediaRecording();
      return;
    }

    if (!recognitionRef.current || !isListeningRef.current) return;
    recognitionRef.current.stop();
    isListeningRef.current = false;
    setIsListening(false);
  }, [useMediaRecorderPath, stopMediaRecording]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    isTranscribing,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}

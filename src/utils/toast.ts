/**
 * toast.ts
 * 
 * Утилиты для отображения toast-уведомлений
 * Обертка над react-toastify для единообразного использования
 */

import { toast as toastify, ToastOptions } from 'react-toastify';
import { handleError, logError } from './errorHandler';

/**
 * Типы уведомлений
 */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

/**
 * Настройки по умолчанию для toast
 */
const defaultOptions: ToastOptions = {
  position: 'top-right',
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
};

/**
 * Показывает успешное уведомление
 */
export function showSuccess(message: string, options?: ToastOptions): void {
  toastify.success(message, { ...defaultOptions, ...options });
}

/**
 * Показывает уведомление об ошибке
 * Автоматически обрабатывает ошибки и показывает понятное сообщение
 */
export function showError(error: unknown, options?: ToastOptions): void {
  const message = handleError(error);
  logError(error);
  toastify.error(message, { ...defaultOptions, ...options });
}

/**
 * Показывает информационное уведомление
 */
export function showInfo(message: string, options?: ToastOptions): void {
  toastify.info(message, { ...defaultOptions, ...options });
}

/**
 * Показывает предупреждение
 */
export function showWarning(message: string, options?: ToastOptions): void {
  toastify.warning(message, { ...defaultOptions, ...options });
}

/**
 * Универсальная функция для показа toast
 */
export function showToast(
  type: ToastType,
  message: string | unknown,
  options?: ToastOptions
): void {
  if (type === 'error' && typeof message !== 'string') {
    showError(message, options);
    return;
  }

  const textMessage = typeof message === 'string' ? message : String(message);

  switch (type) {
    case 'success':
      showSuccess(textMessage, options);
      break;
    case 'error':
      toastify.error(textMessage, { ...defaultOptions, ...options });
      break;
    case 'info':
      showInfo(textMessage, options);
      break;
    case 'warning':
      showWarning(textMessage, options);
      break;
  }
}

/**
 * Очищает все toast уведомления
 */
export function clearToasts(): void {
  toastify.dismiss();
}

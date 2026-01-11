/**
 * errorHandler.ts
 * 
 * Централизованная система обработки ошибок приложения
 * Преобразует технические ошибки в понятные сообщения для пользователей
 */

/**
 * Коды ошибок приложения
 */
export enum ErrorCode {
  // Сетевые ошибки
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CORS_ERROR = 'CORS_ERROR',
  
  // Ошибки аутентификации
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  
  // Ошибки валидации
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
  REQUIRED_FIELD = 'REQUIRED_FIELD',
  
  // Ошибки доступа
  ACCESS_DENIED = 'ACCESS_DENIED',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',
  
  // Ошибки API
  API_ERROR = 'API_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  
  // Общие ошибки
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Кастомный класс ошибки приложения
 * 
 * Позволяет передавать понятные сообщения для пользователей
 * и технические детали для логирования
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public userMessage: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    
    // Сохраняем оригинальный стек трейс
    if (originalError instanceof Error) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * Преобразует различные типы ошибок в понятные сообщения для пользователей
 * 
 * @param error - Ошибка любого типа
 * @returns Понятное сообщение для пользователя
 */
export function handleError(error: unknown): string {
  // Если это AppError, возвращаем пользовательское сообщение
  if (error instanceof AppError) {
    return error.userMessage;
  }

  // Если это стандартная Error, анализируем сообщение
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    
    // Сетевые ошибки
    if (
      errorMessage.includes('failed to fetch') ||
      errorMessage.includes('networkerror') ||
      errorMessage.includes('network request failed') ||
      error.name === 'TypeError' && errorMessage.includes('fetch')
    ) {
      return 'Проблема с подключением к серверу. Проверьте интернет-соединение.';
    }

    // Таймауты
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out')
    ) {
      return 'Превышено время ожидания ответа от сервера. Попробуйте позже.';
    }

    // CORS ошибки
    if (
      errorMessage.includes('cors') ||
      errorMessage.includes('cross-origin')
    ) {
      return 'Ошибка доступа к серверу. Обратитесь к администратору.';
    }

    // Ошибки аутентификации
    if (
      errorMessage.includes('invalid login credentials') ||
      errorMessage.includes('invalid credentials') ||
      errorMessage.includes('wrong password')
    ) {
      return 'Неверный email или пароль.';
    }

    if (
      errorMessage.includes('user not found') ||
      errorMessage.includes('email not found')
    ) {
      return 'Пользователь с таким email не найден.';
    }

    if (
      errorMessage.includes('user already registered') ||
      errorMessage.includes('email already exists') ||
      errorMessage.includes('already registered')
    ) {
      return 'Пользователь с таким email уже зарегистрирован.';
    }

    if (
      errorMessage.includes('session expired') ||
      errorMessage.includes('token expired')
    ) {
      return 'Сессия истекла. Пожалуйста, войдите снова.';
    }

    if (
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('not authorized')
    ) {
      return 'Недостаточно прав доступа.';
    }

    // Ошибки валидации
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid')
    ) {
      return 'Проверьте правильность заполнения полей.';
    }

    if (errorMessage.includes('email')) {
      return 'Неверный формат email адреса.';
    }

    if (errorMessage.includes('password')) {
      return 'Пароль не соответствует требованиям.';
    }

    // Ошибки доступа
    if (
      errorMessage.includes('access denied') ||
      errorMessage.includes('permission denied') ||
      errorMessage.includes('forbidden')
    ) {
      return 'У вас нет доступа к этому разделу.';
    }

    if (
      errorMessage.includes('admin required') ||
      errorMessage.includes('administrator required')
    ) {
      return 'Для выполнения этого действия требуются права администратора.';
    }

    // Ошибки API
    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      return 'Запрашиваемый ресурс не найден.';
    }

    if (
      errorMessage.includes('server error') ||
      errorMessage.includes('500') ||
      errorMessage.includes('internal server error')
    ) {
      return 'Ошибка на сервере. Попробуйте позже или обратитесь к администратору.';
    }

    // Если сообщение уже понятное, возвращаем его
    if (error.message && error.message.length < 200) {
      return error.message;
    }
  }

  // Для всех остальных случаев
  return 'Произошла непредвиденная ошибка. Попробуйте позже или обратитесь к администратору.';
}

/**
 * Создает AppError из различных типов ошибок
 * 
 * @param error - Ошибка любого типа
 * @param defaultCode - Код ошибки по умолчанию
 * @param defaultUserMessage - Сообщение для пользователя по умолчанию
 * @returns AppError
 */
export function createAppError(
  error: unknown,
  defaultCode: ErrorCode = ErrorCode.UNKNOWN_ERROR,
  defaultUserMessage?: string
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const userMessage = defaultUserMessage || handleError(error);
  const message = error instanceof Error ? error.message : String(error);

  return new AppError(message, defaultCode, userMessage, error);
}

/**
 * Логирует ошибку в консоль с дополнительной информацией
 * 
 * @param error - Ошибка для логирования
 * @param context - Дополнительный контекст (название функции, параметры и т.д.)
 */
export function logError(error: unknown, context?: Record<string, any>): void {
  if (error instanceof AppError) {
    console.error('❌ AppError:', {
      code: error.code,
      message: error.message,
      userMessage: error.userMessage,
      context,
      originalError: error.originalError,
    });
  } else if (error instanceof Error) {
    console.error('❌ Error:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    });
  } else {
    console.error('❌ Unknown error:', {
      error,
      context,
    });
  }

  // Записываем ошибку в базу данных (асинхронно, не блокируем выполнение)
  // Определяем уровень серьезности на основе типа ошибки
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  
  if (error instanceof AppError) {
    // Критичные ошибки
    if ([ErrorCode.NETWORK_ERROR, ErrorCode.SERVER_ERROR].includes(error.code)) {
      severity = 'critical';
    } else if ([ErrorCode.UNAUTHORIZED, ErrorCode.ACCESS_DENIED].includes(error.code)) {
      severity = 'high';
    } else if ([ErrorCode.VALIDATION_ERROR, ErrorCode.INVALID_EMAIL].includes(error.code)) {
      severity = 'low';
    }
  }

  // Импортируем динамически, чтобы избежать циклических зависимостей
  import('../services/api/errorLogsApi')
    .then(({ logErrorToDatabase }) => {
      logErrorToDatabase(error, context, severity).catch((logErr) => {
        // Игнорируем ошибки логирования, чтобы не создавать бесконечный цикл
        console.debug('Failed to log error to database:', logErr);
      });
    })
    .catch(() => {
      // Игнорируем ошибки импорта
    });
}

/**
 * Типы ошибок для разных категорий
 */
export const ErrorMessages = {
  // Сетевые
  NETWORK: 'Проблема с подключением к серверу. Проверьте интернет-соединение.',
  TIMEOUT: 'Превышено время ожидания ответа от сервера. Попробуйте позже.',
  CORS: 'Ошибка доступа к серверу. Обратитесь к администратору.',
  
  // Аутентификация
  INVALID_CREDENTIALS: 'Неверный email или пароль.',
  USER_NOT_FOUND: 'Пользователь с таким email не найден.',
  USER_EXISTS: 'Пользователь с таким email уже зарегистрирован.',
  SESSION_EXPIRED: 'Сессия истекла. Пожалуйста, войдите снова.',
  UNAUTHORIZED: 'Недостаточно прав доступа.',
  
  // Валидация
  VALIDATION: 'Проверьте правильность заполнения полей.',
  INVALID_EMAIL: 'Неверный формат email адреса.',
  INVALID_PASSWORD: 'Пароль не соответствует требованиям.',
  REQUIRED_FIELD: 'Это поле обязательно для заполнения.',
  
  // Доступ
  ACCESS_DENIED: 'У вас нет доступа к этому разделу.',
  ADMIN_REQUIRED: 'Для выполнения этого действия требуются права администратора.',
  
  // API
  NOT_FOUND: 'Запрашиваемый ресурс не найден.',
  SERVER_ERROR: 'Ошибка на сервере. Попробуйте позже или обратитесь к администратору.',
  
  // Общие
  UNKNOWN: 'Произошла непредвиденная ошибка. Попробуйте позже или обратитесь к администратору.',
} as const;

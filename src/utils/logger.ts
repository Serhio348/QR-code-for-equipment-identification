/**
 * Утилита для условного логирования
 * 
 * В production режиме логи отключаются для улучшения производительности
 * В development режиме все логи работают как обычно
 * 
 * Использование:
 * import { logger } from '../utils/logger';
 * logger.log('Сообщение');
 * logger.error('Ошибка');
 * logger.warn('Предупреждение');
 */

const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

/**
 * Объект для логирования с условным выполнением
 * 
 * В production все методы являются no-op (ничего не делают)
 * В development работают как обычные console методы
 */
export const logger = {
  /**
   * Логирование обычных сообщений
   * Работает только в development режиме
   */
  log: isDevelopment
    ? (...args: any[]) => console.log(...args)
    : () => {},

  /**
   * Логирование ошибок
   * Всегда работает (ошибки важно видеть даже в production)
   */
  error: (...args: any[]) => console.error(...args),

  /**
   * Логирование предупреждений
   * Всегда работает (предупреждения важны даже в production)
   */
  warn: (...args: any[]) => console.warn(...args),

  /**
   * Логирование информационных сообщений
   * Работает только в development режиме
   */
  info: isDevelopment
    ? (...args: any[]) => console.info(...args)
    : () => {},

  /**
   * Логирование отладочных сообщений
   * Работает только в development режиме
   */
  debug: isDevelopment
    ? (...args: any[]) => console.debug(...args)
    : () => {},

  /**
   * Проверка, включено ли логирование
   */
  isEnabled: isDevelopment,
  
  /**
   * Режим работы (development/production)
   */
  mode: isProduction ? 'production' : 'development',
};

/**
 * Условное логирование с проверкой уровня
 * 
 * @param level - Уровень логирования ('log' | 'error' | 'warn' | 'info' | 'debug')
 * @param args - Аргументы для логирования
 */
export function conditionalLog(
  level: 'log' | 'error' | 'warn' | 'info' | 'debug',
  ...args: any[]
): void {
  if (level === 'error' || level === 'warn') {
    // Ошибки и предупреждения всегда логируются
    logger[level](...args);
  } else if (isDevelopment) {
    // Остальные логи только в development
    logger[level](...args);
  }
}


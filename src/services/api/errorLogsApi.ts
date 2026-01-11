/**
 * errorLogsApi.ts
 * 
 * API функции для работы с логами ошибок
 * Доступны только администраторам
 */

import { supabase } from '../../config/supabase';

export interface ErrorLog {
  id: string;
  error_code: string | null;
  error_message: string;
  user_message: string | null;
  error_type: string | null;
  user_id: string | null;
  user_email: string | null;
  url: string | null;
  user_agent: string | null;
  stack_trace: string | null;
  context: Record<string, any> | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface ErrorLogFilters {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  resolved?: boolean;
  error_code?: string;
  user_email?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
}

export interface ErrorStatistics {
  total_errors: number;
  critical_errors: number;
  high_errors: number;
  medium_errors: number;
  low_errors: number;
  unresolved_errors: number;
}

/**
 * Записать ошибку в лог
 * 
 * @param error - Ошибка для логирования
 * @param context - Дополнительный контекст
 * @param severity - Уровень серьезности
 */
export async function logErrorToDatabase(
  error: unknown,
  context?: Record<string, any>,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Promise<void> {
  try {
    // Получаем текущего пользователя
    const { data: { user } } = await supabase.auth.getUser();
    
    // Получаем email пользователя
    let userEmail: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();
      userEmail = profile?.email || user.email || null;
    }

    // Извлекаем информацию об ошибке
    let errorCode: string | null = null;
    let errorMessage = 'Unknown error';
    let userMessage: string | null = null;
    let stackTrace: string | null = null;

    if (error instanceof Error) {
      errorMessage = error.message;
      stackTrace = error.stack || null;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = JSON.stringify(error);
    }

    // Если это AppError, извлекаем код и пользовательское сообщение
    if (error && typeof error === 'object' && 'code' in error) {
      errorCode = (error as any).code;
      if ('userMessage' in error) {
        userMessage = (error as any).userMessage;
      }
    }

    // Получаем информацию о браузере и URL
    const url = typeof window !== 'undefined' ? window.location.href : null;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

    // Записываем в базу данных
    const { error: insertError } = await supabase
      .from('error_logs')
      .insert({
        error_code: errorCode,
        error_message: errorMessage,
        user_message: userMessage,
        error_type: 'error',
        user_id: user?.id || null,
        user_email: userEmail,
        url,
        user_agent: userAgent,
        stack_trace: stackTrace,
        context: context || null,
        severity,
      });

    if (insertError) {
      // Не бросаем ошибку, чтобы не создавать бесконечный цикл логирования
      console.error('Failed to log error to database:', insertError);
    }
  } catch (logError) {
    // Не бросаем ошибку, чтобы не создавать бесконечный цикл логирования
    console.error('Failed to log error:', logError);
  }
}

/**
 * Получить список логов ошибок
 * 
 * @param filters - Фильтры для поиска
 * @param limit - Максимальное количество записей
 * @param offset - Смещение для пагинации
 * @returns Список логов ошибок
 */
export async function getErrorLogs(
  filters: ErrorLogFilters = {},
  limit: number = 100,
  offset: number = 0
): Promise<{ data: ErrorLog[]; count: number }> {
  try {
    let query = supabase
      .from('error_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Применяем фильтры
    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }

    if (filters.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
    }

    if (filters.error_code) {
      query = query.eq('error_code', filters.error_code);
    }

    if (filters.user_email) {
      query = query.ilike('user_email', `%${filters.user_email}%`);
    }

    if (filters.start_date) {
      query = query.gte('created_at', filters.start_date);
    }

    if (filters.end_date) {
      query = query.lte('created_at', filters.end_date);
    }

    if (filters.search) {
      query = query.or(
        `error_message.ilike.%${filters.search}%,user_message.ilike.%${filters.search}%,error_code.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return {
      data: (data || []) as ErrorLog[],
      count: count || 0,
    };
  } catch (error: any) {
    console.error('Error fetching error logs:', error);
    throw new Error(error.message || 'Ошибка при получении логов');
  }
}

/**
 * Получить статистику ошибок
 * 
 * @param daysBack - Количество дней назад для статистики (по умолчанию 7)
 * @returns Статистика ошибок
 */
export async function getErrorStatistics(
  daysBack: number = 7
): Promise<ErrorStatistics> {
  try {
    const { data, error } = await supabase.rpc('get_error_statistics', {
      days_back: daysBack,
    });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return {
        total_errors: 0,
        critical_errors: 0,
        high_errors: 0,
        medium_errors: 0,
        low_errors: 0,
        unresolved_errors: 0,
      };
    }

    return data[0] as ErrorStatistics;
  } catch (error: any) {
    console.error('Error fetching error statistics:', error);
    throw new Error(error.message || 'Ошибка при получении статистики');
  }
}

/**
 * Получить количество нерешенных ошибок
 * 
 * @returns Количество нерешенных ошибок
 */
export async function getUnresolvedErrorsCount(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_unresolved_errors_count');

    if (error) {
      throw error;
    }

    return data || 0;
  } catch (error: any) {
    console.error('Error fetching unresolved errors count:', error);
    return 0; // Возвращаем 0 в случае ошибки, чтобы не блокировать UI
  }
}

/**
 * Пометить ошибку как решенную
 * 
 * @param logId - ID лога ошибки
 */
export async function markErrorAsResolved(logId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }

    const { error } = await supabase
      .from('error_logs')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq('id', logId);

    if (error) {
      throw error;
    }
  } catch (error: any) {
    console.error('Error marking error as resolved:', error);
    throw new Error(error.message || 'Ошибка при обновлении лога');
  }
}

/**
 * Пометить ошибку как нерешенную
 * 
 * @param logId - ID лога ошибки
 */
export async function markErrorAsUnresolved(logId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('error_logs')
      .update({
        resolved: false,
        resolved_at: null,
        resolved_by: null,
      })
      .eq('id', logId);

    if (error) {
      throw error;
    }
  } catch (error: any) {
    console.error('Error marking error as unresolved:', error);
    throw new Error(error.message || 'Ошибка при обновлении лога');
  }
}

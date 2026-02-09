/**
 * API для работы с логами активности пользователей
 */

import { supabase } from '../../../shared/config/supabase';
import {
  ActivityLog,
  ActivityLogFilters,
  ActivityStatistics,
  ActivityType,
  EntityType,
} from '../types/activityLog';

/**
 * Логировать действие пользователя в базу данных
 */
export async function logUserActivity(
  activityType: ActivityType,
  activityDescription: string,
  options?: {
    entityType?: EntityType;
    entityId?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  try {
    console.log('[ActivityLog] Attempting to log activity:', {
      activityType,
      activityDescription: activityDescription.substring(0, 50),
    });

    // Получаем текущего пользователя
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[ActivityLog] No user found, skipping log');
      return;
    }

    console.log('[ActivityLog] User found:', {
      userId: user.id,
      userEmail: user.email,
    });

    // Вставляем запись в таблицу user_activity_logs
    const { data, error } = await supabase.from('user_activity_logs').insert({
      user_id: user.id,
      user_email: user.email || null,
      activity_type: activityType,
      activity_description: activityDescription,
      entity_type: options?.entityType || null,
      entity_id: options?.entityId || null,
      metadata: options?.metadata || null,
    }).select();

    if (error) {
      console.error('[ActivityLog] Failed to log activity:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    } else {
      console.log('[ActivityLog] ✅ Activity logged successfully:', data);
    }
  } catch (error) {
    console.error('[ActivityLog] Unexpected error:', error);
  }
}

/**
 * Получить логи активности с фильтрацией
 */
export async function getActivityLogs(
  filters: ActivityLogFilters = {},
  limit: number = 100,
  offset: number = 0
): Promise<{ data: ActivityLog[]; count: number }> {
  try {
    let query = supabase
      .from('user_activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Применяем фильтры
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters.userEmail) {
      query = query.ilike('user_email', `%${filters.userEmail}%`);
    }

    if (filters.activityType) {
      query = query.eq('activity_type', filters.activityType);
    }

    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }

    if (filters.entityId) {
      query = query.eq('entity_id', filters.entityId);
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    // Применяем пагинацию
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return {
      data: (data as ActivityLog[]) || [],
      count: count || 0,
    };
  } catch (error) {
    console.error('[ActivityLog] Failed to fetch logs:', error);
    throw error;
  }
}

/**
 * Получить статистику по активности пользователей
 */
export async function getActivityStatistics(
  filters: ActivityLogFilters = {}
): Promise<ActivityStatistics> {
  try {
    const { data, error } = await supabase.rpc('get_activity_statistics', {
      p_user_id: filters.userId || null,
      p_activity_type: filters.activityType || null,
      p_entity_type: filters.entityType || null,
      p_start_date: filters.startDate || null,
      p_end_date: filters.endDate || null,
    });

    if (error) {
      // Если RPC функция не существует, возвращаем заглушку
      console.warn('[ActivityLog] RPC function not found, returning mock data');
      return {
        total_count: 0,
        unique_users_count: 0,
        activities_by_type: [],
        activities_by_user: [],
        recent_24h_count: 0,
      };
    }

    return data as ActivityStatistics;
  } catch (error) {
    console.error('[ActivityLog] Failed to fetch statistics:', error);
    return {
      total_count: 0,
      unique_users_count: 0,
      activities_by_type: [],
      activities_by_user: [],
      recent_24h_count: 0,
    };
  }
}

/**
 * Удалить старые логи активности (старше указанного количества дней)
 */
export async function cleanupOldActivityLogs(daysToKeep: number = 90): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { data, error } = await supabase
      .from('user_activity_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      throw error;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('[ActivityLog] Failed to cleanup old logs:', error);
    throw error;
  }
}

/**
 * Удалить логи за сегодняшний день
 */
export async function deleteLogsForToday(): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('user_activity_logs')
      .delete()
      .gte('created_at', today.toISOString())
      .select('id');

    if (error) throw error;
    return data?.length || 0;
  } catch (error) {
    console.error('[ActivityLog] Failed to delete today logs:', error);
    throw error;
  }
}

/**
 * Удалить логи за текущий месяц
 */
export async function deleteLogsForMonth(): Promise<number> {
  try {
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('user_activity_logs')
      .delete()
      .gte('created_at', firstDayOfMonth.toISOString())
      .select('id');

    if (error) throw error;
    return data?.length || 0;
  } catch (error) {
    console.error('[ActivityLog] Failed to delete month logs:', error);
    throw error;
  }
}

/**
 * Удалить все логи
 */
export async function deleteAllLogs(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_activity_logs')
      .delete()
      .gte('created_at', '2000-01-01T00:00:00.000Z')
      .select('id');

    if (error) throw error;
    return data?.length || 0;
  } catch (error) {
    console.error('[ActivityLog] Failed to delete all logs:', error);
    throw error;
  }
}

/**
 * Экспортировать логи активности в CSV
 */
export async function exportActivityLogsToCSV(
  filters: ActivityLogFilters = {}
): Promise<string> {
  try {
    const { data } = await getActivityLogs(filters, 10000, 0);

    // Заголовки CSV
    const headers = [
      'ID',
      'User Email',
      'Activity Type',
      'Description',
      'Entity Type',
      'Entity ID',
      'Created At',
    ];

    // Формируем строки CSV
    const rows = data.map((log) => [
      log.id,
      log.user_email || '',
      log.activity_type,
      log.activity_description,
      log.entity_type || '',
      log.entity_id || '',
      new Date(log.created_at).toLocaleString('ru-RU'),
    ]);

    // Объединяем в CSV строку
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  } catch (error) {
    console.error('[ActivityLog] Failed to export logs:', error);
    throw error;
  }
}

/**
 * Диагностика системы логирования активности
 * Возвращает детальную информацию о состоянии системы
 */
export interface DiagnosticResult {
  success: boolean;
  message: string;
  details: {
    userAuthenticated: boolean;
    userId?: string;
    userEmail?: string;
    tableAccessible: boolean;
    insertSucceeded: boolean;
    error?: string;
    errorCode?: string;
    errorDetails?: string;
    errorHint?: string;
  };
}

export async function testActivityLogging(): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    success: false,
    message: '',
    details: {
      userAuthenticated: false,
      tableAccessible: false,
      insertSucceeded: false,
    },
  };

  try {
    // Шаг 1: Проверка аутентификации пользователя
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      result.message = '❌ ОШИБКА: Пользователь не аутентифицирован';
      result.details.error = 'Пользователь не найден. Попробуйте выйти и войти заново.';
      return result;
    }

    result.details.userAuthenticated = true;
    result.details.userId = user.id;
    result.details.userEmail = user.email || 'Не указан';

    // Шаг 2: Проверка доступа к таблице (чтение)
    const { error: readError } = await supabase
      .from('user_activity_logs')
      .select('id')
      .limit(1);

    if (readError) {
      result.message = '❌ ОШИБКА: Нет доступа к таблице user_activity_logs';
      result.details.error = readError.message;
      result.details.errorCode = readError.code;
      result.details.errorDetails = readError.details || '';
      result.details.errorHint = readError.hint || '';
      return result;
    }

    result.details.tableAccessible = true;

    // Шаг 3: Попытка вставить тестовую запись
    const { data: insertedData, error: insertError } = await supabase
      .from('user_activity_logs')
      .insert({
        user_id: user.id,
        user_email: user.email || null,
        activity_type: 'other',
        activity_description: '[ТЕСТ] Проверка системы логирования',
        entity_type: 'other',
        entity_id: null,
        metadata: {
          test: true,
          timestamp: new Date().toISOString(),
        },
      })
      .select();

    if (insertError) {
      result.message = '❌ ОШИБКА: Не удалось вставить запись в таблицу';
      result.details.error = insertError.message;
      result.details.errorCode = insertError.code;
      result.details.errorDetails = insertError.details || '';
      result.details.errorHint = insertError.hint || '';

      // Дополнительная информация для распространенных ошибок
      if (insertError.code === '42501') {
        result.details.errorHint = 'RLS политика блокирует вставку. Проверьте политики INSERT в таблице user_activity_logs.';
      } else if (insertError.code === '23503') {
        result.details.errorHint = 'Ошибка foreign key. Возможно, user_id не существует в таблице auth.users.';
      }

      return result;
    }

    result.details.insertSucceeded = true;
    result.success = true;
    result.message = `✅ УСПЕХ: Тестовая запись успешно добавлена! ID записи: ${insertedData?.[0]?.id}`;

    return result;
  } catch (error: any) {
    result.message = '❌ КРИТИЧЕСКАЯ ОШИБКА при диагностике';
    result.details.error = error?.message || String(error);
    return result;
  }
}

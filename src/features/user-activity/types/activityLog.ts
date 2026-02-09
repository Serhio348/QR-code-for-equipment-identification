/**
 * Типы для системы логирования активности пользователей
 */

/**
 * Тип действия пользователя
 */
export type ActivityType =
  | 'chat_message'
  | 'equipment_view'
  | 'equipment_create'
  | 'equipment_update'
  | 'equipment_delete'
  | 'maintenance_add'
  | 'maintenance_update'
  | 'maintenance_delete'
  | 'file_upload'
  | 'file_view'
  | 'login'
  | 'logout'
  | 'other';

/**
 * Тип сущности, с которой связано действие
 */
export type EntityType =
  | 'equipment'
  | 'maintenance_entry'
  | 'file'
  | 'chat'
  | 'user'
  | 'other';

/**
 * Запись активности пользователя
 */
export interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string | null;
  activity_type: ActivityType;
  activity_description: string;
  entity_type: EntityType | null;
  entity_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

/**
 * Фильтры для получения логов активности
 */
export interface ActivityLogFilters {
  userId?: string;
  userEmail?: string;
  activityType?: ActivityType;
  entityType?: EntityType;
  entityId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Статистика по активности пользователей
 */
export interface ActivityStatistics {
  total_count: number;
  unique_users_count: number;
  activities_by_type: Array<{
    activity_type: ActivityType;
    count: number;
  }>;
  activities_by_user: Array<{
    user_email: string;
    count: number;
  }>;
  recent_24h_count: number;
}

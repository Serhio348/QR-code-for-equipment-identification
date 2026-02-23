-- ============================================
-- Миграция: Синхронизация constraint activity_type с TypeScript типами
-- Дата: 2026-02-23
-- Причина: В constraint отсутствовали типы qr_code_scan, equipment_list_view,
--          equipment_search, equipment_filter, equipment_export_pdf,
--          maintenance_log_open, folder_open, documentation_open
-- ============================================

ALTER TABLE user_activity_logs
  DROP CONSTRAINT IF EXISTS user_activity_logs_activity_type_check;

ALTER TABLE user_activity_logs
  ADD CONSTRAINT user_activity_logs_activity_type_check
  CHECK (activity_type IN (
    'chat_message',
    'qr_code_scan',
    'equipment_view',
    'equipment_list_view',
    'equipment_create',
    'equipment_update',
    'equipment_delete',
    'equipment_search',
    'equipment_filter',
    'equipment_export_pdf',
    'maintenance_add',
    'maintenance_update',
    'maintenance_delete',
    'maintenance_log_open',
    'file_upload',
    'file_view',
    'folder_open',
    'documentation_open',
    'login',
    'logout',
    'user_register',
    'other'
  ));

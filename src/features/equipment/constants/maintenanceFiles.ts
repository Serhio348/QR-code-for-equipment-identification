/**
 * maintenanceFiles.ts
 *
 * Лимиты и утилиты для вложений журнала обслуживания.
 */

/** Максимальное количество файлов на одну запись журнала */
export const MAX_MAINTENANCE_FILES = 20;

/** Максимальный размер одного файла (10 МБ) */
export const MAX_MAINTENANCE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface AppendMaintenanceFilesResult {
  files: File[];
  rejected: string[];
}

function isSameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Добавляет выбранные файлы к уже выбранным с проверкой лимитов.
 */
export function appendMaintenanceFiles(
  current: File[],
  picked: File[],
  maxTotal: number = MAX_MAINTENANCE_FILES
): AppendMaintenanceFilesResult {
  const files = [...current];
  const rejected: string[] = [];
  const maxSizeMb = MAX_MAINTENANCE_FILE_SIZE_BYTES / 1024 / 1024;

  for (const file of picked) {
    if (files.some((existing) => isSameFile(existing, file))) {
      continue;
    }

    if (file.size > MAX_MAINTENANCE_FILE_SIZE_BYTES) {
      rejected.push(`«${file.name}» больше ${maxSizeMb} МБ`);
      continue;
    }

    if (files.length >= maxTotal) {
      rejected.push(`Максимум ${maxTotal} файлов на одну запись`);
      break;
    }

    files.push(file);
  }

  return { files, rejected };
}

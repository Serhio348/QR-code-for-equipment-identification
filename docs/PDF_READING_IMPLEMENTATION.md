# Инструкция: Добавление функции чтения файлов (PDF, Word, Excel)

## Обзор

Эта инструкция описывает пошаговое добавление функциональности чтения содержимого файлов из Google Drive в MCP-сервер. После реализации AI-консультант сможет читать паспорта и инструкции оборудования.

### Поддерживаемые форматы:
| Формат | Расширения | Метод обработки |
|--------|------------|-----------------|
| PDF | .pdf | Конвертация в Google Docs с OCR |
| Word | .doc, .docx | Конвертация в Google Docs |
| Excel | .xls, .xlsx | Конвертация в Google Sheets |
| Google Docs | — | Чтение напрямую |
| Google Sheets | — | Чтение напрямую |
| Текстовые | .txt, .md, .csv, .json, .xml | Чтение как UTF-8 |

## Архитектура решения

```
┌─────────────────┐     HTTP      ┌─────────────────┐     Drive API    ┌──────────────┐
│   MCP Server    │ ──────────▶  │  Google Apps    │ ───────────────▶ │ Google Drive │
│   (Node.js)     │              │  Script (GAS)   │                  │   (PDF)      │
│                 │ ◀──────────  │                 │ ◀─────────────── │              │
│ drive_read_file │    JSON      │ getFileContent  │    Blob/Text     │              │
└─────────────────┘              └─────────────────┘                  └──────────────┘
```

**Важно:** Google Apps Script не имеет встроенного PDF-парсера. Мы используем подход с конвертацией PDF в Google Docs, который автоматически распознает текст (включая OCR для сканов).

---

## Часть 1: Google Apps Script (бэкенд)

### Шаг 1.1: Открыть проект GAS

1. Перейти в Google Sheets с базой оборудования
2. Меню: **Расширения** → **Apps Script**
3. Открыть файл `DriveOperations.gs`

### Шаг 1.2: Добавить функцию чтения файла

Добавить в конец файла `DriveOperations.gs`:

```javascript
// ============================================================================
// ФУНКЦИИ ЧТЕНИЯ СОДЕРЖИМОГО ФАЙЛОВ
// ============================================================================

/**
 * Получить текстовое содержимое файла из Google Drive
 *
 * Поддерживаемые форматы:
 * - PDF: конвертируется в Google Docs, затем извлекается текст (с OCR)
 * - Word (.doc, .docx): конвертируется в Google Docs
 * - Excel (.xls, .xlsx): конвертируется в Google Sheets
 * - Google Docs: извлекается текст напрямую
 * - Google Sheets: извлекаются данные как текст
 * - Текстовые файлы (.txt, .md, .csv, .json, .xml): читаются как есть
 *
 * @param {string} fileUrlOrId - URL файла или его ID
 * @param {Object} options - Опции (опционально)
 * @param {boolean} options.keepTempFile - Не удалять временный файл (для отладки)
 * @param {number} options.maxLength - Максимальная длина текста (по умолчанию 50000)
 * @returns {Object} {success, content, fileName, mimeType, charCount, error}
 */
function getFileContent(fileUrlOrId, options) {
  options = options || {};
  const maxLength = options.maxLength || 50000;
  const keepTempFile = options.keepTempFile || false;

  try {
    Logger.log('📄 getFileContent: начало');
    Logger.log('  - fileUrlOrId: ' + fileUrlOrId);

    if (!fileUrlOrId || !fileUrlOrId.trim()) {
      return {
        success: false,
        error: 'URL или ID файла не указан'
      };
    }

    // Извлекаем ID файла
    const fileId = extractFileIdFromUrl(fileUrlOrId);

    if (!fileId) {
      return {
        success: false,
        error: 'Не удалось извлечь ID файла из URL: ' + fileUrlOrId
      };
    }

    Logger.log('  - fileId: ' + fileId);

    // Получаем файл
    const file = DriveApp.getFileById(fileId);
    const fileName = file.getName();
    const mimeType = file.getMimeType();

    Logger.log('  - fileName: ' + fileName);
    Logger.log('  - mimeType: ' + mimeType);

    let content = '';

    // Обрабатываем в зависимости от типа файла
    if (mimeType === 'application/pdf') {
      // PDF: конвертируем в Google Docs для извлечения текста
      content = extractTextFromPdf(file, keepTempFile);

    } else if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs: извлекаем текст напрямую
      content = extractTextFromGoogleDoc(fileId);

    } else if (mimeType === 'application/msword' ||
               mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Word (.doc, .docx): конвертируем в Google Docs
      content = extractTextFromWordFile(file, keepTempFile);

    } else if (mimeType.startsWith('text/') ||
               mimeType === 'application/json' ||
               mimeType === 'application/xml') {
      // Текстовые файлы: читаем как есть
      content = file.getBlob().getDataAsString('UTF-8');

    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets: извлекаем данные как текст
      content = extractTextFromGoogleSheet(fileId);

    } else if (mimeType === 'application/vnd.ms-excel' ||
               mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      // Excel (.xls, .xlsx): конвертируем в Google Sheets
      content = extractTextFromExcelFile(file, keepTempFile);

    } else {
      return {
        success: false,
        error: 'Неподдерживаемый тип файла: ' + mimeType + '. Поддерживаются: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), Google Docs, Google Sheets, текстовые файлы.'
      };
    }

    // Ограничиваем длину текста
    const originalLength = content.length;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n\n... [текст обрезан, показано ' + maxLength + ' из ' + originalLength + ' символов]';
    }

    Logger.log('✅ getFileContent: успешно извлечено ' + content.length + ' символов');

    return {
      success: true,
      content: content,
      fileName: fileName,
      mimeType: mimeType,
      charCount: originalLength,
      truncated: originalLength > maxLength
    };

  } catch (error) {
    Logger.log('❌ getFileContent ошибка: ' + error.toString());
    Logger.log('  - Stack: ' + (error.stack || 'нет стека'));

    return {
      success: false,
      error: 'Ошибка чтения файла: ' + error.toString()
    };
  }
}

/**
 * Извлечь текст из PDF файла
 *
 * Использует конвертацию в Google Docs с OCR
 *
 * @param {File} file - Объект файла DriveApp
 * @param {boolean} keepTempFile - Не удалять временный файл
 * @returns {string} Извлеченный текст
 */
function extractTextFromPdf(file, keepTempFile) {
  Logger.log('📄 extractTextFromPdf: конвертация PDF в Google Docs');

  let tempDoc = null;

  try {
    // Получаем blob файла
    const blob = file.getBlob();

    // Создаем временный Google Doc с OCR
    // Ресурс для Drive API v2
    const resource = {
      title: '[TEMP] ' + file.getName() + ' - извлечение текста',
      mimeType: 'application/vnd.google-apps.document'
    };

    // Используем Drive API для конвертации с OCR
    // ocr: true включает распознавание текста на изображениях
    tempDoc = Drive.Files.insert(resource, blob, {
      ocr: true,
      ocrLanguage: 'ru' // Основной язык - русский
    });

    Logger.log('  - Создан временный документ: ' + tempDoc.id);

    // Извлекаем текст из созданного документа
    const doc = DocumentApp.openById(tempDoc.id);
    const text = doc.getBody().getText();

    Logger.log('  - Извлечено символов: ' + text.length);

    return text;

  } finally {
    // Удаляем временный документ (если не указано keepTempFile)
    if (tempDoc && !keepTempFile) {
      try {
        Drive.Files.remove(tempDoc.id);
        Logger.log('  - Временный документ удален');
      } catch (deleteError) {
        Logger.log('  ⚠️ Не удалось удалить временный документ: ' + deleteError);
      }
    }
  }
}

/**
 * Извлечь текст из Google Docs
 *
 * @param {string} docId - ID документа
 * @returns {string} Текст документа
 */
function extractTextFromGoogleDoc(docId) {
  Logger.log('📄 extractTextFromGoogleDoc: ' + docId);

  const doc = DocumentApp.openById(docId);
  const text = doc.getBody().getText();

  Logger.log('  - Извлечено символов: ' + text.length);

  return text;
}

/**
 * Извлечь данные из Google Sheets как текст
 *
 * @param {string} sheetId - ID таблицы
 * @returns {string} Данные в текстовом формате
 */
function extractTextFromGoogleSheet(sheetId) {
  Logger.log('📄 extractTextFromGoogleSheet: ' + sheetId);

  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheets = spreadsheet.getSheets();

  let result = [];

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const sheetName = sheet.getName();
    const data = sheet.getDataRange().getValues();

    result.push('=== Лист: ' + sheetName + ' ===\n');

    for (let row = 0; row < data.length; row++) {
      const rowText = data[row].map(function(cell) {
        return cell !== null && cell !== undefined ? String(cell) : '';
      }).join(' | ');
      result.push(rowText);
    }

    result.push('\n');
  }

  const text = result.join('\n');
  Logger.log('  - Извлечено символов: ' + text.length);

  return text;
}

/**
 * Извлечь текст из Word файла (.doc, .docx)
 *
 * Конвертирует файл в Google Docs, затем извлекает текст
 *
 * @param {File} file - Объект файла DriveApp
 * @param {boolean} keepTempFile - Не удалять временный файл
 * @returns {string} Извлеченный текст
 */
function extractTextFromWordFile(file, keepTempFile) {
  Logger.log('📄 extractTextFromWordFile: конвертация Word в Google Docs');
  Logger.log('  - fileName: ' + file.getName());

  var tempDoc = null;

  try {
    var blob = file.getBlob();

    var resource = {
      title: '[TEMP] ' + file.getName() + ' - извлечение текста',
      mimeType: 'application/vnd.google-apps.document'
    };

    // convert: true автоматически конвертирует в Google формат
    tempDoc = Drive.Files.insert(resource, blob, {
      convert: true
    });

    Logger.log('  - Создан временный документ: ' + tempDoc.id);

    var doc = DocumentApp.openById(tempDoc.id);
    var text = doc.getBody().getText();

    Logger.log('  - Извлечено символов: ' + text.length);

    return text;

  } finally {
    if (tempDoc && !keepTempFile) {
      try {
        Drive.Files.remove(tempDoc.id);
        Logger.log('  - Временный документ удален');
      } catch (deleteError) {
        Logger.log('  ⚠️ Не удалось удалить временный документ: ' + deleteError);
      }
    }
  }
}

/**
 * Извлечь данные из Excel файла (.xls, .xlsx)
 *
 * Конвертирует файл в Google Sheets, затем извлекает данные
 *
 * @param {File} file - Объект файла DriveApp
 * @param {boolean} keepTempFile - Не удалять временный файл
 * @returns {string} Извлеченные данные в текстовом формате
 */
function extractTextFromExcelFile(file, keepTempFile) {
  Logger.log('📄 extractTextFromExcelFile: конвертация Excel в Google Sheets');
  Logger.log('  - fileName: ' + file.getName());

  var tempSheet = null;

  try {
    var blob = file.getBlob();

    var resource = {
      title: '[TEMP] ' + file.getName() + ' - извлечение данных',
      mimeType: 'application/vnd.google-apps.spreadsheet'
    };

    tempSheet = Drive.Files.insert(resource, blob, {
      convert: true
    });

    Logger.log('  - Создана временная таблица: ' + tempSheet.id);

    // Используем существующую функцию
    var text = extractTextFromGoogleSheet(tempSheet.id);

    return text;

  } finally {
    if (tempSheet && !keepTempFile) {
      try {
        Drive.Files.remove(tempSheet.id);
        Logger.log('  - Временная таблица удалена');
      } catch (deleteError) {
        Logger.log('  ⚠️ Не удалось удалить временную таблицу: ' + deleteError);
      }
    }
  }
}

/**
 * Извлечь ID файла из URL Google Drive
 *
 * Поддерживает форматы:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - FILE_ID (прямой ID)
 *
 * @param {string} urlOrId - URL или ID файла
 * @returns {string|null} ID файла или null
 */
function extractFileIdFromUrl(urlOrId) {
  if (!urlOrId) {
    return null;
  }

  const trimmed = String(urlOrId).trim();
  if (!trimmed) {
    return null;
  }

  // Формат: https://drive.google.com/file/d/FILE_ID/view
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) {
    return fileMatch[1];
  }

  // Формат: https://drive.google.com/open?id=FILE_ID
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }

  // Прямой ID
  const idPattern = /^[a-zA-Z0-9_-]{20,}$/;
  if (idPattern.test(trimmed) && !trimmed.includes('/') && !trimmed.includes('?')) {
    return trimmed;
  }

  return null;
}
```

### Шаг 1.3: Добавить обработчик в Code.gs

Открыть файл `Code.gs` и добавить новый case в функцию `doGet` (в блок switch, перед `default:`):

```javascript
      case 'getFileContent':
        // Получить содержимое файла (PDF, Google Docs и т.д.)
        Logger.log('📄 Обработка getFileContent');
        const contentFileUrl = e.parameter.fileId || e.parameter.fileUrl;
        if (!contentFileUrl) {
          return createErrorResponse('Не указан fileId или fileUrl');
        }
        return handleGetFileContent({
          fileId: contentFileUrl,
          maxLength: e.parameter.maxLength,
          keepTempFile: e.parameter.keepTempFile
        });
```

**Место вставки:** Найти строку `case 'getBeliotDeviceOverride':` и вставить новый case ПЕРЕД блоком `default:`.

### Шаг 1.4: Добавить функцию-обработчик в DriveOperations.gs

Открыть файл `DriveOperations.gs` и добавить в конец файла:

```javascript
/**
 * Обработчик запроса на чтение содержимого файла
 *
 * @param {Object} params - Параметры запроса
 * @param {string} params.fileId - ID или URL файла
 * @param {number} params.maxLength - Максимальная длина текста
 * @param {boolean} params.keepTempFile - Не удалять временный файл
 * @returns {TextOutput} JSON ответ с содержимым файла
 */
function handleGetFileContent(params) {
  try {
    Logger.log('📄 handleGetFileContent');
    Logger.log('  - params: ' + JSON.stringify(params));

    if (!params.fileId && !params.fileUrl) {
      return createErrorResponse('Не указан fileId или fileUrl');
    }

    const fileUrlOrId = params.fileId || params.fileUrl;

    const options = {
      maxLength: params.maxLength ? parseInt(params.maxLength, 10) : 50000,
      keepTempFile: params.keepTempFile === 'true' || params.keepTempFile === true
    };

    const result = getFileContent(fileUrlOrId, options);

    if (result.success) {
      return createJsonResponse({
        success: true,
        data: result
      });
    } else {
      return createErrorResponse(result.error);
    }

  } catch (error) {
    Logger.log('❌ handleGetFileContent ошибка: ' + error.toString());
    return createErrorResponse('Ошибка: ' + error.toString());
  }
}
```

### Шаг 1.5: Включить Drive API в проекте GAS

1. В редакторе Apps Script открыть **Сервисы** (значок +)
2. Найти **Drive API** (не путать с DriveApp!)
3. Нажать **Добавить**
4. Убедиться, что версия API = v2

### Шаг 1.6: Развернуть обновленный скрипт

1. Меню: **Развертывание** → **Управление развертываниями**
2. Создать новое развертывание или обновить существующее
3. Скопировать URL веб-приложения (он должен остаться прежним)

---

## Часть 2: MCP-сервер (Node.js)

### Шаг 2.1: Добавить тип для результата чтения файла

Открыть файл `mcp-google-drive-sheets/src/types/drive.ts` и добавить:

```typescript
/**
 * Результат чтения содержимого файла.
 */
export interface ReadFileResult {
  /** Успешность операции */
  success: boolean;

  /** Текстовое содержимое файла */
  content?: string;

  /** Имя файла */
  fileName?: string;

  /** MIME тип файла */
  mimeType?: string;

  /** Количество символов в исходном файле */
  charCount?: number;

  /** Был ли текст обрезан */
  truncated?: boolean;

  /** Сообщение об ошибке */
  error?: string;
}
```

### Шаг 2.2: Добавить инструмент чтения файла

Открыть файл `mcp-google-drive-sheets/src/tools/driveTools.ts`.

**2.2.1. Добавить импорт типа:**

```typescript
import type { DriveFile, DriveFolder, CreateFolderResult, ReadFileResult } from '../types/drive.js';
```

**2.2.2. Добавить Zod схему (после существующих схем):**

```typescript
/**
 * Схема для чтения содержимого файла.
 */
const readFileSchema = z.object({
  // URL или ID файла (обязательно)
  fileUrl: z.string().min(1, 'URL или ID файла обязателен'),

  // Максимальная длина текста (опционально)
  // По умолчанию 50000 символов
  maxLength: z.number().min(100).max(100000).optional(),
});
```

**2.2.3. Добавить инструмент (внутри функции `registerDriveTools`, после существующих инструментов):**

```typescript
  // ==========================================
  // Инструмент 5: Чтение содержимого файла
  // ==========================================

  server.tool(
    'drive_read_file',

    'Прочитать текстовое содержимое файла из Google Drive. ' +
    'Поддерживает: PDF (с OCR), Google Docs, Google Sheets, текстовые файлы. ' +
    'Для PDF файлов автоматически распознается текст, включая отсканированные документы. ' +
    'Возвращает текст файла (до 50000 символов по умолчанию).',

    readFileSchema.shape,

    async (params) => {
      try {
        // Валидация входных данных
        const parsed = readFileSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // Извлекаем ID файла из URL
        const fileId = extractDriveId(parsed.data.fileUrl);

        if (!fileId) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Не удалось извлечь ID файла из указанного URL',
            }],
            isError: true,
          };
        }

        // Формируем параметры запроса
        const queryParams: Record<string, string> = {
          fileId: fileId,
        };

        if (parsed.data.maxLength) {
          queryParams.maxLength = String(parsed.data.maxLength);
        }

        // Вызываем GAS API
        const result = await gasClient.get<ReadFileResult>('getFileContent', queryParams);

        // Проверяем результат
        if (!result.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка чтения файла: ${result.error || 'Неизвестная ошибка'}`,
            }],
            isError: true,
          };
        }

        // Формируем ответ
        let responseText = `📄 Файл: ${result.fileName}\n`;
        responseText += `📋 Тип: ${result.mimeType}\n`;
        responseText += `📊 Символов: ${result.charCount}`;

        if (result.truncated) {
          responseText += ` (текст обрезан до ${parsed.data.maxLength || 50000} символов)`;
        }

        responseText += `\n\n--- Содержимое файла ---\n\n${result.content}`;

        return {
          content: [{
            type: 'text' as const,
            text: responseText,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка чтения файла: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
```

### Шаг 2.3: Обновить утилиту парсинга URL (если нужно)

Проверить файл `mcp-google-drive-sheets/src/utils/urlParser.ts`. Убедиться, что функция `extractDriveId` поддерживает формат файлов:

```typescript
// Должен поддерживать:
// - https://drive.google.com/file/d/FILE_ID/view
// - https://drive.google.com/file/d/FILE_ID
```

Если не поддерживает, добавить паттерн:

```typescript
// Формат: https://drive.google.com/file/d/FILE_ID/view
const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
if (fileMatch && fileMatch[1]) {
  return fileMatch[1];
}
```

### Шаг 2.4: Пересобрать MCP-сервер

```bash
cd mcp-google-drive-sheets
npm run build
```

### Шаг 2.5: Перезапустить Claude Code

Закрыть и открыть заново Claude Code, чтобы обновленный MCP-сервер загрузился.

---

## Часть 3: Тестирование

### Тест 1: Проверка GAS функции

В редакторе Apps Script создать тестовую функцию:

```javascript
function testGetFileContent() {
  // Замените на реальный ID PDF файла из вашего Drive
  const testFileId = '1-44iVaJjfZDbcqenE-js4vPYHfZhx1tt';

  const result = getFileContent(testFileId);

  Logger.log('=== Результат теста ===');
  Logger.log('Success: ' + result.success);
  Logger.log('FileName: ' + result.fileName);
  Logger.log('MimeType: ' + result.mimeType);
  Logger.log('CharCount: ' + result.charCount);
  Logger.log('Truncated: ' + result.truncated);

  if (result.success) {
    Logger.log('Content (первые 500 символов):');
    Logger.log(result.content.substring(0, 500));
  } else {
    Logger.log('Error: ' + result.error);
  }
}
```

Запустить функцию и проверить логи.

### Тест 2: Проверка через MCP

В Claude Code выполнить:

```
Прочитай содержимое файла https://drive.google.com/file/d/1-44iVaJjfZDbcqenE-js4vPYHfZhx1tt/view
```

---

## Часть 4: Возможные проблемы и решения

### Проблема: "Drive API not enabled"

**Решение:** Включить Drive API в проекте GAS (Шаг 1.4)

### Проблема: "Insufficient permissions"

**Решение:**
1. Проверить, что веб-приложение развернуто "от имени" правильного аккаунта
2. Убедиться, что у этого аккаунта есть доступ к файлу

### Проблема: OCR не распознает текст

**Решение:**
1. Проверить качество скана (минимум 150 DPI)
2. Попробовать указать другой язык OCR: `ocrLanguage: 'en'`

### Проблема: Таймаут при обработке большого PDF

**Решение:**
1. Увеличить таймаут в `gasClient.ts`
2. Разбить PDF на страницы (требует дополнительной реализации)

### Проблема: "Quota exceeded"

**Решение:**
1. Google Drive API имеет лимиты на количество запросов
2. Добавить кэширование результатов
3. Использовать `Utilities.sleep(1000)` между запросами

---

## Дополнительные улучшения (опционально)

### 1. Кэширование результатов

Добавить в GAS:

```javascript
function getFileContentCached(fileUrlOrId, options) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'file_' + extractFileIdFromUrl(fileUrlOrId);

  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const result = getFileContent(fileUrlOrId, options);

  if (result.success) {
    // Кэшируем на 1 час
    cache.put(cacheKey, JSON.stringify(result), 3600);
  }

  return result;
}
```

### 2. Поддержка изображений

Для извлечения текста из изображений (JPG, PNG) использовать тот же подход с OCR:

```javascript
function extractTextFromImage(file) {
  const blob = file.getBlob();

  const resource = {
    title: '[TEMP] OCR ' + file.getName(),
    mimeType: 'application/vnd.google-apps.document'
  };

  const tempDoc = Drive.Files.insert(resource, blob, {
    ocr: true,
    ocrLanguage: 'ru'
  });

  // ... извлечение текста аналогично PDF
}
```

### 3. Чтение конкретных страниц PDF

Для больших PDF можно добавить опцию чтения только определенных страниц (требует использования внешнего PDF-сервиса или библиотеки).

---

## Структура файлов после изменений

```
mcp-google-drive-sheets/
├── src/
│   ├── tools/
│   │   └── driveTools.ts      # + инструмент drive_read_file
│   ├── types/
│   │   └── drive.ts           # + тип ReadFileResult
│   └── utils/
│       └── urlParser.ts       # проверить поддержку /file/d/ URL

backend/equipment-db/
├── DriveOperations.gs         # + функции getFileContent, extractTextFromPdf и др.
└── Code.gs                    # + обработчик handleGetFileContent
```

---

## Контакты для вопросов

При возникновении проблем:
1. Проверить логи в Google Apps Script (Выполнения → История выполнений)
2. Проверить консоль Claude Code для ошибок MCP
3. Убедиться, что все зависимости установлены (`npm install` в папке mcp-google-drive-sheets)

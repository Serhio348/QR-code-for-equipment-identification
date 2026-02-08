/**
 * geminiToolAdapter.ts
 *
 * Адаптер для работы с function calling в Gemini API.
 * Конвертирует универсальный формат tools в формат Google Generative AI.
 */

import { ToolDefinition } from '../types.js';

// Типы схем, поддерживаемые Gemini API
type GeminiSchemaType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'OBJECT' | 'ARRAY';

/**
 * Конвертирует JSON Schema type в Gemini SchemaType
 */
function convertJsonSchemaTypeToGemini(type: string): GeminiSchemaType {
  const typeMap: Record<string, GeminiSchemaType> = {
    string: 'STRING',
    number: 'NUMBER',
    integer: 'INTEGER',
    boolean: 'BOOLEAN',
    object: 'OBJECT',
    array: 'ARRAY',
  };

  return typeMap[type] || 'STRING';
}

/**
 * Конвертирует JSON Schema properties в формат Gemini
 */
function convertProperties(properties: Record<string, any>): Record<string, any> {
  const converted: Record<string, any> = {};

  for (const [key, value] of Object.entries(properties)) {
    converted[key] = {
      type: convertJsonSchemaTypeToGemini(value.type),
      description: value.description,
    };

    // Для объектов и массивов обрабатываем вложенные свойства
    if (value.type === 'object' && value.properties) {
      converted[key].properties = convertProperties(value.properties);
    }

    if (value.type === 'array' && value.items) {
      converted[key].items = {
        type: convertJsonSchemaTypeToGemini(value.items.type),
      };
    }

    // Enum values
    if (value.enum) {
      converted[key].enum = value.enum;
    }
  }

  return converted;
}

/**
 * Конвертирует универсальный формат tool в формат Gemini API.
 *
 * Gemini использует FunctionDeclaration вместо Tool.
 */
export function convertToGeminiTools(tools: ToolDefinition[]): any[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT',
      properties: convertProperties(tool.input_schema.properties),
      required: tool.input_schema.required || [],
    },
  }));
}

/**
 * Извлекает function calls из ответа Gemini.
 *
 * @param parts - Массив частей контента из ответа Gemini
 * @returns Массив вызовов функций с именем и параметрами
 */
export function extractGeminiFunctionCalls(
  parts: any[]
): Array<{ name: string; input: Record<string, unknown> }> {
  if (!parts) return [];

  return parts
    .filter(part => part.functionCall)
    .map(part => ({
      name: part.functionCall.name,
      input: part.functionCall.args || {},
    }));
}

/**
 * Форматирует результаты function для отправки обратно Gemini.
 *
 * @param results - Массив результатов выполнения функций
 * @returns Массив частей functionResponse для Gemini API
 */
export function formatGeminiFunctionResults(
  results: Array<{ name: string; result: unknown; isError?: boolean }>
): any[] {
  return results.map(({ name, result, isError }) => ({
    functionResponse: {
      name,
      response: {
        content: isError ? { error: result } : result,
      },
    },
  }));
}

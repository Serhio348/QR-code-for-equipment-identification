/**
 * claudeToolAdapter.ts
 *
 * Адаптер для работы с tool calling в Claude API.
 * Конвертирует универсальный формат tools в формат Anthropic.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ToolDefinition } from '../types.js';

/**
 * Конвертирует универсальный формат tool в формат Anthropic API.
 *
 * Anthropic использует JSON Schema напрямую в input_schema.
 */
export function convertToClaudeTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

/**
 * Извлекает tool calls из ответа Claude.
 *
 * Конвертирует ToolUseBlock из ответа Claude в унифицированный формат.
 *
 * @param content - Массив блоков контента из ответа Claude
 * @returns Массив вызовов tools с ID, именем и входными параметрами
 */
export function extractClaudeToolCalls(
  content: Anthropic.ContentBlock[]
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  return content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

/**
 * Форматирует результаты tool для отправки обратно Claude.
 *
 * Создаёт массив ToolResultBlockParam в формате, который ожидает Anthropic API.
 *
 * @param results - Массив результатов выполнения tools
 * @returns Массив блоков tool_result для Claude API
 */
export function formatClaudeToolResults(
  results: Array<{ id: string; result: unknown; isError?: boolean }>
): Anthropic.ToolResultBlockParam[] {
  return results.map(({ id, result, isError }) => ({
    type: 'tool_result' as const,
    tool_use_id: id,
    content: JSON.stringify(result),
    is_error: isError,
  }));
}

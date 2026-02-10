import OpenAI from 'openai';
import { ToolDefinition } from '../types.js';

/**
 * Конвертирует ToolDefinition[] в формат OpenAI/DeepSeek function calling.
 */
export function convertToDeepSeekTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

/**
 * Извлекает tool calls из ответа DeepSeek/OpenAI.
 */
export function extractDeepSeekToolCalls(
  message: OpenAI.ChatCompletionMessage
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  if (!message.tool_calls) return [];

  // Фильтруем только стандартные function calls (openai v6 добавил union с CustomToolCall)
  return message.tool_calls
    .filter(tc => tc.type === 'function')
    .map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));
}

/**
 * Форматирует результаты tools для отправки обратно DeepSeek/OpenAI.
 */
export function formatDeepSeekToolResults(
  results: Array<{ id: string; result: unknown; isError?: boolean }>
): OpenAI.ChatCompletionToolMessageParam[] {
  return results.map(({ id, result, isError }) => ({
    role: 'tool' as const,
    tool_call_id: id,
    content: isError
      ? `Ошибка: ${JSON.stringify(result)}`
      : JSON.stringify(result),
  }));
}
/**
 * server.ts
 *
 * Настройка MCP сервера.
 * Регистрирует все инструменты и обработчики.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerEquipmentTools } from './tools/equipmentTools.js';
import { registerDriveTools } from './tools/driveTools.js';
import { registerMaintenanceTools } from './tools/maintenanceTools.js';
import { config } from './config/env.js';

/**
 * Создаёт и настраивает MCP сервер.
 */
export function createServer() {
  // Создаём экземпляр MCP сервера
  const server = new McpServer({
    name: 'google-drive-sheets',
    version: '1.0.0',
  });

  // Регистрируем инструменты
  registerEquipmentTools(server);
  registerDriveTools(server);
  registerMaintenanceTools(server);

  if (config.debug) {
    console.error('📦 Инструменты зарегистрированы');
  }

  // Создаём транспорт для stdio
  const transport = new StdioServerTransport();

  return {
    /**
     * Запускает сервер.
     */
    async start() {
      await server.connect(transport);
    },

    /**
     * Останавливает сервер.
     */
    async stop() {
      await server.close();
    },
  };
}

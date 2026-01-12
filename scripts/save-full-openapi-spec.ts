/**
 * Скрипт для сохранения полной OpenAPI спецификации
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const specUrl = 'https://beliot.by:4443/docs/api-docs.json';
const outputPath = join(projectRoot, 'docs', 'beliot-api-openapi.json');

console.log('📥 Загрузка полной OpenAPI спецификации...');

try {
  const response = await fetch(specUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const spec = await response.json();
  
  if (!spec.openapi && !spec.swagger) {
    throw new Error('Полученный файл не является OpenAPI спецификацией');
  }

  writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
  
  const endpointCount = Object.keys(spec.paths || {}).length;
  console.log(`✅ Спецификация сохранена: ${outputPath}`);
  console.log(`📊 Endpoints: ${endpointCount}`);
} catch (error: any) {
  console.error(`❌ Ошибка: ${error.message}`);
  process.exit(1);
}

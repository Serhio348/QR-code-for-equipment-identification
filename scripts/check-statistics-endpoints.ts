/**
 * Скрипт для проверки наличия endpoints статистики в Beliot API
 * 
 * Проверяет полную OpenAPI спецификацию на наличие endpoints,
 * связанных со статистикой показаний приборов.
 * 
 * Запуск:
 *   npx tsx scripts/check-statistics-endpoints.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Получаем путь к корню проекта
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Загрузить переменные окружения из .env.local файла
 */
function loadEnvFile(): void {
  try {
    const envPath = join(projectRoot, '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }
      
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }
      
      const key = trimmedLine.substring(0, equalIndex).trim();
      let value = trimmedLine.substring(equalIndex + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error: any) {
    // Игнорируем ошибку, если файл не найден
  }
}

loadEnvFile();

const beliotApiBaseUrl = process.env.BELIOT_API_BASE_URL || process.env.VITE_BELIOT_API_BASE_URL || 'https://beliot.by:4443/api';
const beliotLogin = process.env.BELIOT_LOGIN || process.env.VITE_BELIOT_LOGIN;
const beliotPassword = process.env.BELIOT_PASSWORD || process.env.VITE_BELIOT_PASSWORD;

/**
 * Получить токен Beliot API
 */
async function getBeliotToken(): Promise<string | null> {
  if (!beliotLogin || !beliotPassword) {
    console.warn('⚠️ Учетные данные не указаны, пропускаем аутентификацию');
    return null;
  }

  try {
    const response = await fetch(`${beliotApiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: beliotLogin,
        password: beliotPassword,
        personal_data_access: true,
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Ошибка аутентификации: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const token = data?.token || data?.access_token || data?.bearer_token || 
                  data?.data?.token || data?.data?.access_token || data?.data?.bearer_token;

    return token || null;
  } catch (error: any) {
    console.warn(`⚠️ Ошибка получения токена: ${error.message}`);
    return null;
  }
}

/**
 * Получить полную OpenAPI спецификацию
 */
async function getFullOpenApiSpec(): Promise<any | null> {
  const possibleEndpoints = [
    `https://beliot.by:4443/docs/api-docs.json`,
    `${beliotApiBaseUrl.replace('/api', '')}/docs/api-docs.json`,
    `${beliotApiBaseUrl}/swagger.json`,
    `${beliotApiBaseUrl}/openapi.json`,
    `${beliotApiBaseUrl}/api-docs`,
  ];

  for (const endpoint of possibleEndpoints) {
    try {
      console.log(`🔄 Проверяю: ${endpoint}`);
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          if (data.openapi || data.swagger) {
            console.log(`✅ Спецификация найдена: ${endpoint}`);
            return data;
          }
        }
      }
    } catch (error: any) {
      // Продолжаем поиск
    }
  }

  return null;
}

/**
 * Найти endpoints, связанные со статистикой
 */
function findStatisticsEndpoints(spec: any): string[] {
  const statisticsKeywords = [
    'statistic',
    'statistics',
    'report',
    'reports',
    'summary',
    'aggregate',
    'aggregation',
    'analytics',
    'analytics',
    'consumption',
    'consumption',
    'reading',
    'readings',
  ];

  const foundEndpoints: string[] = [];
  const paths = spec.paths || {};

  for (const [path, methods] of Object.entries(paths)) {
    const pathLower = path.toLowerCase();
    const pathMatches = statisticsKeywords.some(keyword => 
      pathLower.includes(keyword)
    );

    if (pathMatches) {
      foundEndpoints.push(path);
      continue;
    }

    // Проверяем описание и теги
    const methodsObj = methods as any;
    for (const [method, details] of Object.entries(methodsObj)) {
      const detailsObj = details as any;
      const summary = (detailsObj.summary || '').toLowerCase();
      const description = (detailsObj.description || '').toLowerCase();
      const tags = (detailsObj.tags || []).map((t: string) => t.toLowerCase());

      const contentMatches = statisticsKeywords.some(keyword =>
        summary.includes(keyword) ||
        description.includes(keyword) ||
        tags.some((tag: string) => tag.includes(keyword))
      );

      if (contentMatches) {
        foundEndpoints.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  return [...new Set(foundEndpoints)];
}

/**
 * Найти endpoints для показаний
 */
function findReadingsEndpoints(spec: any): string[] {
  const readingsKeywords = ['message', 'reading', 'value', 'data', 'metering'];
  const foundEndpoints: string[] = [];
  const paths = spec.paths || {};

  for (const [path, methods] of Object.entries(paths)) {
    const pathLower = path.toLowerCase();
    const pathMatches = readingsKeywords.some(keyword => 
      pathLower.includes(keyword)
    );

    if (pathMatches) {
      foundEndpoints.push(path);
    }
  }

  return [...new Set(foundEndpoints)];
}

/**
 * Основная функция
 */
async function main() {
  console.log('🔍 Поиск endpoints для статистики показаний в Beliot API\n');

  // Пробуем загрузить полную спецификацию
  console.log('📥 Загрузка полной OpenAPI спецификации...');
  const fullSpec = await getFullOpenApiSpec();

  if (!fullSpec) {
    console.log('\n⚠️ Не удалось загрузить полную спецификацию онлайн');
    console.log('📄 Проверяю сохраненную спецификацию...\n');

    // Читаем сохраненную спецификацию
    try {
      const savedSpecPath = join(projectRoot, 'docs', 'beliot-api-openapi.json');
      const savedSpecContent = readFileSync(savedSpecPath, 'utf-8');
      const savedSpec = JSON.parse(savedSpecContent);

      console.log(`✅ Загружена сохраненная спецификация (${Object.keys(savedSpec.paths || {}).length} endpoints)`);
      analyzeSpec(savedSpec);
    } catch (error: any) {
      console.error(`❌ Ошибка чтения сохраненной спецификации: ${error.message}`);
    }
  } else {
    console.log(`✅ Загружена полная спецификация (${Object.keys(fullSpec.paths || {}).length} endpoints)\n`);
    analyzeSpec(fullSpec);

    // Сохраняем полную спецификацию, если она больше сохраненной
    try {
      const savedSpecPath = join(projectRoot, 'docs', 'beliot-api-openapi.json');
      const savedSpecContent = readFileSync(savedSpecPath, 'utf-8');
      const savedSpec = JSON.parse(savedSpecContent);
      
      const savedCount = Object.keys(savedSpec.paths || {}).length;
      const fullCount = Object.keys(fullSpec.paths || {}).length;

      if (fullCount > savedCount) {
        console.log(`\n💾 Обнаружена более полная спецификация (${fullCount} vs ${savedCount} endpoints)`);
        console.log('   Рекомендуется обновить docs/beliot-api-openapi.json');
      }
    } catch (error) {
      // Игнорируем
    }
  }
}

/**
 * Анализ спецификации
 */
function analyzeSpec(spec: any) {
  console.log('\n📊 Анализ спецификации...\n');

  // Ищем endpoints для статистики
  const statisticsEndpoints = findStatisticsEndpoints(spec);
  const readingsEndpoints = findReadingsEndpoints(spec);

  console.log('📈 Endpoints для статистики:');
  if (statisticsEndpoints.length > 0) {
    statisticsEndpoints.forEach(endpoint => {
      console.log(`   ✅ ${endpoint}`);
    });
  } else {
    console.log('   ❌ Не найдено специальных endpoints для статистики');
  }

  console.log('\n📋 Endpoints для показаний:');
  if (readingsEndpoints.length > 0) {
    readingsEndpoints.forEach(endpoint => {
      console.log(`   ✅ ${endpoint}`);
    });
  } else {
    console.log('   ❌ Не найдено');
  }

  // Показываем все endpoints для справки
  const allPaths = Object.keys(spec.paths || {});
  console.log(`\n📝 Всего endpoints в спецификации: ${allPaths.length}`);

  if (allPaths.length > 0 && allPaths.length <= 50) {
    console.log('\n📋 Все доступные endpoints:');
    allPaths.forEach(path => {
      const methods = Object.keys(spec.paths[path] || {});
      methods.forEach(method => {
        const details = spec.paths[path][method];
        const summary = details.summary || details.description || '';
        console.log(`   ${method.toUpperCase().padEnd(6)} ${path} - ${summary}`);
      });
    });
  }

  // Рекомендации
  console.log('\n💡 Рекомендации:');
  if (statisticsEndpoints.length === 0) {
    console.log('   • Специальных endpoints для статистики не найдено');
    console.log('   • Используйте POST /api/device/messages для получения показаний');
    console.log('   • Вычисляйте статистику на стороне клиента из полученных данных');
  } else {
    console.log('   • Найдены специальные endpoints для статистики!');
    console.log('   • Рекомендуется использовать их вместо вычисления на клиенте');
  }
}

// Запуск
main().catch(console.error);

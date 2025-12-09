/**
 * Скрипт для тестирования подключения к Beliot API
 * 
 * Запуск: node scripts/test-beliot-api.js
 */

const https = require('https');
const http = require('http');

const API_BASE = 'beliot.by';
const API_PORT = 4443;
const API_PATH = '/api';

// Отключаем проверку SSL сертификата для тестирования
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const endpoints = [
  '/documentation',
  '/swagger.json',
  '/openapi.json',
  '/api-docs',
  '/v1/swagger.json',
  '/v1/openapi.json',
];

function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      port: API_PORT,
      path: `${API_PATH}${path}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json, application/yaml, */*',
        'User-Agent': 'Beliot-API-Tester/1.0',
      },
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          contentType: res.headers['content-type'],
          data: data.substring(0, 500), // Первые 500 символов
          length: data.length,
        });
      });
    });

    req.on('error', (error) => {
      reject({
        error: error.message,
        code: error.code,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({
        error: 'Request timeout',
      });
    });

    req.end();
  });
}

async function testAllEndpoints() {
  console.log('🔍 Тестирование подключения к Beliot API...\n');
  console.log(`📍 Сервер: ${API_BASE}:${API_PORT}`);
  console.log(`📂 Базовый путь: ${API_PATH}\n`);

  const results = [];

  for (const endpoint of endpoints) {
    const fullPath = `${API_PATH}${endpoint}`;
    console.log(`🔄 Тестирование: ${fullPath}...`);

    try {
      const result = await testEndpoint(endpoint);
      results.push({
        endpoint: fullPath,
        success: true,
        ...result,
      });

      console.log(`   ✅ Статус: ${result.status}`);
      console.log(`   📄 Content-Type: ${result.contentType || 'N/A'}`);
      console.log(`   📏 Размер: ${result.length} байт`);

      // Проверяем, является ли это JSON
      if (result.contentType?.includes('application/json')) {
        try {
          const json = JSON.parse(result.data);
          console.log(`   📋 JSON валиден`);
          if (json.openapi || json.swagger) {
            console.log(`   🎯 Это OpenAPI/Swagger спецификация!`);
            console.log(`   📌 Версия: ${json.openapi || json.swagger}`);
            if (json.info) {
              console.log(`   📝 Название: ${json.info.title || 'N/A'}`);
              console.log(`   🔢 Версия API: ${json.info.version || 'N/A'}`);
            }
          }
        } catch (e) {
          console.log(`   ⚠️ Не удалось распарсить JSON`);
        }
      }

      console.log('');
    } catch (error) {
      results.push({
        endpoint: fullPath,
        success: false,
        error: error.error || error.message,
        code: error.code,
      });

      console.log(`   ❌ Ошибка: ${error.error || error.message}`);
      if (error.code) {
        console.log(`   🔢 Код: ${error.code}`);
      }
      console.log('');
    }
  }

  // Сводка
  console.log('\n📊 Сводка результатов:');
  console.log('═'.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Успешных: ${successful.length}`);
  console.log(`❌ Неудачных: ${failed.length}\n`);

  if (successful.length > 0) {
    console.log('✅ Доступные endpoints:');
    successful.forEach(r => {
      console.log(`   - ${r.endpoint} (${r.status})`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ Недоступные endpoints:');
    failed.forEach(r => {
      console.log(`   - ${r.endpoint}: ${r.error}`);
    });
  }

  return results;
}

// Запуск тестирования
testAllEndpoints()
  .then(() => {
    console.log('\n✅ Тестирование завершено');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Критическая ошибка:', error);
    process.exit(1);
  });


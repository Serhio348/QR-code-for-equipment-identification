const https = require('https');

const API_BASE_URL = 'https://beliot.by:4443/api';
const LOGIN = 'energo@brestvodka.by';
const PASSWORD = 'wSjzy2WJxnj5DPk!';

let authToken = null;

// Функция для выполнения HTTPS запросов
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 4443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      rejectUnauthorized: false, // Для самоподписанных сертификатов
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Авторизация
async function login() {
  console.log('🔐 Авторизация...');
  
  const response = await makeRequest(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    body: {
      email: LOGIN,
      password: PASSWORD,
    },
  });

  if (response.status === 200 && response.data && response.data.data) {
    authToken = response.data.data.access_token || response.data.data.token;
    if (authToken) {
      console.log('✅ Авторизация успешна');
      console.log('🔑 Токен:', authToken.substring(0, 20) + '...');
      return authToken;
    }
  }
  throw new Error(`Ошибка авторизации: ${JSON.stringify(response.data)}`);
}

// Получение атрибутов устройства за период
async function getDeviceAttributes(deviceId, startDate, endDate) {
  console.log(`\n📊 Получение атрибутов устройства ${deviceId} за период ${startDate} - ${endDate}...`);
  
  // Преобразуем даты в Unix timestamp
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
  
  console.log(`📅 Timestamps: ${startTimestamp} - ${endTimestamp}`);
  
  const response = await makeRequest(`${API_BASE_URL}/device/attributes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
    body: {
      device_id: deviceId,
      startDate: startTimestamp,
      stopDate: endTimestamp,
    },
  });

  console.log(`\n📤 Запрос: POST ${API_BASE_URL}/device/attributes`);
  console.log(`📥 Статус ответа: ${response.status}`);
  
  if (response.status === 200) {
    console.log('\n✅ Данные получены:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Анализируем структуру данных
    if (response.data.device_attributes_values) {
      console.log('\n📋 Структура device_attributes_values:');
      console.log(`   Тип: ${Array.isArray(response.data.device_attributes_values) ? 'массив' : typeof response.data.device_attributes_values}`);
      console.log(`   Длина: ${Array.isArray(response.data.device_attributes_values) ? response.data.device_attributes_values.length : 'N/A'}`);
      
      if (Array.isArray(response.data.device_attributes_values) && response.data.device_attributes_values.length > 0) {
        console.log('\n📊 Первый элемент:');
        console.log(JSON.stringify(response.data.device_attributes_values[0], null, 2));
        
        // Ищем показания счетчика
        console.log('\n🔍 Поиск показаний счетчика...');
        response.data.device_attributes_values.forEach((group, idx) => {
          if (group.values && Array.isArray(group.values)) {
            console.log(`\n   Группа ${idx}: найдено ${group.values.length} значений`);
            if (group.values.length > 0) {
              console.log(`   Первое значение:`, JSON.stringify(group.values[0], null, 2));
            }
          } else if (Array.isArray(group)) {
            console.log(`\n   Группа ${idx}: это массив, длина ${group.length}`);
            if (group.length > 0) {
              console.log(`   Первый элемент:`, JSON.stringify(group[0], null, 2));
            }
          } else {
            console.log(`\n   Группа ${idx}:`, JSON.stringify(group, null, 2));
          }
        });
      }
    }
    
    return response.data;
  } else {
    throw new Error(`Ошибка получения атрибутов: ${JSON.stringify(response.data)}`);
  }
}

// Основная функция
async function main() {
  try {
    await login();
    
    const deviceId = '11018';
    const startDate = '2025-12-01';
    const endDate = '2025-12-08';
    
    await getDeviceAttributes(deviceId, startDate, endDate);
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  }
}

main();


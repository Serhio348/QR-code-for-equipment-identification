/**
 * Скрипт для тестирования получения устройств через Beliot API
 * 
 * Запуск: node scripts/test-beliot-devices.cjs
 */

const https = require('https');

const API_BASE = 'beliot.by';
const API_PORT = 4443;
const API_BASE_URL = `https://${API_BASE}:${API_PORT}/api`;

// Учетные данные
const LOGIN = 'energo@brestvodka.by';
const PASSWORD = 'wSjzy2WJxnj5DPk!';

// Отключаем проверку SSL сертификата для тестирования
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function makeRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      port: API_PORT,
      path: `${API_BASE_URL.replace(`https://${API_BASE}:${API_PORT}`, '')}${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data,
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testAuthentication() {
  console.log('🔐 Тестирование аутентификации...');
  console.log(`   Логин: ${LOGIN}`);
  
  try {
    const response = await makeRequest('/auth/login', 'POST', {
      email: LOGIN,
      password: PASSWORD,
      personal_data_access: true,
    });

    if (response.status === 200) {
      console.log('   ✅ Аутентификация успешна');
      
      // Извлекаем токен
      let token = response.data?.token || 
                  response.data?.access_token || 
                  response.data?.bearer_token ||
                  response.data?.data?.token ||
                  response.data?.data?.access_token;
      
      if (token) {
        console.log(`   📝 Токен получен: ${token.substring(0, 20)}...`);
        return token;
      } else {
        console.log('   ⚠️ Токен не найден в ответе');
        console.log('   📄 Ответ:', JSON.stringify(response.data, null, 2).substring(0, 500));
        return null;
      }
    } else {
      console.log(`   ❌ Ошибка аутентификации: ${response.status}`);
      console.log('   📄 Ответ:', JSON.stringify(response.data, null, 2).substring(0, 500));
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Ошибка: ${error.message}`);
    return null;
  }
}

async function testGetDevices(token) {
  console.log('\n📋 Тестирование получения устройств...');
  
  if (!token) {
    console.log('   ⚠️ Токен не получен, пропускаем тест');
    return;
  }

  try {
    const response = await makeRequest('/device/metering_devices', 'POST', {
      is_deleted: false,
      // Можно добавить другие параметры фильтрации
    }, {
      'Authorization': `Bearer ${token}`,
    });

    if (response.status === 200) {
      console.log('   ✅ Запрос успешен');
      
      // Детальная диагностика структуры ответа
      console.log('   🔍 Структура ответа:');
      console.log('      - response.data:', typeof response.data);
      console.log('      - response.data keys:', response.data ? Object.keys(response.data) : 'N/A');
      if (response.data?.metering_devices) {
        console.log('      - metering_devices keys:', Object.keys(response.data.metering_devices));
        console.log('      - metering_devices.data type:', typeof response.data.metering_devices.data);
        console.log('      - metering_devices.data isArray:', Array.isArray(response.data.metering_devices.data));
        if (Array.isArray(response.data.metering_devices.data)) {
          console.log('      - metering_devices.data length:', response.data.metering_devices.data.length);
        }
      }
      
      // Проверяем формат ответа
      let devices = [];
      
      // Формат: { data: { data: { metering_devices: { data: [...] } } } }
      if (response.data?.data?.metering_devices?.data && Array.isArray(response.data.data.metering_devices.data)) {
        devices = response.data.data.metering_devices.data;
        console.log('   ✅ Использован формат: data.data.metering_devices.data');
      } else if (response.data?.metering_devices?.data && Array.isArray(response.data.metering_devices.data)) {
        devices = response.data.metering_devices.data;
        console.log('   ✅ Использован формат: data.metering_devices.data');
      } else if (Array.isArray(response.data)) {
        devices = response.data;
        console.log('   ✅ Использован формат: прямой массив');
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        devices = response.data.data;
        console.log('   ✅ Использован формат: data.data');
      } else if (response.data?.devices && Array.isArray(response.data.devices)) {
        devices = response.data.devices;
        console.log('   ✅ Использован формат: data.devices');
      } else if (response.data?.devices_list && Array.isArray(response.data.devices_list)) {
        devices = response.data.devices_list;
        console.log('   ✅ Использован формат: data.devices_list');
      }
      
      console.log(`   📊 Найдено устройств: ${devices.length}`);
      
      if (devices.length > 0) {
        console.log('\n   📋 Первые устройства:');
        devices.slice(0, 5).forEach((device, index) => {
          const deviceId = device.device_id || device.id || device._id || 'N/A';
          const name = device.name || 'Без имени';
          const status = device.status || 'N/A';
          const isActive = device.is_active !== undefined ? device.is_active : 'N/A';
          
          console.log(`   ${index + 1}. ${name} (ID: ${deviceId})`);
          console.log(`      Статус: ${status}, Активно: ${isActive}`);
        });
        
        if (devices.length > 5) {
          console.log(`   ... и еще ${devices.length - 5} устройств`);
        }
      } else {
        console.log('   ⚠️ Устройства не найдены');
        console.log('   📄 Ответ:', JSON.stringify(response.data, null, 2).substring(0, 500));
      }
    } else {
      console.log(`   ❌ Ошибка запроса: ${response.status}`);
      console.log('   📄 Ответ:', JSON.stringify(response.data, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.log(`   ❌ Ошибка: ${error.message}`);
  }
}

async function testGetAbonentData(token) {
  console.log('\n👤 Тестирование получения данных абонента...');
  
  if (!token) {
    console.log('   ⚠️ Токен не получен, пропускаем тест');
    return;
  }

  try {
    const response = await makeRequest('/abonent/main/data', 'POST', {}, {
      'Authorization': `Bearer ${token}`,
    });

    if (response.status === 200) {
      console.log('   ✅ Запрос успешен');
      
      const data = response.data?.data || response.data;
      
      if (data?.devices_list) {
        console.log(`   📊 Устройств в списке: ${data.devices_list.length || 0}`);
      }
      
      if (data?.accounting_points_list) {
        console.log(`   📊 Точек учета: ${data.accounting_points_list.length || 0}`);
      }
      
      if (data?.suppliers_list) {
        console.log(`   📊 Поставщиков: ${data.suppliers_list.length || 0}`);
      }
      
      console.log('   📄 Структура данных:', Object.keys(data || {}).join(', '));
    } else {
      console.log(`   ❌ Ошибка запроса: ${response.status}`);
      console.log('   📄 Ответ:', JSON.stringify(response.data, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.log(`   ❌ Ошибка: ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 Тестирование Beliot Device API\n');
  console.log('═'.repeat(60));
  
  // Тест 1: Аутентификация
  const token = await testAuthentication();
  
  // Тест 2: Получение устройств
  await testGetDevices(token);
  
  // Тест 3: Получение данных абонента
  await testGetAbonentData(token);
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Тестирование завершено');
}

// Запуск тестов
runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Критическая ошибка:', error);
    process.exit(1);
  });


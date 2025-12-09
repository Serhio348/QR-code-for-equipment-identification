/**
 * Скрипт для поиска устройства с ID 10596 и проверки tied_point.place
 * 
 * Запуск: node scripts/find-device-10596.cjs
 */

const https = require('https');

const API_BASE = 'beliot.by';
const API_PORT = 4443;
const API_BASE_URL = `https://${API_BASE}:${API_PORT}/api`;

// Учетные данные
const LOGIN = 'energo@brestvodka.by';
const PASSWORD = 'wSjzy2WJxnj5DPk!';
const TARGET_DEVICE_ID = 11078;

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
      timeout: 30000,
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

async function authenticate() {
  console.log('🔐 Аутентификация...');
  
  try {
    const response = await makeRequest('/auth/login', 'POST', {
      email: LOGIN,
      password: PASSWORD,
      personal_data_access: true,
    });

    if (response.status === 200) {
      let token = response.data?.token || 
                  response.data?.access_token || 
                  response.data?.bearer_token ||
                  response.data?.data?.token ||
                  response.data?.data?.access_token;
      
      if (token) {
        console.log('✅ Токен получен\n');
        return token;
      }
    }
    
    throw new Error('Не удалось получить токен');
  } catch (error) {
    console.error('❌ Ошибка аутентификации:', error.message);
    throw error;
  }
}

async function findDeviceById(token, deviceId) {
  console.log(`🔍 Поиск устройства с ID: ${deviceId}...`);
  
  try {
    // Сначала пробуем получить устройство напрямую по ID
    console.log('   Попытка 1: Получение устройства напрямую по ID...');
    try {
      const directResponse = await makeRequest(`/device/metering_device/${deviceId}`, 'GET', null, {
        'Authorization': `Bearer ${token}`,
      });
      
      if (directResponse.status === 200 && directResponse.data) {
        console.log('   📋 Структура ответа:');
        console.log('      - directResponse.data keys:', Object.keys(directResponse.data || {}));
        console.log('      - directResponse.data.data keys:', directResponse.data?.data ? Object.keys(directResponse.data.data) : 'N/A');
        console.log('      - directResponse.data.metering_device keys:', directResponse.data?.metering_device ? Object.keys(directResponse.data.metering_device) : 'N/A');
        console.log('      - directResponse.data.tied_point:', directResponse.data?.tied_point ? 'ЕСТЬ' : 'НЕТ');
        
        // Проверяем разные варианты структуры
        let device = null;
        
        // Вариант 1: { data: { metering_device: {...}, tied_point: {...} } }
        if (directResponse.data?.metering_device) {
          device = directResponse.data.metering_device;
          // Если tied_point на уровне data, а не внутри metering_device
          if (directResponse.data.tied_point && !device.tied_point) {
            device.tied_point = directResponse.data.tied_point;
            console.log('   ✅ tied_point найден на уровне data, добавлен к устройству');
          }
        } else if (directResponse.data?.data) {
          device = directResponse.data.data;
        } else {
          device = directResponse.data;
        }
        
        if (device) {
          console.log('   ✅ Устройство получено напрямую\n');
          return await displayDeviceInfo(device, deviceId);
        }
      }
    } catch (directError) {
      console.log(`   ⚠️ Прямое получение не удалось: ${directError.message}`);
    }
    
    // Пробуем получить все устройства и найти нужное
    console.log('   Попытка 2: Поиск среди всех устройств...');
    const response = await makeRequest('/device/metering_devices', 'POST', {
      is_deleted: false,
    }, {
      'Authorization': `Bearer ${token}`,
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }

    // Извлекаем устройства из различных форматов ответа
    let devices = [];
    
    if (response.data?.data?.metering_devices?.data && Array.isArray(response.data.data.metering_devices.data)) {
      devices = response.data.data.metering_devices.data;
    } else if (response.data?.metering_devices?.data && Array.isArray(response.data.metering_devices.data)) {
      devices = response.data.metering_devices.data;
    } else if (Array.isArray(response.data)) {
      devices = response.data;
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      devices = response.data.data;
    } else if (response.data?.devices && Array.isArray(response.data.devices)) {
      devices = response.data.devices;
    } else if (response.data?.devices_list && Array.isArray(response.data.devices_list)) {
      devices = response.data.devices_list;
    }

    console.log(`📊 Всего устройств загружено: ${devices.length}\n`);

    // Ищем устройство по ID
    const device = devices.find(d => {
      const id = d.id || d.device_id || d._id;
      return String(id) === String(deviceId);
    });

    if (!device) {
      console.log('❌ Устройство не найдено');
      console.log('\n📋 Доступные ID устройств (первые 20):');
      devices.slice(0, 20).forEach((d, i) => {
        const id = d.id || d.device_id || d._id;
        console.log(`   ${i + 1}. ID: ${id}, Название: ${d.name || 'N/A'}`);
      });
      return null;
    }

    return await displayDeviceInfo(device, deviceId);
  } catch (error) {
    console.error('❌ Ошибка поиска устройства:', error.message);
    throw error;
  }
}

async function displayDeviceInfo(device, deviceId) {
  console.log('✅ Устройство найдено!\n');
  console.log('═'.repeat(60));
  console.log('📋 ИНФОРМАЦИЯ ОБ УСТРОЙСТВЕ:');
  console.log('═'.repeat(60));
  
  console.log(`ID: ${device.id || device.device_id || device._id || 'N/A'}`);
  console.log(`Название: ${device.name || 'N/A'}`);
  console.log(`Статус: ${device.status || 'N/A'}`);
  console.log(`Активно: ${device.is_active !== undefined ? device.is_active : device.active || 'N/A'}`);
  
  console.log('\n📍 TIED_POINT:');
  if (device.tied_point) {
    console.log(JSON.stringify(device.tied_point, null, 2));
    console.log(`\n🎯 tied_point.place = "${device.tied_point.place || 'НЕ ЗАДАН'}"`);
  } else {
    console.log('   ❌ tied_point отсутствует в объекте устройства');
    console.log('\n🔍 Поиск связанных полей...');
    
    // Проверяем другие возможные поля, которые могут содержать информацию о месте
    const possiblePlaceFields = [
      'accounting_point_name',
      'object_name',
      'building_name',
      'location',
      'address',
      'facility_passport',
      'passport',
      'place',
      'tied_place',
    ];
    
    let foundFields = [];
    possiblePlaceFields.forEach(field => {
      if (device[field]) {
        foundFields.push({ field, value: device[field] });
      }
    });
    
    if (foundFields.length > 0) {
      console.log('   Найдены следующие поля:');
      foundFields.forEach(({ field, value }) => {
        console.log(`   - ${field}: "${value}"`);
      });
    } else {
      console.log('   ⚠️ Не найдено полей, связанных с местом');
    }
  }
  
  console.log('\n📄 ПОЛНЫЕ ДАННЫЕ УСТРОЙСТВА:');
  console.log(JSON.stringify(device, null, 2));
  
  console.log('\n🔍 ПОИСК ПОЛЕЙ СЕРИЙНОГО НОМЕРА:');
  const serialNumberFields = [
    'serial_number',
    'serialNumber',
    'serial',
    'sn',
    'factory_number',
    'factoryNumber',
    'manufacture_number',
    'manufactureNumber',
    'device_serial',
    'deviceSerial',
    'model_serial',
    'modelSerial',
  ];
  
  serialNumberFields.forEach(field => {
    if (device[field] !== undefined) {
      console.log(`   ✅ ${field}: "${device[field]}"`);
    }
  });
  
  // Также проверяем вложенные объекты
  if (device.model && typeof device.model === 'object') {
    console.log('\n📦 Данные модели устройства:');
    console.log(JSON.stringify(device.model, null, 2));
    serialNumberFields.forEach(field => {
      if (device.model[field] !== undefined) {
        console.log(`   ✅ model.${field}: "${device.model[field]}"`);
      }
    });
  }
  
  return device;
}

async function main() {
  console.log('🚀 Поиск устройства с ID 10596\n');
  console.log('═'.repeat(60));
  
  try {
    const token = await authenticate();
    await findDeviceById(token, TARGET_DEVICE_ID);
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Поиск завершен');
  } catch (error) {
    console.error('\n❌ Критическая ошибка:', error);
    process.exit(1);
  }
}

main();


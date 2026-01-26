/**
 * Примеры использования Beliot Device API
 * 
 * Демонстрирует различные способы работы с устройствами через Beliot API
 */

import {
  getCompanyDevices,
  getDeviceById,
  getDeviceState,
  getCompanyDevicesStates,
  getAbonentMainData,
  getCompanyDevicesFromAbonent,
  GetCompanyDevicesParams,
} from '../features/water-monitoring/services/beliotDeviceApi';

/**
 * Пример 1: Получить все устройства компании
 */
export async function exampleGetAllDevices() {
  try {
    console.log('📋 Получение всех устройств компании...');
    
    const devices = await getCompanyDevices();
    
    console.log(`✅ Получено устройств: ${devices.length}`);
    devices.forEach((device, index) => {
      console.log(`${index + 1}. ${device.name || 'Без имени'} (ID: ${device.device_id || device.id || device._id})`);
    });
    
    return devices;
  } catch (error: any) {
    console.error('❌ Ошибка получения устройств:', error.message);
    throw error;
  }
}

/**
 * Пример 2: Получить устройства с фильтрацией
 */
export async function exampleGetFilteredDevices() {
  try {
    console.log('🔍 Получение устройств с фильтрацией...');
    
    const params: GetCompanyDevicesParams = {
      is_deleted: false, // Только активные устройства
      device_group_id: '123', // Конкретная группа устройств
      search_string: 'фильтр', // Поиск по имени
      sort_field: 'name',
      sort: 'asc',
    };
    
    const devices = await getCompanyDevices(params);
    
    console.log(`✅ Найдено устройств: ${devices.length}`);
    return devices;
  } catch (error: any) {
    console.error('❌ Ошибка получения устройств:', error.message);
    throw error;
  }
}

/**
 * Пример 3: Получить конкретное устройство по ID
 */
export async function exampleGetDeviceById(deviceId: string) {
  try {
    console.log(`🔍 Получение устройства с ID: ${deviceId}...`);
    
    const device = await getDeviceById(deviceId);
    
    if (device) {
      console.log('✅ Устройство найдено:', {
        id: device.device_id || device.id || device._id,
        name: device.name,
        status: device.status,
        is_active: device.is_active,
      });
    } else {
      console.log('⚠️ Устройство не найдено');
    }
    
    return device;
  } catch (error: any) {
    console.error('❌ Ошибка получения устройства:', error.message);
    throw error;
  }
}

/**
 * Пример 4: Получить состояние устройства
 */
export async function exampleGetDeviceState(deviceId: string) {
  try {
    console.log(`📊 Получение состояния устройства: ${deviceId}...`);
    
    const state = await getDeviceState(deviceId);
    
    console.log('✅ Состояние устройства:', {
      device_id: state.device_id || deviceId,
      status: state.status,
      state: state.state,
      is_active: state.is_active,
    });
    
    return state;
  } catch (error: any) {
    console.error('❌ Ошибка получения состояния:', error.message);
    throw error;
  }
}

/**
 * Пример 5: Получить состояния всех устройств компании
 */
export async function exampleGetAllDevicesStates(companyId?: string) {
  try {
    console.log('📊 Получение состояний всех устройств компании...');
    
    const devicesWithStates = await getCompanyDevicesStates(companyId);
    
    console.log(`✅ Получено состояний: ${devicesWithStates.length}`);
    
    devicesWithStates.forEach(({ device, state }, index) => {
      const deviceId = device.device_id || device.id || device._id;
      console.log(`${index + 1}. ${device.name || 'Без имени'} (${deviceId}):`, {
        status: state?.status || device.status || 'N/A',
        is_active: state?.is_active ?? device.is_active ?? 'N/A',
      });
    });
    
    return devicesWithStates;
  } catch (error: any) {
    console.error('❌ Ошибка получения состояний:', error.message);
    throw error;
  }
}

/**
 * Пример 6: Получить данные абонента (включая устройства)
 */
export async function exampleGetAbonentData() {
  try {
    console.log('👤 Получение данных абонента...');
    
    const abonentData = await getAbonentMainData();
    
    console.log('✅ Данные абонента получены:', {
      has_devices: !!abonentData?.data?.devices_list,
      devices_count: abonentData?.data?.devices_list?.length || 0,
      has_accounting_points: !!abonentData?.data?.accounting_points_list,
      has_suppliers: !!abonentData?.data?.suppliers_list,
    });
    
    return abonentData;
  } catch (error: any) {
    console.error('❌ Ошибка получения данных абонента:', error.message);
    throw error;
  }
}

/**
 * Пример 7: Получить устройства из данных абонента
 */
export async function exampleGetDevicesFromAbonent() {
  try {
    console.log('📋 Получение устройств из данных абонента...');
    
    const devices = await getCompanyDevicesFromAbonent();
    
    console.log(`✅ Получено устройств: ${devices.length}`);
    return devices;
  } catch (error: any) {
    console.error('❌ Ошибка получения устройств:', error.message);
    throw error;
  }
}

/**
 * Пример 8: Комплексный пример - получить все устройства с их состояниями
 */
export async function exampleGetAllDevicesWithStates() {
  try {
    console.log('🚀 Комплексный пример: получение всех устройств с состояниями...');
    
    // Шаг 1: Получить все устройства
    const devices = await getCompanyDevices({
      is_deleted: false, // Только активные
    });
    
    console.log(`📋 Найдено устройств: ${devices.length}`);
    
    // Шаг 2: Получить состояние для каждого устройства
    const devicesWithStates = await Promise.all(
      devices.map(async (device) => {
        const deviceId = device.device_id || device.id || device._id;
        if (!deviceId) {
          return { device, state: null, error: 'Нет ID устройства' };
        }
        
        try {
          const state = await getDeviceState(deviceId.toString());
          return { device, state, error: null };
        } catch (error: any) {
          console.warn(`⚠️ Не удалось получить состояние для ${deviceId}:`, error.message);
          return { device, state: null, error: error.message };
        }
      })
    );
    
    // Шаг 3: Вывести результаты
    console.log('\n📊 Результаты:');
    devicesWithStates.forEach(({ device, state, error }, index) => {
      const deviceId = device.device_id || device.id || device._id;
      console.log(`${index + 1}. ${device.name || 'Без имени'} (${deviceId}):`);
      if (error) {
        console.log(`   ❌ Ошибка: ${error}`);
      } else if (state) {
        console.log(`   ✅ Статус: ${state.status || 'N/A'}, Активно: ${state.is_active ?? 'N/A'}`);
      } else {
        console.log(`   ⚠️ Состояние не получено`);
      }
    });
    
    return devicesWithStates;
  } catch (error: any) {
    console.error('❌ Ошибка комплексного примера:', error.message);
    throw error;
  }
}

// Экспорт всех примеров для использования
export const examples = {
  getAllDevices: exampleGetAllDevices,
  getFilteredDevices: exampleGetFilteredDevices,
  getDeviceById: exampleGetDeviceById,
  getDeviceState: exampleGetDeviceState,
  getAllDevicesStates: exampleGetAllDevicesStates,
  getAbonentData: exampleGetAbonentData,
  getDevicesFromAbonent: exampleGetDevicesFromAbonent,
  getAllDevicesWithStates: exampleGetAllDevicesWithStates,
};


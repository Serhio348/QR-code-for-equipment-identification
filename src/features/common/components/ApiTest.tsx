/**
 * Компонент для тестирования API
 * Временный компонент для проверки работы API с базой данных оборудования
 */

import React, { useState } from 'react';
import { 
  getAllEquipment, 
  getEquipmentById, 
  getEquipmentByType,
  addEquipment,
  updateEquipment,
  deleteEquipment
} from '../../equipment/services/equipmentApi';
import { Equipment } from '../../equipment/types/equipment';
import { API_CONFIG } from '@/shared/config/api';
import './ApiTest.css';

const ApiTest: React.FC = () => {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);

  // Тестовые данные для добавления
  const testEquipment: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'Тестовый фильтр',
    type: 'filter',
    specs: {
      height: '1,5 м',
      diameter: '0,8 м',
      capacity: '5 м³',
      filtrationArea: '0,5 м²',
      filtrationSpeed: '10 м/ч',
      fillingMaterial: 'Nevtraco 1,0-2,5 мм',
      fillingVolume: '350 л'
    },
    googleDriveUrl: 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon',
    qrCodeUrl: 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon',
    status: 'active'
  };

  const handleTest = async (testName: string, testFn: () => Promise<any>) => {
    setLoading(true);
    setResult(`Тестирование: ${testName}...\n`);
    
    try {
      const startTime = Date.now();
      const data = await testFn();
      const duration = Date.now() - startTime;
      
      setResult(prev => prev + `✅ Успешно! (${duration}мс)\n`);
      setResult(prev => prev + `Результат: ${JSON.stringify(data, null, 2)}\n\n`);
      
      return data;
    } catch (error: any) {
      let errorMessage = error.message;
      
      // Детальная информация об ошибке
      if (error.message.includes('Failed to fetch') || error.message.includes('fetch')) {
        errorMessage = `❌ Ошибка подключения к API\n\n` +
          `Возможные причины:\n` +
          `1. API не развернут как веб-приложение\n` +
          `2. Неправильный URL в src/config/api.ts\n` +
          `3. Проблемы с CORS (нужно настроить в Google Apps Script)\n` +
          `4. Нет доступа к интернету\n\n` +
          `Проверьте:\n` +
          `- Откройте backend/equipment-db/Code.gs в Google Apps Script\n` +
          `- Разверните как веб-приложение (Развернуть > Новое развертывание)\n` +
          `- Выберите тип: Веб-приложение\n` +
          `- Укажите: "Выполнять от имени: Меня"\n` +
          `- Укажите: "У кого есть доступ: Все"\n` +
          `- Скопируйте URL и вставьте в src/config/api.ts\n\n` +
          `Текущий URL: ${API_CONFIG.EQUIPMENT_API_URL || 'Не настроен'}\n`;
      }
      
      setResult(prev => prev + `${errorMessage}\n\n`);
      console.error('Test error:', error);
    } finally {
      setLoading(false);
    }
  };

  const testGetAll = () => handleTest('Получить все оборудование', async () => {
    const data = await getAllEquipment();
    setEquipmentList(data);
    return { count: data.length, items: data };
  });

  const testGetById = () => {
    if (equipmentList.length === 0) {
      setResult('Сначала выполните "Получить все оборудование"\n');
      return;
    }
    const firstId = equipmentList[0].id;
    handleTest(`Получить по ID (${firstId})`, () => getEquipmentById(firstId));
  };

  const testGetByType = () => handleTest('Получить фильтры', () => 
    getEquipmentByType('filter')
  );

  const testAdd = () => handleTest('Добавить оборудование', () => 
    addEquipment(testEquipment)
  );

  const testUpdate = () => {
    if (equipmentList.length === 0) {
      setResult('Сначала выполните "Получить все оборудование"\n');
      return;
    }
    const firstId = equipmentList[0].id;
    handleTest(`Обновить оборудование (${firstId})`, () => 
      updateEquipment(firstId, { 
        name: 'Обновленное название ' + new Date().toLocaleTimeString() 
      })
    );
  };

  const testDelete = () => {
    if (equipmentList.length === 0) {
      setResult('Сначала выполните "Получить все оборудование"\n');
      return;
    }
    const firstId = equipmentList[0].id;
    if (!confirm(`Удалить оборудование с ID: ${firstId}?`)) {
      return;
    }
    handleTest(`Удалить оборудование (${firstId})`, () => 
      deleteEquipment(firstId)
    );
  };

  return (
    <div className="api-test">
      <h2>Тестирование API базы данных оборудования</h2>
      
      <div className="api-info">
        <p><strong>URL API:</strong> {API_CONFIG.EQUIPMENT_API_URL || 'Не настроен'}</p>
        {!API_CONFIG.EQUIPMENT_API_URL && (
          <p className="warning">
            ⚠️ URL не настроен! Установите EQUIPMENT_API_URL в src/config/api.ts
          </p>
        )}
      </div>
      
      <div className="test-buttons">
        <button onClick={testGetAll} disabled={loading}>
          Получить все оборудование
        </button>
        <button onClick={testGetById} disabled={loading || equipmentList.length === 0}>
          Получить по ID
        </button>
        <button onClick={testGetByType} disabled={loading}>
          Получить фильтры
        </button>
        <button onClick={testAdd} disabled={loading}>
          Добавить оборудование
        </button>
        <button onClick={testUpdate} disabled={loading || equipmentList.length === 0}>
          Обновить оборудование
        </button>
        <button onClick={testDelete} disabled={loading || equipmentList.length === 0}>
          Удалить оборудование
        </button>
        <button onClick={() => { setResult(''); setEquipmentList([]); }} disabled={loading}>
          Очистить
        </button>
      </div>

      {equipmentList.length > 0 && (
        <div className="equipment-list">
          <h3>Найдено оборудования: {equipmentList.length}</h3>
          <ul>
            {equipmentList.map(eq => (
              <li key={eq.id}>
                <strong>{eq.name}</strong> ({eq.type}) - {eq.status}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="test-result">
        <h3>Результаты тестирования:</h3>
        <pre>{result || 'Нажмите кнопку для начала тестирования'}</pre>
      </div>
    </div>
  );
};

export default ApiTest;


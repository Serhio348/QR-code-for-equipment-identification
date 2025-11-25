/**
 * POST запросы (мутации) для работы с оборудованием
 * 
 * Функции для создания, обновления и удаления оборудования
 */

import { Equipment } from '../../types/equipment';
import { apiRequest } from './apiRequest';
import { isCorsError, sendNoCorsRequest, waitForEquipmentUpdate, waitForEquipmentDeletion } from './corsFallback';
import { getAllEquipment, getEquipmentById } from './equipmentQueries';
import { API_CONFIG } from '../../config/api';

/**
 * Добавить новое оборудование
 * 
 * Создает новую запись оборудования в базе данных
 * Автоматически генерирует ID и временные метки
 * 
 * @param {Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>} equipment - Данные нового оборудования
 * @returns {Promise<Equipment>} Созданный объект Equipment с присвоенным ID
 * 
 * @throws {Error} При ошибке валидации, сети или API
 */
export async function addEquipment(
  equipment: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Equipment> {
  // Валидация обязательных полей
  if (!equipment.name) {
    throw new Error('Название оборудования обязательно');
  }
  if (!equipment.type) {
    throw new Error('Тип оборудования обязателен');
  }

  try {
    console.log('📤 Отправка данных оборудования:', {
      name: equipment.name,
      type: equipment.type,
      status: equipment.status,
      hasSpecs: !!equipment.specs,
      googleDriveUrl: equipment.googleDriveUrl || 'не указан',
      qrCodeUrl: equipment.qrCodeUrl || 'не указан'
    });
    
    const response = await apiRequest<Equipment>('add', 'POST', equipment);
    
    if (!response.data) {
      throw new Error('Ошибка при добавлении оборудования: данные не получены');
    }

    return response.data;
  } catch (error: any) {
    if (isCorsError(error)) {
      const postBody = {
        action: 'add',
        ...equipment
      };
      
      console.log('📤 Отправка через no-cors fallback:', {
        action: postBody.action,
        name: postBody.name,
        type: postBody.type
      });
      
      try {
        await sendNoCorsRequest('add', equipment);
        
        // Ждем и ищем добавленное оборудование
        let added: Equipment | undefined;
        const maxAttempts = 3;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          
          const allEquipment = await getAllEquipment();
          added = allEquipment.find(eq => 
            eq.name === equipment.name && 
            eq.type === equipment.type &&
            eq.status === equipment.status
          );
          
          if (added) {
            return added;
          }
        }
        
        throw new Error('Оборудование не найдено после добавления, но запрос был отправлен');
      } catch (fallbackError: any) {
        throw new Error(`Ошибка при добавлении оборудования: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}

/**
 * Обновить оборудование
 * 
 * Обновляет существующее оборудование в базе данных
 * Обновляет только переданные поля, остальные остаются без изменений
 * 
 * @param {string} id - UUID оборудования для обновления
 * @param {Partial<Equipment>} updates - Объект с полями для обновления
 * @returns {Promise<Equipment>} Обновленный объект Equipment
 * 
 * @throws {Error} Если оборудование не найдено или произошла ошибка
 */
export async function updateEquipment(
  id: string,
  updates: Partial<Equipment>
): Promise<Equipment> {
  if (!id) {
    throw new Error('ID не указан');
  }

  try {
    const response = await apiRequest<Equipment>('update', 'POST', {
      id,
      ...updates,
    });

    if (!response.data) {
      throw new Error('Ошибка при обновлении оборудования: данные не получены');
    }

    return response.data;
  } catch (error: any) {
    if (isCorsError(error)) {
      // Нормализуем даты перед отправкой
      const normalizedUpdates = { ...updates };
      if (normalizedUpdates.commissioningDate) {
        const dateStr = String(normalizedUpdates.commissioningDate).split('T')[0].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          normalizedUpdates.commissioningDate = dateStr;
        } else {
          console.warn('⚠️ Неверный формат даты commissioningDate:', normalizedUpdates.commissioningDate);
        }
      }
      if (normalizedUpdates.lastMaintenanceDate) {
        const dateStr = String(normalizedUpdates.lastMaintenanceDate).split('T')[0].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          normalizedUpdates.lastMaintenanceDate = dateStr;
        } else {
          console.warn('⚠️ Неверный формат даты lastMaintenanceDate:', normalizedUpdates.lastMaintenanceDate);
        }
      }
      
      console.log('📤 Отправка update через no-cors fallback:', {
        id,
        updates: normalizedUpdates
      });
      
      try {
        await sendNoCorsRequest('update', { id, ...normalizedUpdates });
        
        // Ждем и получаем обновленное оборудование
        const updated = await waitForEquipmentUpdate(id, 5, 1500);
        if (updated) {
          console.log('✅ Оборудование обновлено:', {
            id: updated.id,
            name: updated.name,
            commissioningDate: updated.commissioningDate,
            lastMaintenanceDate: updated.lastMaintenanceDate
          });
          return updated;
        }
        
        throw new Error('Оборудование не найдено после обновления');
      } catch (fallbackError: any) {
        throw new Error(`Ошибка при обновлении оборудования: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}

/**
 * Удалить оборудование (физическое удаление)
 * 
 * Выполняет физическое удаление оборудования из базы данных
 * и удаляет связанную папку в Google Drive (если она была создана)
 * 
 * ⚠️ ВНИМАНИЕ: Это действие необратимо!
 * 
 * @param {string} id - UUID оборудования для удаления
 * @returns {Promise<void>}
 * 
 * @throws {Error} Если оборудование не найдено или произошла ошибка
 */
export async function deleteEquipment(id: string): Promise<void> {
  if (!id) {
    throw new Error('ID не указан');
  }

  try {
    await apiRequest('delete', 'POST', { id });
  } catch (error: any) {
    if (isCorsError(error)) {
      console.log('📤 Отправка запроса на удаление через no-cors fallback');
      
      try {
        await sendNoCorsRequest('delete', { id });
        
        // Ждем и проверяем удаление
        const deleted = await waitForEquipmentDeletion(id, 8, 1500);
        if (deleted) {
          console.log('✅ Оборудование успешно удалено');
          return;
        }
        
        // Если оборудование все еще существует, но запрос был отправлен
        console.warn('⚠️ Запрос на удаление был отправлен, но подтверждение не получено. Проверьте логи в Google Apps Script.');
        return;
      } catch (fallbackError: any) {
        throw new Error(`Ошибка при удалении оборудования: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}


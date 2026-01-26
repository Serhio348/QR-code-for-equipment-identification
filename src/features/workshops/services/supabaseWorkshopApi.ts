/**
 * supabaseWorkshopApi.ts
 * 
 * API функции для управления участками (workshops) через Supabase
 * Заменяет старый workshopApi.ts (Google Apps Script)
 */

import { supabase } from '../../../shared/config/supabase';

export interface Workshop {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopInput {
  name: string;
  description?: string;
}

/**
 * Форматирует название участка с заглавной буквы
 * 
 * Делает первую букву заглавной, если она еще не заглавная.
 * Сохраняет остальные символы без изменений (включая аббревиатуры).
 * 
 * @param name - Название участка
 * @returns Отформатированное название
 */
function formatWorkshopName(name: string): string {
  if (!name || name.trim().length === 0) {
    return name;
  }
  
  const trimmed = name.trim();
  const firstChar = trimmed[0];
  
  // Если первая буква уже заглавная, оставляем как есть
  if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return trimmed;
  }
  
  // Делаем первую букву заглавной, остальные оставляем без изменений
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Получить все участки
 * 
 * @returns Promise с массивом участков
 */
export async function getAllWorkshops(): Promise<Workshop[]> {
  try {
    console.debug('[supabaseWorkshopApi] Начало getAllWorkshops');
    
    // Проверяем, что пользователь авторизован
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('[supabaseWorkshopApi] Пользователь не авторизован');
      // Возвращаем пустой массив, если не авторизован (RLS заблокирует запрос)
      return [];
    }
    
    console.debug('[supabaseWorkshopApi] Пользователь авторизован, выполняем запрос');
    
    const { data, error } = await supabase
      .from('workshops')
      .select('id, name, description, created_at, updated_at')
      .order('name', { ascending: true });

    if (error) {
      console.error('[supabaseWorkshopApi] Ошибка getAllWorkshops:', error);
      console.error('[supabaseWorkshopApi] Детали ошибки:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      
      // Если таблица не существует, возвращаем пустой массив
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[supabaseWorkshopApi] Таблица workshops не существует. Выполните миграцию create-workshops-table.sql');
        return [];
      }
      
      throw new Error(error.message || 'Ошибка при получении участков');
    }

    console.debug('[supabaseWorkshopApi] Получено участков:', data?.length || 0);
    console.debug('[supabaseWorkshopApi] Сырые данные:', data);

    if (!data || data.length === 0) {
      console.debug('[supabaseWorkshopApi] Данные отсутствуют или пустой массив');
      return [];
    }

    // Преобразуем данные из Supabase в формат Workshop
    // Форматируем названия с заглавной буквы
    const workshops = data.map((item: any) => {
      const workshop = {
        id: item.id,
        name: formatWorkshopName(item.name || ''),
        description: item.description || undefined,
        createdAt: item.created_at || new Date().toISOString(),
        updatedAt: item.updated_at || new Date().toISOString(),
      };
      console.debug('[supabaseWorkshopApi] Обработан участок:', workshop);
      return workshop;
    });
    
    console.debug('[supabaseWorkshopApi] Успешно возвращено участков:', workshops.length);
    return workshops;
  } catch (error: any) {
    console.error('[supabaseWorkshopApi] Исключение в getAllWorkshops:', error);
    throw error;
  }
}

/**
 * Получить участок по ID
 * 
 * @param id - ID участка
 * @returns Promise с данными участка
 */
export async function getWorkshopById(id: string): Promise<Workshop> {
  try {
    const { data, error } = await supabase
      .from('workshops')
      .select('id, name, description, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[supabaseWorkshopApi] Ошибка getWorkshopById:', error);
      throw new Error(error.message || 'Ошибка при получении участка');
    }

    if (!data) {
      throw new Error('Участок не найден');
    }

    return {
      id: data.id,
      name: formatWorkshopName(data.name),
      description: data.description || undefined,
      createdAt: data.created_at || new Date().toISOString(),
      updatedAt: data.updated_at || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[supabaseWorkshopApi] Ошибка getWorkshopById:', error);
    throw error;
  }
}

/**
 * Создать новый участок
 * 
 * @param input - Данные для создания участка
 * @returns Promise с данными созданного участка
 */
export async function addWorkshop(input: WorkshopInput): Promise<Workshop> {
  try {
    // Форматируем название с заглавной буквы перед сохранением
    const formattedName = formatWorkshopName(input.name.trim());
    
    const { data, error } = await supabase
      .from('workshops')
      .insert({
        name: formattedName,
        description: input.description?.trim() || null,
      })
      .select('id, name, description, created_at, updated_at')
      .single();

    if (error) {
      console.error('[supabaseWorkshopApi] Ошибка addWorkshop:', error);
      
      // Обработка ошибки уникальности (дубликат названия)
      if (error.code === '23505') {
        throw new Error('Участок с таким названием уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при создании участка');
    }

    if (!data) {
      throw new Error('Не удалось создать участок');
    }

    return {
      id: data.id,
      name: formatWorkshopName(data.name),
      description: data.description || undefined,
      createdAt: data.created_at || new Date().toISOString(),
      updatedAt: data.updated_at || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[supabaseWorkshopApi] Ошибка addWorkshop:', error);
    throw error;
  }
}

/**
 * Обновить участок
 * 
 * @param id - ID участка
 * @param input - Данные для обновления
 * @returns Promise с обновленными данными участка
 */
export async function updateWorkshop(
  id: string,
  input: Partial<WorkshopInput>
): Promise<Workshop> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      // Форматируем название с заглавной буквы перед сохранением
      updateData.name = formatWorkshopName(input.name.trim());
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }

    const { data, error } = await supabase
      .from('workshops')
      .update(updateData)
      .eq('id', id)
      .select('id, name, description, created_at, updated_at')
      .single();

    if (error) {
      console.error('[supabaseWorkshopApi] Ошибка updateWorkshop:', error);
      
      // Обработка ошибки уникальности (дубликат названия)
      if (error.code === '23505') {
        throw new Error('Участок с таким названием уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при обновлении участка');
    }

    if (!data) {
      throw new Error('Участок не найден');
    }

    return {
      id: data.id,
      name: formatWorkshopName(data.name),
      description: data.description || undefined,
      createdAt: data.created_at || new Date().toISOString(),
      updatedAt: data.updated_at || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[supabaseWorkshopApi] Ошибка updateWorkshop:', error);
    throw error;
  }
}

/**
 * Удалить участок
 * 
 * @param id - ID участка
 * @returns Promise<void>
 */
export async function deleteWorkshop(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('workshops')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[supabaseWorkshopApi] Ошибка deleteWorkshop:', error);
      
      // Обработка ошибки внешнего ключа (если участок используется в оборудовании)
      if (error.code === '23503') {
        throw new Error('Невозможно удалить участок: он используется в оборудовании');
      }
      
      throw new Error(error.message || 'Ошибка при удалении участка');
    }
  } catch (error: any) {
    console.error('[supabaseWorkshopApi] Ошибка deleteWorkshop:', error);
    throw error;
  }
}

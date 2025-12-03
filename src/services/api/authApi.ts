/**
 * authApi.ts
 * 
 * API функции для аутентификации и управления пользователями
 */

import { API_CONFIG } from '../../config/api';
import type { RegisterData, LoginData, AuthResponse, ChangePasswordData } from '../../types/user';
import type { LoginHistoryEntry } from '../../types/auth';

const API_URL = API_CONFIG.EQUIPMENT_API_URL;

/**
 * Выполняет POST запрос к API с URL-encoded данными
 * 
 * @param formData - URLSearchParams с данными запроса
 * @returns Promise с ответом сервера
 */
async function postRequest(formData: URLSearchParams): Promise<any> {
  try {
    // Пробуем обычный CORS запрос
    const response = await fetch(API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      cache: 'no-cache',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    // Если это CORS ошибка, пробуем через no-cors с последующей проверкой через GET
    if (error.name === 'TypeError' && 
        (error.message?.includes('fetch') || 
         error.message?.includes('Failed to fetch') ||
         error.message?.includes('CORS'))) {
      console.warn('⚠️ CORS ошибка, используем альтернативный метод');
      throw new Error('Ошибка подключения к серверу. Проверьте настройки CORS.');
    }
    throw error;
  }
}

/**
 * Регистрация нового пользователя
 * 
 * @param data - Данные для регистрации (email, password, name)
 * @returns Promise с ответом сервера
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  const formData = new URLSearchParams();
  formData.append('action', 'register');
  formData.append('email', data.email);
  formData.append('password', data.password);
  if (data.name) {
    formData.append('name', data.name);
  }

  try {
    const result = await postRequest(formData);
    
    if (!result.success) {
      throw new Error(result.message || 'Ошибка при регистрации');
    }

    return {
      user: result.user,
      sessionToken: result.sessionToken || '',
      expiresAt: result.expiresAt || new Date(Date.now() + 3600000).toISOString(),
      message: result.message,
    };
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    throw error;
  }
}

/**
 * Вход пользователя
 * 
 * @param data - Данные для входа (email, password)
 * @returns Promise с ответом сервера
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  const formData = new URLSearchParams();
  formData.append('action', 'login');
  formData.append('email', data.email);
  formData.append('password', data.password);

  try {
    const result = await postRequest(formData);
    
    if (!result.success) {
      throw new Error(result.message || 'Неверный email или пароль');
    }

    return {
      user: result.user,
      sessionToken: result.sessionToken || '',
      expiresAt: result.expiresAt || new Date(Date.now() + 3600000).toISOString(),
      message: result.message,
    };
  } catch (error) {
    console.error('Ошибка входа:', error);
    throw error;
  }
}

/**
 * Выход пользователя
 * 
 * @param email - Email пользователя
 * @returns Promise с ответом сервера
 */
export async function logout(email: string): Promise<void> {
  const formData = new URLSearchParams();
  formData.append('action', 'logout');
  formData.append('email', email);

  try {
    await postRequest(formData);
  } catch (error) {
    console.error('Ошибка выхода:', error);
    // Не пробрасываем ошибку, так как выход должен произойти в любом случае
  }
}

/**
 * Смена пароля пользователя
 * 
 * @param email - Email пользователя
 * @param data - Данные для смены пароля (currentPassword, newPassword)
 * @returns Promise с ответом сервера
 */
export async function changePassword(
  email: string,
  data: Omit<ChangePasswordData, 'confirmPassword'>
): Promise<{ success: boolean; message: string }> {
  const formData = new URLSearchParams();
  formData.append('action', 'change-password');
  formData.append('email', email);
  formData.append('currentPassword', data.currentPassword);
  formData.append('newPassword', data.newPassword);

  try {
    const result = await postRequest(formData);
    
    if (!result.success) {
      throw new Error(result.message || 'Ошибка при смене пароля');
    }

    return {
      success: true,
      message: result.message || 'Пароль успешно изменен',
    };
  } catch (error) {
    console.error('Ошибка смены пароля:', error);
    throw error;
  }
}

/**
 * Проверка активности сессии
 * 
 * @param email - Email пользователя
 * @returns Promise с информацией о сессии
 */
export async function checkSession(email: string): Promise<{
  active: boolean;
  remainingTime?: number;
  message?: string;
}> {
  const formData = new URLSearchParams();
  formData.append('action', 'check-session');
  formData.append('email', email);

  try {
    const result = await postRequest(formData);
    
    if (!result.active) {
      return {
        active: false,
        message: result.message || 'Сессия истекла',
      };
    }

    return {
      active: true,
      remainingTime: result.remainingTime,
      message: result.message,
    };
  } catch (error) {
    console.error('Ошибка проверки сессии:', error);
    return {
      active: false,
      message: 'Ошибка при проверке сессии',
    };
  }
}

/**
 * Проверка прав администратора
 * 
 * @param email - Email пользователя
 * @returns Promise с информацией о правах
 */
export async function verifyAdmin(email: string): Promise<{
  isAdmin: boolean;
  role: 'admin' | 'user';
  email: string;
}> {
  const formData = new URLSearchParams();
  formData.append('action', 'verify-admin');
  formData.append('email', email);

  try {
    const result = await postRequest(formData);
    
    return {
      isAdmin: result.isAdmin || false,
      role: result.role || 'user',
      email: result.email || email,
    };
  } catch (error) {
    console.error('Ошибка проверки прав администратора:', error);
    return {
      isAdmin: false,
      role: 'user',
      email,
    };
  }
}

/**
 * Получение истории входов
 * 
 * @param email - Email пользователя (опционально, если не указан - все записи)
 * @param limit - Максимальное количество записей
 * @returns Promise с историей входов
 */
export async function getLoginHistory(
  email?: string,
  limit: number = 100
): Promise<LoginHistoryEntry[]> {
  const params = new URLSearchParams();
  params.append('action', 'get-login-history');
  if (email) {
    params.append('email', email);
  }
  params.append('limit', limit.toString());

  try {
    const response = await fetch(`${API_URL}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error('Ошибка при получении истории входов');
    }

    const result = await response.json();
    
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Ошибка получения истории входов:', error);
    return [];
  }
}

/**
 * Добавление администратора в резервный список
 * 
 * @param email - Email администратора
 * @param note - Примечание (опционально)
 * @returns Promise с ответом сервера
 */
export async function addAdmin(
  email: string,
  note?: string
): Promise<{ success: boolean; message: string }> {
  const formData = new URLSearchParams();
  formData.append('action', 'add-admin');
  formData.append('email', email);
  if (note) {
    formData.append('note', note);
  }

  try {
    const result = await postRequest(formData);
    
    if (!result.success) {
      throw new Error(result.message || 'Ошибка при добавлении администратора');
    }

    return {
      success: true,
      message: result.message || 'Администратор успешно добавлен',
    };
  } catch (error) {
    console.error('Ошибка добавления администратора:', error);
    throw error;
  }
}

/**
 * Удаление администратора из резервного списка
 * 
 * @param email - Email администратора
 * @returns Promise с ответом сервера
 */
export async function removeAdmin(email: string): Promise<{ success: boolean; message: string }> {
  const formData = new URLSearchParams();
  formData.append('action', 'remove-admin');
  formData.append('email', email);

  try {
    const result = await postRequest(formData);
    
    if (!result.success) {
      throw new Error(result.message || 'Ошибка при удалении администратора');
    }

    return {
      success: true,
      message: result.message || 'Администратор успешно удален',
    };
  } catch (error) {
    console.error('Ошибка удаления администратора:', error);
    throw error;
  }
}


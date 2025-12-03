/**
 * Утилиты для работы с разрешениями камеры
 */

export interface CameraPermissionStatus {
  granted: boolean;
  denied: boolean;
  prompt: boolean;
  error?: string;
}

/**
 * Запрашивает разрешение на использование камеры
 * 
 * @returns Promise с результатом запроса разрешения
 */
export async function requestCameraPermission(): Promise<CameraPermissionStatus> {
  try {
    // Проверяем поддержку API разрешений
    if (!navigator.permissions) {
      // Если API разрешений не поддерживается, пытаемся получить доступ к камере напрямую
      return await checkCameraAccess();
    }

    // Запрашиваем разрешение на использование камеры
    const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
    
    if (permission.state === 'granted') {
      return { granted: true, denied: false, prompt: false };
    }

    if (permission.state === 'denied') {
      return { granted: false, denied: true, prompt: false };
    }

    // Состояние 'prompt' - нужно запросить разрешение
    return { granted: false, denied: false, prompt: true };
  } catch (error) {
    // Если API разрешений не поддерживается или произошла ошибка
    return await checkCameraAccess();
  }
}

/**
 * Проверяет доступ к камере напрямую
 * 
 * @returns Promise с результатом проверки доступа
 */
async function checkCameraAccess(): Promise<CameraPermissionStatus> {
  try {
    // Пытаемся получить доступ к камере
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } // Задняя камера на мобильных устройствах
    });
    
    // Если получили доступ, освобождаем поток
    stream.getTracks().forEach(track => track.stop());
    
    return { granted: true, denied: false, prompt: false };
  } catch (error: any) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return { 
        granted: false, 
        denied: true, 
        prompt: false,
        error: 'Доступ к камере запрещен. Разрешите доступ в настройках браузера.' 
      };
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return { 
        granted: false, 
        denied: false, 
        prompt: false,
        error: 'Камера не найдена. Убедитесь, что устройство имеет камеру.' 
      };
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return { 
        granted: false, 
        denied: false, 
        prompt: false,
        error: 'Камера уже используется другим приложением.' 
      };
    }

    return { 
      granted: false, 
      denied: false, 
      prompt: true,
      error: error.message || 'Неизвестная ошибка при доступе к камере.' 
    };
  }
}

/**
 * Проверяет, поддерживается ли доступ к камере
 * 
 * @returns true если камера поддерживается
 */
export function isCameraSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}

/**
 * Получает список доступных камер
 * 
 * @returns Promise с массивом устройств камеры
 */
export async function getAvailableCameras(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Ошибка при получении списка камер:', error);
    return [];
  }
}


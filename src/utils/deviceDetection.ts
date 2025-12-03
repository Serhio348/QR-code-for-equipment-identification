/**
 * Утилиты для определения типа устройства и режима приложения
 */

/**
 * Проверяет, является ли устройство мобильным
 * @returns true если устройство мобильное
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || window.innerWidth < 768;
}

/**
 * Проверяет, запущено ли приложение в режиме PWA (standalone)
 * @returns true если приложение запущено как PWA
 */
export function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Проверяет, является ли устройство iOS
 * @returns true если устройство iOS
 */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Проверяет, является ли устройство Android
 * @returns true если устройство Android
 */
export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/**
 * Проверяет, поддерживается ли установка PWA
 * @returns true если можно установить PWA
 */
export function canInstallPWA(): boolean {
  // Проверяем наличие события beforeinstallprompt
  return 'serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window;
}

/**
 * Получает информацию об устройстве
 * @returns объект с информацией об устройстве
 */
export function getDeviceInfo() {
  return {
    isMobile: isMobileDevice(),
    isPWA: isPWA(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    canInstall: canInstallPWA(),
    userAgent: navigator.userAgent,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
  };
}


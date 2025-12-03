/**
 * Страница сканера QR-кодов
 * Отображает сканер QR-кодов и обрабатывает переход к странице оборудования
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import QRScanner from '../components/QRScanner/QRScanner';
import { ROUTES, getEquipmentViewUrl } from '../utils/routes';
import LoadingSpinner from '../components/LoadingSpinner';
import { getAllEquipment } from '../services/equipmentApi';
import { Equipment } from '../types/equipment';
import './ScannerPage.css';

const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [searching, setSearching] = useState(false);
  const isProcessingRef = useRef(false); // Флаг для предотвращения повторных вызовов
  const abortControllerRef = useRef<AbortController | null>(null); // Для отмены запросов
  const hasNavigatedRef = useRef(false); // Флаг для отслеживания навигации

  // Показываем загрузку во время проверки авторизации
  if (loading) {
    return <LoadingSpinner text="Загрузка..." />;
  }

  // Если не авторизован, перенаправляем на страницу входа
  if (!isAuthenticated) {
    navigate(ROUTES.LOGIN);
    return null;
  }

  // Сброс состояния при монтировании компонента
  useEffect(() => {
    // Сбрасываем все флаги при монтировании (например, при возврате на страницу)
    isProcessingRef.current = false;
    hasNavigatedRef.current = false;
    setSearching(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Очистка при размонтировании компонента
    return () => {
      // Отменяем активный запрос при размонтировании
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Сбрасываем флаги
      isProcessingRef.current = false;
      hasNavigatedRef.current = false;
      setSearching(false);
    };
  }, []);

  /**
   * Обрабатывает успешное сканирование QR-кода
   */
  const handleScanSuccess = async (equipmentIdOrDriveId: string) => {
    console.log('[ScannerPage] handleScanSuccess вызван с:', equipmentIdOrDriveId);
    
    // Защита от повторных вызовов
    if (isProcessingRef.current) {
      console.warn('[ScannerPage] Игнорируем повторный вызов handleScanSuccess - уже обрабатывается запрос');
      return;
    }
    
    // Устанавливаем флаг обработки
    isProcessingRef.current = true;
    
    // Если это маркер Google Drive ID, ищем оборудование по Google Drive URL
    if (equipmentIdOrDriveId.startsWith('DRIVE:')) {
      const driveFolderId = equipmentIdOrDriveId.replace('DRIVE:', '');
      console.log('[ScannerPage] Поиск оборудования по Drive ID:', driveFolderId);
      
      // Отменяем предыдущий запрос, если он есть
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Создаем новый AbortController для этого запроса
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      setSearching(true);
      
      try {
        console.log('[ScannerPage] Загрузка всего оборудования...');
        // Загружаем все оборудование и ищем по Google Drive URL
        let allEquipment: Equipment[];
        
        try {
          // Проверяем, не был ли запрос отменен
          if (abortController.signal.aborted) {
            console.log('[ScannerPage] Запрос был отменен');
            return;
          }
          
          allEquipment = await getAllEquipment() as Equipment[];
          
          // Проверяем снова после получения данных
          if (abortController.signal.aborted) {
            console.log('[ScannerPage] Запрос был отменен после получения данных');
            return;
          }
          
          console.log('[ScannerPage] getAllEquipment вернул:', allEquipment);
        } catch (apiError: any) {
          // Игнорируем ошибку, если запрос был отменен
          if (abortController.signal.aborted) {
            console.log('[ScannerPage] Запрос был отменен, игнорируем ошибку');
            return;
          }
          console.error('[ScannerPage] Ошибка при вызове getAllEquipment:', apiError);
          throw new Error(`Ошибка загрузки оборудования: ${apiError?.message || 'Неизвестная ошибка API'}`);
        }
        
        console.log('[ScannerPage] Получено оборудования:', allEquipment?.length || 0);
        console.log('[ScannerPage] Тип данных:', typeof allEquipment, Array.isArray(allEquipment));
        
        if (!allEquipment) {
          console.error('[ScannerPage] allEquipment is null/undefined');
          throw new Error('Не удалось загрузить список оборудования. Сервер вернул пустой ответ.');
        }
        
        if (!Array.isArray(allEquipment)) {
          const errorInfo: any = {
            type: typeof allEquipment,
            value: allEquipment
          };
          if (allEquipment && typeof allEquipment === 'object') {
            errorInfo.constructor = (allEquipment as any).constructor?.name;
          }
          console.error('[ScannerPage] Неверный формат данных:', errorInfo);
          throw new Error(`Неверный формат данных от сервера. Ожидается массив, получен: ${typeof allEquipment}`);
        }
        
        if (allEquipment.length === 0) {
          console.warn('[ScannerPage] Список оборудования пуст');
          alert('В базе данных нет оборудования. Обратитесь к администратору.');
          setSearching(false);
          return;
        }
        
        console.log('[ScannerPage] Поиск оборудования с Drive ID:', driveFolderId);
        console.log('[ScannerPage] Всего оборудования для проверки:', allEquipment.length);
        
        // Логируем все Google Drive URL для отладки
        allEquipment.forEach((eq, index) => {
          console.log(`[ScannerPage] Оборудование ${index + 1}:`, {
            id: eq.id,
            name: eq.name,
            googleDriveUrl: eq.googleDriveUrl,
            containsId: eq.googleDriveUrl?.includes(driveFolderId)
          });
        });
        
        const equipment = allEquipment.find(
          (eq) => {
            if (!eq || !eq.googleDriveUrl) {
              return false;
            }
            
            const url = eq.googleDriveUrl.toLowerCase();
            const searchId = driveFolderId.toLowerCase();
            
            // Проверяем разные форматы URL
            const matches = url.includes(searchId) || 
                           url.includes(`folders/${searchId}`) ||
                           url.includes(`id=${searchId}`) ||
                           url.endsWith(`/${searchId}`) ||
                           url.includes(`/${searchId}/`);
            
            if (matches) {
              console.log('[ScannerPage] Найдено совпадение:', eq.name, eq.id);
            }
            
            return matches;
          }
        );
        
        // Проверяем, не был ли запрос отменен перед навигацией
        if (abortController.signal.aborted) {
          console.log('[ScannerPage] Запрос был отменен перед навигацией');
          return;
        }
        
        if (equipment) {
          console.log('[ScannerPage] ✅ Оборудование найдено:', {
            id: equipment.id,
            name: equipment.name,
            googleDriveUrl: equipment.googleDriveUrl
          });
          
          // Сбрасываем флаги перед навигацией
          isProcessingRef.current = false;
          abortControllerRef.current = null;
          setSearching(false);
          
          // Устанавливаем флаг навигации, чтобы предотвратить вызов onClose
          hasNavigatedRef.current = true;
          
          navigate(getEquipmentViewUrl(equipment.id));
        } else {
          console.warn('[ScannerPage] ❌ Оборудование не найдено для Drive ID:', driveFolderId);
          console.log('[ScannerPage] Все Google Drive URL в базе:');
          allEquipment.forEach((eq, idx) => {
            console.log(`  ${idx + 1}. ${eq.name}: ${eq.googleDriveUrl || '(нет URL)'}`);
          });
          
          const errorMsg = `Оборудование с Google Drive URL (ID: ${driveFolderId}) не найдено.\n\n` +
            `Проверьте:\n` +
            `1. Правильность QR-кода\n` +
            `2. Что оборудование существует в базе данных\n` +
            `3. Консоль браузера для подробностей`;
          alert(errorMsg);
          
          // Сбрасываем флаги
          isProcessingRef.current = false;
          abortControllerRef.current = null;
          setSearching(false);
        }
      } catch (error: any) {
        // Игнорируем ошибку, если запрос был отменен
        if (abortControllerRef.current?.signal.aborted) {
          console.log('[ScannerPage] Запрос был отменен, игнорируем ошибку');
          return;
        }
        console.error('[ScannerPage] ❌ КРИТИЧЕСКАЯ ОШИБКА при поиске оборудования:', error);
        console.error('[ScannerPage] Тип ошибки:', error?.constructor?.name);
        console.error('[ScannerPage] Stack trace:', error?.stack);
        console.error('[ScannerPage] Полная информация об ошибке:', {
          message: error?.message,
          name: error?.name,
          stack: error?.stack,
          toString: error?.toString()
        });
        
        // Определяем тип ошибки для более понятного сообщения
        const isTimeout = error?.name === 'TimeoutError' || 
                         error?.name === 'AbortError' ||
                         error?.message?.includes('timeout') ||
                         error?.message?.includes('Превышено время ожидания');
        
        const isNetworkError = error?.message?.includes('fetch') ||
                              error?.message?.includes('Failed to fetch') ||
                              error?.message?.includes('network');
        
        let userMessage: string;
        
        if (isTimeout) {
          userMessage = `Превышено время ожидания ответа от сервера.\n\n` +
            `Возможные причины:\n` +
            `• Медленное интернет-соединение\n` +
            `• Сервер перегружен\n` +
            `• Большое количество оборудования в базе\n\n` +
            `Попробуйте:\n` +
            `1. Проверить подключение к интернету\n` +
            `2. Повторить попытку через несколько секунд\n` +
            `3. Обратиться к администратору`;
        } else if (isNetworkError) {
          userMessage = `Не удалось подключиться к серверу.\n\n` +
            `Проверьте:\n` +
            `1. Подключение к интернету\n` +
            `2. Что вы находитесь в сети Wi‑Fi или мобильной сети\n` +
            `3. Попробуйте обновить страницу`;
        } else {
          const errorMessage = error?.message || error?.toString() || 'Неизвестная ошибка';
          userMessage = `Ошибка при поиске оборудования:\n\n${errorMessage}\n\n` +
            `Проверьте:\n` +
            `1. Подключение к интернету\n` +
            `2. Доступность API сервера\n` +
            `3. Консоль браузера (Eruda) для подробностей`;
        }
        
        alert(userMessage);
        
        // Сбрасываем флаги
        isProcessingRef.current = false;
        abortControllerRef.current = null;
        setSearching(false);
      }
    } else {
      // Обычный ID оборудования - переходим напрямую
      console.log('[ScannerPage] Прямой переход по ID:', equipmentIdOrDriveId);
      
      // Сбрасываем флаги
      isProcessingRef.current = false;
      abortControllerRef.current = null;
      
      // Устанавливаем флаг навигации, чтобы предотвратить вызов onClose
      hasNavigatedRef.current = true;
      
      navigate(getEquipmentViewUrl(equipmentIdOrDriveId));
    }
  };

  /**
   * Обрабатывает ошибку сканирования
   */
  const handleScanError = (error: string) => {
    console.error('Ошибка сканирования QR-кода:', error);
    // Можно показать уведомление пользователю
  };

  /**
   * Обрабатывает закрытие сканера
   */
  const handleClose = () => {
    // Если уже произошла навигация, не вызываем повторную навигацию
    if (hasNavigatedRef.current) {
      console.log('[ScannerPage] Игнорируем onClose - навигация уже произошла');
      return;
    }
    
    // Возвращаемся на главную страницу только если навигация не произошла
    console.log('[ScannerPage] Закрытие сканера - возврат на главную');
    navigate(ROUTES.HOME);
  };

  return (
    <div className="scanner-page">
      {searching && (
        <div className="scanner-page-overlay">
          <LoadingSpinner text="Поиск оборудования..." />
        </div>
      )}
      <div className={`scanner-page-container ${searching ? 'scanner-page-container-blurred' : ''}`}>
        <QRScanner
          onScanSuccess={handleScanSuccess}
          onScanError={handleScanError}
          onClose={handleClose}
          autoCloseOnSuccess={true}
        />
      </div>
    </div>
  );
};

export default ScannerPage;


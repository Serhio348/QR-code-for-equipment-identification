/**
 * Хук для управления формой оборудования
 * 
 * Содержит всю логику состояния, загрузки, валидации и сохранения
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Equipment, EquipmentType, EquipmentStatus, EquipmentSpecs } from '../types/equipment';
import { addEquipment, updateEquipment, getEquipmentById } from '../services/equipmentApi';
import { generateQRCodeUrl } from '../utils/urlGenerator';
import { getEquipmentViewUrl } from '../utils/routes';
import { normalizeDate } from '../utils/dateNormalization';
import { updateEquipmentCache, clearEquipmentCache } from './useEquipmentData';

interface UseEquipmentFormProps {
  equipmentId?: string;
  onSave?: (equipment: Equipment) => void;
  onCancel?: () => void;
}

export function useEquipmentForm({ equipmentId, onSave, onCancel }: UseEquipmentFormProps) {
  const navigate = useNavigate();
  const isEditMode = !!equipmentId;

  // Основные поля формы
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<EquipmentType>('filter');
  const [status, setStatus] = useState<EquipmentStatus>('active');
  const [googleDriveUrl, setGoogleDriveUrl] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [commissioningDate, setCommissioningDate] = useState<string>('');

  // Характеристики (динамические поля)
  const [specs, setSpecs] = useState<EquipmentSpecs>({});

  // Состояния
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Загрузка данных для редактирования
  useEffect(() => {
    if (isEditMode && equipmentId) {
      loadEquipment();
    }
  }, [equipmentId, isEditMode]);

  const loadEquipment = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const equipment = await getEquipmentById(equipmentId!);
      if (equipment) {
        console.log('📦 Загружено оборудование для редактирования:', {
          id: equipment.id,
          name: equipment.name,
          type: equipment.type,
          specs: equipment.specs,
          specsType: typeof equipment.specs
        });
        
        setName(equipment.name);
        setType(equipment.type);
        setStatus(equipment.status);
        setGoogleDriveUrl(equipment.googleDriveUrl);
        setQrCodeUrl(equipment.qrCodeUrl);
        setCommissioningDate(normalizeDate(equipment.commissioningDate));
        
        // Убеждаемся, что specs это объект, а не строка
        let specsToSet = equipment.specs || {};
        if (typeof specsToSet === 'string') {
          try {
            specsToSet = JSON.parse(specsToSet);
          } catch (e) {
            console.warn('⚠️ Не удалось распарсить specs как JSON:', e);
            specsToSet = {};
          }
        }
        
        console.log('📋 Устанавливаем specs:', specsToSet);
        setSpecs(specsToSet);
      } else {
        setError('Оборудование не найдено');
      }
    } catch (err: any) {
      console.error('Ошибка загрузки оборудования:', err);
      setError('Не удалось загрузить данные оборудования');
    } finally {
      setLoading(false);
    }
  };

  // Обработка изменения типа оборудования
  const handleTypeChange = (newType: EquipmentType) => {
    setType(newType);
    // Сбрасываем характеристики при смене типа
    setSpecs({});
  };

  // Обработка изменения характеристик
  const handleSpecChange = (key: string, value: string) => {
    setSpecs(prev => ({
      ...prev,
      [key]: value
    }));
  };


  // Валидация формы
  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError('Название оборудования обязательно');
      return false;
    }
    if (isEditMode && !googleDriveUrl.trim()) {
      setError('URL Google Drive обязателен при редактировании');
      return false;
    }
    if (isEditMode && !qrCodeUrl.trim()) {
      setError('URL для QR-кода обязателен при редактировании');
      return false;
    }
    return true;
  };

  // Сохранение формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      let finalGoogleDriveUrl = googleDriveUrl.trim();
      let finalQrCodeUrl = qrCodeUrl.trim();

      // Если URL для QR-кода не указан, используем Google Drive URL или генерируем
      if (!finalQrCodeUrl) {
        if (finalGoogleDriveUrl) {
          finalQrCodeUrl = finalGoogleDriveUrl;
        } else if (isEditMode && equipmentId) {
          finalQrCodeUrl = generateQRCodeUrl(equipmentId, finalGoogleDriveUrl);
        } else {
          finalQrCodeUrl = '';
        }
      }

      // input type="date" уже возвращает YYYY-MM-DD
      const normalizedCommissioningDate = commissioningDate ? commissioningDate.split('T')[0].trim() : undefined;
      
      console.log('💾 Сохранение оборудования:', {
        исходная_дата: commissioningDate,
        нормализованная_дата: normalizedCommissioningDate
      });
      
      const equipmentData: Partial<Equipment> = {
        name: name.trim(),
        type,
        status,
        specs,
        googleDriveUrl: finalGoogleDriveUrl,
        qrCodeUrl: finalQrCodeUrl,
        commissioningDate: normalizedCommissioningDate,
      };

      let savedEquipment: Equipment;

      if (isEditMode && equipmentId) {
        savedEquipment = await updateEquipment(equipmentId, equipmentData);
      } else {
        savedEquipment = await addEquipment(equipmentData as any);
        
        // После создания обновляем QR-код URL с правильным ID, если нужно
        const driveUrl = savedEquipment.googleDriveUrl || finalGoogleDriveUrl;
        if (!savedEquipment.qrCodeUrl && driveUrl) {
          savedEquipment = await updateEquipment(savedEquipment.id, {
            qrCodeUrl: driveUrl
          });
        } else if (!savedEquipment.qrCodeUrl) {
          const generatedUrl = generateQRCodeUrl(savedEquipment.id, driveUrl);
          savedEquipment = await updateEquipment(savedEquipment.id, {
            qrCodeUrl: generatedUrl
          });
        }
      }

      setSuccess(true);
      
      // Обновляем кеш после успешного сохранения
      updateEquipmentCache(savedEquipment);
      // Также очищаем кеш списка, чтобы изменения отобразились в списке
      clearEquipmentCache();
      
      if (onSave) {
        onSave(savedEquipment);
      }

      setTimeout(() => {
        navigate(getEquipmentViewUrl(savedEquipment.id));
      }, 1000);

    } catch (err: any) {
      console.error('Ошибка сохранения оборудования:', err);
      setError(`Ошибка сохранения: ${err.message || 'Не удалось сохранить оборудование'}`);
    } finally {
      setSaving(false);
    }
  };

  // Отмена
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(-1);
    }
  };

  return {
    // Состояния
    name,
    type,
    status,
    googleDriveUrl,
    qrCodeUrl,
    commissioningDate,
    specs,
    loading,
    saving,
    error,
    success,
    isEditMode,
    
    // Сеттеры
    setName,
    setType,
    setStatus,
    setGoogleDriveUrl,
    setQrCodeUrl,
    setCommissioningDate,
    
    // Обработчики
    handleTypeChange,
    handleSpecChange,
    handleSubmit,
    handleCancel,
  };
}


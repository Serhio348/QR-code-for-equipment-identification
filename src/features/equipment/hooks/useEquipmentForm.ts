/**
 * Хук для управления формой оборудования
 * 
 * Содержит всю логику состояния, загрузки, валидации и сохранения
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Equipment, EquipmentType, EquipmentStatus, EquipmentSpecs } from '../types/equipment';
import { addEquipment, updateEquipment, getEquipmentById } from '../services/equipmentApi';
import { generateQRCodeUrl } from '@/shared/utils/urlGenerator';
import { getEquipmentViewUrl } from '@/shared/utils/routes';
import { normalizeDate } from '@/shared/utils/dateNormalization';
import { updateEquipmentCache } from './useEquipmentData';

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
        console.debug('📦 Загружено оборудование для редактирования:', {
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
        
        console.debug('📋 Устанавливаем specs:', specsToSet);
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
    // Сбрасываем характеристики при смене типа, но сохраняем workshop
    const currentWorkshop = specs?.workshop;
    setSpecs(currentWorkshop ? { workshop: currentWorkshop } : {});
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
    if (!specs?.workshop || !specs.workshop.trim()) {
      setError('Необходимо указать цех (расположение оборудования)');
      return false;
    }
    if (isEditMode && !googleDriveUrl.trim()) {
      setError('URL Google Drive обязателен при редактировании');
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

      // QR должен быть уникальным для каждой единицы оборудования и вести на карточку /equipment/:id.
      // Если пользователь оставил поле пустым или оно совпадает с общей папкой Drive — генерируем URL приложения.
      if (isEditMode && equipmentId && (!finalQrCodeUrl || finalQrCodeUrl === finalGoogleDriveUrl)) {
        finalQrCodeUrl = generateQRCodeUrl(equipmentId);
      }
      if (!isEditMode && finalQrCodeUrl === finalGoogleDriveUrl) {
        // На create ещё нет id, поэтому поправим после addEquipment()
        finalQrCodeUrl = '';
      }

      // input type="date" уже возвращает YYYY-MM-DD
      const normalizedCommissioningDate = commissioningDate ? commissioningDate.split('T')[0].trim() : undefined;
      
      console.debug('💾 Сохранение оборудования:', {
        режим: isEditMode ? 'редактирование' : 'добавление',
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
        
        // После создания проставляем QR-код URL по id (уникальный для каждой единицы).
        const driveUrl = savedEquipment.googleDriveUrl || finalGoogleDriveUrl;
        const needsQrFix = !savedEquipment.qrCodeUrl || savedEquipment.qrCodeUrl === driveUrl;
        if (needsQrFix) {
          const generatedUrl = generateQRCodeUrl(savedEquipment.id);
          savedEquipment = await updateEquipment(savedEquipment.id, { qrCodeUrl: generatedUrl });
        }
      }

      setSuccess(true);
      
      // Обновляем кеш после успешного сохранения
      // updateEquipmentCache уже обновляет кеш оборудования и инвалидирует кеш списка
      updateEquipmentCache(savedEquipment);
      
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


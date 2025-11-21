import React, { useState, useEffect, useRef } from 'react';
import EquipmentPlate from './components/EquipmentPlate';
import { filterSpecs, Equipment, FilterSpecs } from './types/equipment';
import { getEquipmentByType, updateEquipment, addEquipment } from './services/equipmentApi';
import { exportToPDF } from './utils/pdfExport';
import './App.css';

const App: React.FC = () => {
  const [filterNumber, setFilterNumber] = useState<number>(1);
  const [currentEquipment, setCurrentEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  
  const [commissioningDate, setCommissioningDate] = useState<string>(() => {
    const saved = localStorage.getItem(`filter-${1}-commissioning-date`);
    return saved || '';
  });
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState<string>(() => {
    const saved = localStorage.getItem(`filter-${1}-last-maintenance-date`);
    return saved || '';
  });

  // Этап 1: Загрузка оборудования из API при старте приложения
  useEffect(() => {
    const loadEquipment = async () => {
      setLoading(true);
      setError(null);
      isInitialLoadRef.current = true; // Сбрасываем флаг при загрузке нового фильтра
      
      try {
        // Загружаем все фильтры из базы данных
        const filters = await getEquipmentByType('filter');
        
        // Ищем фильтр по номеру (поиск по названию, содержащему номер)
        const foundFilter = filters.find(eq => {
          const nameMatch = eq.name.match(/№(\d+)/);
          return nameMatch && parseInt(nameMatch[1]) === filterNumber;
        });
        
        if (foundFilter) {
          setCurrentEquipment(foundFilter);
          // Загружаем даты из базы данных
          if (foundFilter.commissioningDate) {
            setCommissioningDate(foundFilter.commissioningDate);
          } else {
            setCommissioningDate('');
          }
          if (foundFilter.lastMaintenanceDate) {
            setLastMaintenanceDate(foundFilter.lastMaintenanceDate);
          } else {
            setLastMaintenanceDate('');
          }
        } else {
          // Если фильтр не найден в базе, используем дефолтные данные
          setCurrentEquipment(null);
          // Загружаем из localStorage как fallback
          const savedCommissioning = localStorage.getItem(`filter-${filterNumber}-commissioning-date`);
          const savedMaintenance = localStorage.getItem(`filter-${filterNumber}-last-maintenance-date`);
          if (savedCommissioning) setCommissioningDate(savedCommissioning);
          else setCommissioningDate('');
          if (savedMaintenance) setLastMaintenanceDate(savedMaintenance);
          else setLastMaintenanceDate('');
        }
      } catch (err: any) {
        console.error('Ошибка загрузки оборудования:', err);
        setError('Не удалось загрузить данные оборудования. Используются локальные данные.');
        // При ошибке используем localStorage как fallback
        const savedCommissioning = localStorage.getItem(`filter-${filterNumber}-commissioning-date`);
        const savedMaintenance = localStorage.getItem(`filter-${filterNumber}-last-maintenance-date`);
        if (savedCommissioning) setCommissioningDate(savedCommissioning);
        else setCommissioningDate('');
        if (savedMaintenance) setLastMaintenanceDate(savedMaintenance);
        else setLastMaintenanceDate('');
      } finally {
        setLoading(false);
      }
    };
    
    loadEquipment();
  }, [filterNumber]);

  // Этап 2: Сохранение дат через API вместо localStorage
  const saveTimeoutRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  
  // Функция для сохранения дат в базу данных
  const saveDatesToAPI = async (commissioning: string, maintenance: string) => {
    // Очищаем предыдущий таймер
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Устанавливаем новый таймер для debounce (сохранение через 1 секунду после последнего изменения)
    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaving(true);
      setSaveSuccess(false);
      setError(null);
      
      try {
        if (currentEquipment) {
          // Если оборудование существует в базе, обновляем его
          const updated = await updateEquipment(currentEquipment.id, {
            commissioningDate: commissioning || undefined,
            lastMaintenanceDate: maintenance || undefined
          });
          setCurrentEquipment(updated);
          setSaveSuccess(true);
          // Скрываем сообщение об успехе через 3 секунды
          setTimeout(() => setSaveSuccess(false), 3000);
        } else {
          // Если оборудование не найдено, создаем новое
          try {
            const newEquipment = await addEquipment({
              name: `Фильтр обезжелезивания ФО-0,8-1,5 №${filterNumber}`,
              type: 'filter',
              specs: filterSpecs,
              googleDriveUrl: 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon',
              qrCodeUrl: 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon',
              commissioningDate: commissioning || undefined,
              lastMaintenanceDate: maintenance || undefined,
              status: 'active'
            });
            setCurrentEquipment(newEquipment);
            setSaveSuccess(true);
            console.log('Оборудование успешно создано:', newEquipment);
            // Скрываем сообщение об успехе через 3 секунды
            setTimeout(() => setSaveSuccess(false), 3000);
          } catch (addError: any) {
            // Если оборудование не найдено сразу после добавления (fallback механизм),
            // но запрос был отправлен, все равно показываем успех
            if (addError.message && addError.message.includes('запрос был отправлен')) {
              setSaveSuccess(true);
              console.log('Запрос на создание оборудования отправлен');
              // Скрываем сообщение об успехе через 3 секунды
              setTimeout(() => setSaveSuccess(false), 3000);
              // Пытаемся перезагрузить данные через некоторое время
              setTimeout(async () => {
                try {
                  const filters = await getEquipmentByType('filter');
                  const foundFilter = filters.find(eq => {
                    const nameMatch = eq.name.match(/№(\d+)/);
                    return nameMatch && parseInt(nameMatch[1]) === filterNumber;
                  });
                  if (foundFilter) {
                    setCurrentEquipment(foundFilter);
                  }
                } catch (err) {
                  console.error('Ошибка перезагрузки данных:', err);
                }
              }, 2000);
            } else {
              throw addError;
            }
          }
        }
      } catch (error: any) {
        console.error('Ошибка сохранения дат в базу данных:', error);
        setError(`Ошибка сохранения: ${error.message || 'Не удалось сохранить данные'}`);
        // При ошибке сохраняем в localStorage как fallback
        if (commissioning) {
          localStorage.setItem(`filter-${filterNumber}-commissioning-date`, commissioning);
        }
        if (maintenance) {
          localStorage.setItem(`filter-${filterNumber}-last-maintenance-date`, maintenance);
        }
        // Скрываем сообщение об ошибке через 5 секунд
        setTimeout(() => setError(null), 5000);
      } finally {
        setSaving(false);
      }
    }, 1000); // Debounce 1 секунда
  };

  // Сохраняем даты через API при их изменении
  useEffect(() => {
    // Пропускаем сохранение при первой загрузке (когда данные загружаются из API)
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    
    // Пропускаем сохранение, если еще идет загрузка
    if (loading) {
      return;
    }
    
    // Сохраняем обе даты вместе
    saveDatesToAPI(commissioningDate, lastMaintenanceDate);
  }, [commissioningDate, lastMaintenanceDate, filterNumber, loading]);

  const handleExportPDF = async () => {
    try {
      await exportToPDF('equipment-plate', `Фильтр-${filterNumber}-табличка.pdf`);
    } catch (error) {
      alert('Ошибка при экспорте в PDF. Попробуйте еще раз.');
      console.error(error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Система идентификации оборудования</h1>
        <p>Фильтры обезжелезивания</p>
      </header>

      <div className="plate-container">
        {/* Индикаторы состояния сохранения */}
        {saving && (
          <div className="saving-message">
            <span className="saving-spinner">⏳</span> Сохранение данных...
          </div>
        )}
        {saveSuccess && (
          <div className="success-message">
            <span className="success-icon">✓</span> Данные успешно сохранены
          </div>
        )}
        {error && !loading && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}
        
        <div className="controls">
          <div className="controls-left">
            <label>
              Номер фильтра:
              <input
                type="number"
                min="1"
                max="2"
                value={filterNumber}
                onChange={(e) => setFilterNumber(parseInt(e.target.value) || 1)}
                className="filter-input"
                disabled={loading || saving}
              />
            </label>
            <label>
              Дата ввода в эксплуатацию:
              <input
                type="date"
                value={commissioningDate}
                onChange={(e) => setCommissioningDate(e.target.value)}
                className="date-input"
                disabled={loading || saving}
              />
            </label>
            <label>
              Дата последнего обслуживания:
              <input
                type="date"
                value={lastMaintenanceDate}
                onChange={(e) => setLastMaintenanceDate(e.target.value)}
                className="date-input"
                disabled={loading || saving}
              />
            </label>
          </div>
          <button 
            onClick={handleExportPDF} 
            className="export-button"
            disabled={loading || saving}
          >
            Экспортировать в PDF
          </button>
        </div>
        {loading ? (
          <div className="loading-message">Загрузка данных оборудования...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <EquipmentPlate 
            specs={(currentEquipment?.specs as FilterSpecs) || filterSpecs} 
            filterNumber={filterNumber}
            commissioningDate={commissioningDate}
            lastMaintenanceDate={lastMaintenanceDate}
          />
        )}
      </div>
    </div>
  );
};

export default App;


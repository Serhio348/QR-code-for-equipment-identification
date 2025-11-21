import React, { useState, useEffect } from 'react';
import EquipmentPlate from './components/EquipmentPlate';
import ApiTest from './components/ApiTest';
import { filterSpecs } from './types/equipment';
import { exportToPDF } from './utils/pdfExport';
import './App.css';

const App: React.FC = () => {
  const [filterNumber, setFilterNumber] = useState<number>(1);
  const [commissioningDate, setCommissioningDate] = useState<string>(() => {
    const saved = localStorage.getItem(`filter-${1}-commissioning-date`);
    return saved || '';
  });
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState<string>(() => {
    const saved = localStorage.getItem(`filter-${1}-last-maintenance-date`);
    return saved || '';
  });

  useEffect(() => {
    // Загружаем даты для выбранного фильтра
    const savedCommissioning = localStorage.getItem(`filter-${filterNumber}-commissioning-date`);
    const savedMaintenance = localStorage.getItem(`filter-${filterNumber}-last-maintenance-date`);
    if (savedCommissioning) setCommissioningDate(savedCommissioning);
    else setCommissioningDate('');
    if (savedMaintenance) setLastMaintenanceDate(savedMaintenance);
    else setLastMaintenanceDate('');
  }, [filterNumber]);

  useEffect(() => {
    // Сохраняем дату ввода в эксплуатацию
    if (commissioningDate) {
      localStorage.setItem(`filter-${filterNumber}-commissioning-date`, commissioningDate);
    }
  }, [commissioningDate, filterNumber]);

  useEffect(() => {
    // Сохраняем дату последнего обслуживания
    if (lastMaintenanceDate) {
      localStorage.setItem(`filter-${filterNumber}-last-maintenance-date`, lastMaintenanceDate);
    }
  }, [lastMaintenanceDate, filterNumber]);

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
        <ApiTest />
      </div>
      
      <div className="plate-container">
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
              />
            </label>
            <label>
              Дата ввода в эксплуатацию:
              <input
                type="date"
                value={commissioningDate}
                onChange={(e) => setCommissioningDate(e.target.value)}
                className="date-input"
              />
            </label>
            <label>
              Дата последнего обслуживания:
              <input
                type="date"
                value={lastMaintenanceDate}
                onChange={(e) => setLastMaintenanceDate(e.target.value)}
                className="date-input"
              />
            </label>
          </div>
          <button onClick={handleExportPDF} className="export-button">
            Экспортировать в PDF
          </button>
        </div>
        <EquipmentPlate 
          specs={filterSpecs} 
          filterNumber={filterNumber}
          commissioningDate={commissioningDate}
          lastMaintenanceDate={lastMaintenanceDate}
        />
      </div>
    </div>
  );
};

export default App;


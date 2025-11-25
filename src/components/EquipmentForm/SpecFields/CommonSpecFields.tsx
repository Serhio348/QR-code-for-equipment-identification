/**
 * Общие поля спецификаций для всех типов оборудования
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';

interface CommonSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

/**
 * Поле "Наименование" - первое поле для всех типов оборудования
 */
export const NameField: React.FC<CommonSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <div className="form-group">
      <label>Наименование *</label>
      <input
        type="text"
        value={specs.name || ''}
        onChange={(e) => onSpecChange('name', e.target.value)}
        placeholder="Например: Фильтр обезжелезивания ФО-0,8-1,5 №1"
        required
      />
    </div>
  );
};

/**
 * Поле "Инвентарный номер" - второе поле для всех типов оборудования
 */
export const InventoryNumberField: React.FC<CommonSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <div className="form-group">
      <label>Инвентарный номер</label>
      <input
        type="text"
        value={specs.inventoryNumber || ''}
        onChange={(e) => onSpecChange('inventoryNumber', e.target.value)}
        placeholder="Например: ИН-001"
      />
    </div>
  );
};


/**
 * Поля спецификаций для типа "Сантехническое оборудование"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface PlumbingSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const PlumbingSpecFields: React.FC<PlumbingSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: DN50, 1/2 дюйма"
      />
      <SpecField
        label="Материал"
        value={specs.material || ''}
        onChange={(value) => onSpecChange('material', value)}
        placeholder="Например: Полипропилен, Металл"
      />
      <SpecField
        label="Тип оборудования"
        value={specs.equipmentType || ''}
        onChange={(value) => onSpecChange('equipmentType', value)}
        placeholder="Например: Смеситель, Кран, Труба"
      />
      <SpecField
        label="Рабочее давление"
        value={specs.workingPressure || ''}
        onChange={(value) => onSpecChange('workingPressure', value)}
        placeholder="Например: 6 бар"
      />
      <SpecField
        label="Температура"
        value={specs.temperature || ''}
        onChange={(value) => onSpecChange('temperature', value)}
        placeholder="Например: до 95°C"
      />
    </>
  );
};


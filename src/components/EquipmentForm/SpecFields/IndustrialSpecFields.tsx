/**
 * Поля спецификаций для типа "Прочее промышленное оборудование"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface IndustrialSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const IndustrialSpecFields: React.FC<IndustrialSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      <SpecField
        label="Заводской номер"
        value={specs.serialNumber || ''}
        onChange={(value) => onSpecChange('serialNumber', value)}
        placeholder="Например: SN-123456"
      />
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 1000 ед/ч, 50 т/ч"
      />
    </>
  );
};


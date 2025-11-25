/**
 * Поля спецификаций для типа "Клапан"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface ValveSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const ValveSpecFields: React.FC<ValveSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: DN50"
      />
      <SpecField
        label="Тип клапана"
        value={specs.valveType || ''}
        onChange={(value) => onSpecChange('valveType', value)}
        placeholder="Например: Шаровой"
      />
    </>
  );
};


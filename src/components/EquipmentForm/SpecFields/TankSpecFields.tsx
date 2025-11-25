/**
 * Поля спецификаций для типа "Резервуар"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface TankSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const TankSpecFields: React.FC<TankSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      <SpecField
        label="Объем"
        value={specs.volume || ''}
        onChange={(value) => onSpecChange('volume', value)}
        placeholder="Например: 10 м³"
      />
      <SpecField
        label="Высота"
        value={specs.height || ''}
        onChange={(value) => onSpecChange('height', value)}
        placeholder="Например: 2,5 м"
      />
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: 2 м"
      />
    </>
  );
};


/**
 * Поля спецификаций для типа "Фильтр"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface FilterSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const FilterSpecFields: React.FC<FilterSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      <SpecField
        label="Высота"
        value={specs.height || ''}
        onChange={(value) => onSpecChange('height', value)}
        placeholder="Например: 1,5 м"
      />
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: 0,8 м"
      />
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 5 м³"
      />
      <SpecField
        label="Площадь фильтрации"
        value={specs.filtrationArea || ''}
        onChange={(value) => onSpecChange('filtrationArea', value)}
        placeholder="Например: 0,5 м²"
      />
      <SpecField
        label="Скорость фильтрации"
        value={specs.filtrationSpeed || ''}
        onChange={(value) => onSpecChange('filtrationSpeed', value)}
        placeholder="Например: 10 м/ч"
      />
      <SpecField
        label="Материал засыпки"
        value={specs.fillingMaterial || ''}
        onChange={(value) => onSpecChange('fillingMaterial', value)}
        placeholder="Например: Nevtraco 1,0-2,5 мм"
      />
      <SpecField
        label="Объем засыпки"
        value={specs.fillingVolume || ''}
        onChange={(value) => onSpecChange('fillingVolume', value)}
        placeholder="Например: 350 л"
      />
    </>
  );
};


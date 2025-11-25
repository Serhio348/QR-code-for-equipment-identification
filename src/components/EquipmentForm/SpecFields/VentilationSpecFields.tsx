/**
 * Поля спецификаций для типа "Вентиляционное оборудование"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface VentilationSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const VentilationSpecFields: React.FC<VentilationSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 1000 м³/ч"
      />
      <SpecField
        label="Мощность"
        value={specs.power || ''}
        onChange={(value) => onSpecChange('power', value)}
        placeholder="Например: 1,5 кВт"
      />
      <SpecField
        label="Тип вентилятора"
        value={specs.fanType || ''}
        onChange={(value) => onSpecChange('fanType', value)}
        placeholder="Например: Осевой, Центробежный"
      />
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: 315 мм"
      />
      <SpecField
        label="Напор"
        value={specs.pressure || ''}
        onChange={(value) => onSpecChange('pressure', value)}
        placeholder="Например: 200 Па"
      />
    </>
  );
};


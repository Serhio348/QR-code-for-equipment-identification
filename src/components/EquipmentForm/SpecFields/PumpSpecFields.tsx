/**
 * Поля спецификаций для типа "Насос"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface PumpSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const PumpSpecFields: React.FC<PumpSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 10 м³/ч"
      />
      <SpecField
        label="Напор"
        value={specs.pressure || ''}
        onChange={(value) => onSpecChange('pressure', value)}
        placeholder="Например: 50 м"
      />
      <SpecField
        label="Мощность"
        value={specs.power || ''}
        onChange={(value) => onSpecChange('power', value)}
        placeholder="Например: 5,5 кВт"
      />
      <SpecField
        label="Напряжение"
        value={specs.voltage || ''}
        onChange={(value) => onSpecChange('voltage', value)}
        placeholder="Например: 380 В"
      />
      <SpecField
        label="Диаметр подключения"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: DN50"
      />
    </>
  );
};


/**
 * Поля спецификаций для типа "Электрооборудование"
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

interface ElectricalSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
}

export const ElectricalSpecFields: React.FC<ElectricalSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
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
        label="Ток"
        value={specs.current || ''}
        onChange={(value) => onSpecChange('current', value)}
        placeholder="Например: 10 А"
      />
      <SpecField
        label="Тип оборудования"
        value={specs.equipmentType || ''}
        onChange={(value) => onSpecChange('equipmentType', value)}
        placeholder="Например: Электродвигатель, Щит управления"
      />
      <SpecField
        label="Класс защиты"
        value={specs.protectionClass || ''}
        onChange={(value) => onSpecChange('protectionClass', value)}
        placeholder="Например: IP54"
      />
    </>
  );
};


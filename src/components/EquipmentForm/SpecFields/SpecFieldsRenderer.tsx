/**
 * Компонент-роутер для выбора нужных полей спецификаций в зависимости от типа оборудования
 */

import React from 'react';
import { EquipmentType, EquipmentSpecs } from '../../../types/equipment';
import { FilterSpecFields } from './FilterSpecFields';
import { PumpSpecFields } from './PumpSpecFields';
import { TankSpecFields } from './TankSpecFields';
import { ValveSpecFields } from './ValveSpecFields';
import { ElectricalSpecFields } from './ElectricalSpecFields';
import { VentilationSpecFields } from './VentilationSpecFields';
import { PlumbingSpecFields } from './PlumbingSpecFields';
import { IndustrialSpecFields } from './IndustrialSpecFields';
import { OtherSpecFields } from './OtherSpecFields';

interface SpecFieldsRendererProps {
  type: EquipmentType;
  specs: EquipmentSpecs;
  onSpecChange: (key: string, value: string) => void;
  onSpecsChange?: (specs: EquipmentSpecs) => void;
}

export const SpecFieldsRenderer: React.FC<SpecFieldsRendererProps> = ({
  type,
  specs,
  onSpecChange,
  onSpecsChange
}) => {
  switch (type) {
    case 'filter':
      return <FilterSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'pump':
      return <PumpSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'tank':
      return <TankSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'valve':
      return <ValveSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'electrical':
      return <ElectricalSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'ventilation':
      return <VentilationSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'plumbing':
      return <PlumbingSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'industrial':
      return <IndustrialSpecFields specs={specs} onSpecChange={onSpecChange} />;
    case 'other':
      return <OtherSpecFields specs={specs} onSpecChange={onSpecsChange || (() => {})} />;
    default:
      return null;
  }
};


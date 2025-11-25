/**
 * Поля спецификаций для типа "Другое"
 * Позволяет вводить произвольные характеристики в формате JSON
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';

interface OtherSpecFieldsProps {
  specs: EquipmentSpecs;
  onSpecChange: (specs: EquipmentSpecs) => void;
}

export const OtherSpecFields: React.FC<OtherSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <div className="form-group">
      <label>Дополнительные характеристики (JSON):</label>
      <textarea
        value={JSON.stringify(specs, null, 2)}
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value);
            onSpecChange(parsed);
          } catch {
            // Игнорируем ошибки парсинга при вводе
          }
        }}
        placeholder='{"ключ": "значение"}'
        rows={5}
      />
    </div>
  );
};


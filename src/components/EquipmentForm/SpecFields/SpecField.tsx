/**
 * Универсальный компонент для поля спецификации
 */

import React from 'react';

interface SpecFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  required?: boolean;
}

export const SpecField: React.FC<SpecFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false
}) => {
  return (
    <div className="form-group">
      <label>{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
};


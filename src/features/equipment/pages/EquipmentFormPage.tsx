/**
 * Страница формы добавления/редактирования оборудования
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import EquipmentForm from '../components/EquipmentForm';
import './EquipmentFormPage.css';

const EquipmentFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = id && id !== 'new';

  return (
    <div className="equipment-form-page">
      <EquipmentForm equipmentId={isEditMode ? id : undefined} />
    </div>
  );
};

export default EquipmentFormPage;


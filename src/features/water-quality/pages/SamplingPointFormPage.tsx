/**
 * Страница формы создания/редактирования точки отбора проб
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import SamplingPointForm from '../components/SamplingPointForm';
import './SamplingPointFormPage.css';

const SamplingPointFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = id && id !== 'new';

  return (
    <div className="sampling-point-form-page">
      <SamplingPointForm pointId={isEditMode ? id : undefined} />
    </div>
  );
};

export default SamplingPointFormPage;

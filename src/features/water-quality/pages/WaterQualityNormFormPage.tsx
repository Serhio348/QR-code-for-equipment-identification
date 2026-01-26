/**
 * Страница формы создания/редактирования норматива качества воды
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import WaterQualityNormForm from '../components/WaterQualityNormForm';
import './WaterQualityNormFormPage.css';

const WaterQualityNormFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = id && id !== 'new';

  return (
    <div className="water-quality-norm-form-page">
      <WaterQualityNormForm normId={isEditMode ? id : undefined} />
    </div>
  );
};

export default WaterQualityNormFormPage;

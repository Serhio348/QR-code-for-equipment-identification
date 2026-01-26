/**
 * Страница формы добавления/редактирования анализа качества воды
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import WaterAnalysisForm from '../components/WaterAnalysisForm';
import './WaterAnalysisFormPage.css';

const WaterAnalysisFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = id && id !== 'new';

  return (
    <div className="water-analysis-form-page">
      <WaterAnalysisForm analysisId={isEditMode ? id : undefined} />
    </div>
  );
};

export default WaterAnalysisFormPage;

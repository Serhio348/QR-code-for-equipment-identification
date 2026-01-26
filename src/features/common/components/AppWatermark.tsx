/**
 * Компонент водяного знака приложения
 * Отображает информацию о создателе приложения
 */

import React from 'react';
import './AppWatermark.css';

interface AppWatermarkProps {
  developerName?: string;
  companyName?: string;
  year?: number;
}

const AppWatermark: React.FC<AppWatermarkProps> = ({
  developerName = 'Разработано',
  companyName = 'Ваша компания',
  year = new Date().getFullYear()
}) => {
  return (
    <div className="app-watermark">
      <span className="watermark-text">
        {developerName} {companyName} © {year}
      </span>
    </div>
  );
};

export default AppWatermark;


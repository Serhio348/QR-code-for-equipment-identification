/**
 * Компонент футера приложения
 * Отображает информацию о создателе приложения
 */

import React from 'react';
import './AppFooter.css';

const AppFooter: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <p className="footer-text">
          Разработано <span className="footer-developer">SIARHEI SIDAROVICH</span> © {currentYear}
        </p>
      </div>
    </footer>
  );
};

export default AppFooter;


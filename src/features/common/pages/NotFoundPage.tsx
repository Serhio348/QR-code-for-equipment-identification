/**
 * Страница 404 - не найдено
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../shared/utils/routes';
import './NotFoundPage.css';

const NotFoundPage: React.FC = () => {
  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <h1 className="not-found-title">404</h1>
        <h2 className="not-found-subtitle">Страница не найдена</h2>
        <p className="not-found-message">
          Запрашиваемая страница не существует или была перемещена.
        </p>
        <div className="not-found-actions">
          <Link to={ROUTES.HOME} className="not-found-button">
            ← Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;


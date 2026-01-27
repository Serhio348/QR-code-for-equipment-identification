import React from 'react';
import './LandingPage.css';

const LandingPage: React.FC = () => {
  const googleDriveUrl = 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon';
  const maintenanceLogUrl = window.location.href.split('#')[0] + '#/log';

  return (
    <div className="landing-page">
      <div className="landing-container">
        <h1>Фильтр обезжелезивания ФО-0,8-1,5</h1>
        <p className="subtitle">Полная информация и обслуживание</p>
        
        <div className="links-section">
          <a 
            href={googleDriveUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="link-card"
          >
            <div className="link-icon">📁</div>
            <h2>Документация</h2>
            <p>Полная техническая документация на Google Drive</p>
          </a>
          
          <a 
            href={maintenanceLogUrl}
            className="link-card"
          >
            <div className="link-icon">📝</div>
            <h2>Журнал обслуживания</h2>
            <p>Ведение записей обслуживания в режиме онлайн</p>
          </a>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;


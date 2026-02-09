import React from 'react';
import './ChatWidget.css';

interface QRButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export const QRButton: React.FC<QRButtonProps> = ({ disabled, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ai-chat-qr-btn"
      title="Сканировать QR-код оборудования"
    >
      📱
    </button>
  );
};

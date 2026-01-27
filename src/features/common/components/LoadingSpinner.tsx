/**
 * LoadingSpinner.tsx
 * 
 * Компонент индикатора загрузки
 */

import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ 
  size = 'medium', 
  text,
  fullScreen = false 
}: LoadingSpinnerProps) {
  const spinnerClass = `loading-spinner ${size} ${fullScreen ? 'full-screen' : ''}`;
  
  return (
    <div className={spinnerClass}>
      <div className="spinner-container">
        <div className="spinner"></div>
        {text && <p className="spinner-text">{text}</p>}
      </div>
    </div>
  );
}


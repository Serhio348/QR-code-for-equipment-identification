/**
 * ResetPasswordPage.tsx
 * 
 * Страница для обновления пароля по ссылке из email
 */

import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from '../services/supabaseAuthApi';
import { ROUTES } from '@/shared/utils/routes';
import './ResetPasswordPage.css';

/**
 * Парсит hash параметры из URL (после #)
 * Supabase передает токены в hash, а не в query параметрах
 */
function parseHashParams(): URLSearchParams {
  const hash = window.location.hash.substring(1); // Убираем #
  return new URLSearchParams(hash);
}

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  // Проверяем наличие токена в URL hash
  useEffect(() => {
    // Supabase передает токены в hash фрагменте URL (после #), а не в query параметрах
    // Например: /reset-password#access_token=...&type=recovery
    const hashParams = parseHashParams();
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    // Также проверяем query параметры на случай, если они есть
    const urlParams = new URLSearchParams(window.location.search);
    const queryAccessToken = urlParams.get('access_token');
    const queryType = urlParams.get('type');
    
    // Используем токен из hash (приоритет) или из query параметров
    const finalAccessToken = accessToken || queryAccessToken;
    const finalType = type || queryType;
    
    if (!finalAccessToken || finalType !== 'recovery') {
      // Если нет токена или тип не recovery, перенаправляем на страницу входа
      setTimeout(() => {
        navigate(ROUTES.LOGIN);
      }, 3000);
    }
  }, [navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Валидация
    if (!newPassword) {
      setError('Введите новый пароль');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      setLoading(false);
      return;
    }

    try {
      await updatePassword(newPassword);
      setSuccess(true);
      
      // Перенаправляем на страницу входа через 3 секунды
      setTimeout(() => {
        navigate(ROUTES.LOGIN);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка при обновлении пароля');
      setLoading(false);
    }
  };

  // Если успешно обновлен пароль
  if (success) {
    return (
      <div className="reset-password-page">
        <div className="reset-password-container">
          <div className="reset-password-header">
            <h1>✅ Пароль успешно обновлен</h1>
            <p>Ваш пароль был успешно изменен. Вы будете перенаправлены на страницу входа...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reset-password-page">
      <div className="reset-password-container">
        <div className="reset-password-header">
          <h1>Восстановление пароля</h1>
          <p>Введите новый пароль для вашего аккаунта</p>
        </div>

        <form onSubmit={handleSubmit} className="reset-password-form">
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="new-password">Новый пароль</label>
            <div className="password-input-wrapper">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Введите новый пароль"
                required
                autoComplete="new-password"
                disabled={loading}
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">Подтвердите пароль</label>
            <div className="password-input-wrapper">
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                required
                autoComplete="new-password"
                disabled={loading}
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
                aria-label={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="button-spinner"></span>
                Обновление...
              </>
            ) : (
              'Обновить пароль'
            )}
          </button>
        </form>

        <div className="reset-password-footer">
          <p>
            <a href={ROUTES.LOGIN} className="link">
              Вернуться к входу
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

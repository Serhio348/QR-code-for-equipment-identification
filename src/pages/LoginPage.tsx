/**
 * LoginPage.tsx
 * 
 * Страница входа пользователя
 */

import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { loadRedirectPath, clearRedirectPath, clearLastPath } from '../utils/pathStorage';
import { ROUTES } from '../utils/routes';
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Показываем загрузку при инициализации аутентификации
  useEffect(() => {
    if (authLoading) {
      return;
    }
    
    // Если уже авторизован, редиректим на главное меню
    // Используем redirectPath только если пользователь пытался зайти на защищенную страницу
    if (isAuthenticated) {
      // Очищаем сохраненный путь при логировании, чтобы не восстанавливать старую сессию
      clearLastPath();
      
      const redirectPath = loadRedirectPath();
      
      // Очищаем сохраненный путь редиректа
      if (redirectPath) {
        clearRedirectPath();
        navigate(redirectPath);
      } else {
        // Всегда на главное меню при логировании
        navigate(ROUTES.HOME);
      }
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Показываем индикатор загрузки при инициализации
  if (authLoading) {
    return <LoadingSpinner fullScreen text="Проверка сессии..." />;
  }

  // Если уже авторизован, показываем загрузку перед редиректом
  if (isAuthenticated) {
    return <LoadingSpinner fullScreen text="Перенаправление..." />;
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Валидация
    if (!email.trim()) {
      setError('Введите email');
      setLoading(false);
      return;
    }

    if (!password) {
      setError('Введите пароль');
      setLoading(false);
      return;
    }

    // Простая валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Неверный формат email');
      setLoading(false);
      return;
    }

    try {
      await login({ email: email.trim(), password });
      
      // Очищаем сохраненный путь при логировании, чтобы не восстанавливать старую сессию
      clearLastPath();
      
      // После успешного входа редирект на главное меню
      // Используем redirectPath только если пользователь пытался зайти на защищенную страницу
      const redirectPath = loadRedirectPath();
      
      // Очищаем сохраненный путь редиректа
      if (redirectPath) {
        clearRedirectPath();
        navigate(redirectPath);
      } else {
        // Всегда на главное меню при логировании
        navigate(ROUTES.HOME);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при входе. Проверьте email и пароль.');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>Вход в систему</h1>
          <p>Введите ваши учетные данные для входа</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                required
                autoComplete="current-password"
                disabled={loading}
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

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="button-spinner"></span>
                Вход...
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Нет аккаунта?{' '}
            <Link to="/register" className="link">
              Зарегистрироваться
            </Link>
          </p>
          {/* TODO: Добавить ссылку "Забыли пароль?" когда будет реализовано */}
        </div>
      </div>
    </div>
  );
}


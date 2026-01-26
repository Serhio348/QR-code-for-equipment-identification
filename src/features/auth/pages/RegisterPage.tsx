/**
 * RegisterPage.tsx
 * 
 * Страница регистрации нового пользователя
 */

import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import { loadRedirectPath, clearRedirectPath, clearLastPath } from '../../../shared/utils/pathStorage';
import { ROUTES } from '../../../shared/utils/routes';
import './RegisterPage.css';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Показываем загрузку при инициализации аутентификации
  useEffect(() => {
    if (authLoading) {
      return;
    }
    
    // Если уже авторизован, редиректим на главное меню
    // Используем redirectPath только если пользователь пытался зайти на защищенную страницу
    if (isAuthenticated) {
      // Очищаем сохраненный путь при регистрации, чтобы не восстанавливать старую сессию
      clearLastPath();
      
      const redirectPath = loadRedirectPath();
      
      // Очищаем сохраненный путь редиректа
      if (redirectPath) {
        clearRedirectPath();
        navigate(redirectPath);
      } else {
        // Всегда на главное меню при регистрации
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

  const validateForm = (): string | null => {
    // Валидация email
    if (!email.trim()) {
      return 'Введите email';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return 'Неверный формат email';
    }

    // Валидация пароля
    if (!password) {
      return 'Введите пароль';
    }

    if (password.length < 6) {
      return 'Пароль должен содержать минимум 6 символов';
    }

    if (password.length > 128) {
      return 'Пароль не должен превышать 128 символов';
    }

    // Проверка совпадения паролей
    if (password !== confirmPassword) {
      return 'Пароли не совпадают';
    }

    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Валидация
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      
      // Очищаем сохраненный путь при регистрации, чтобы не восстанавливать старую сессию
      clearLastPath();
      
      // После успешной регистрации редирект на главное меню
      // Используем redirectPath только если пользователь пытался зайти на защищенную страницу
      const redirectPath = loadRedirectPath();
      
      // Очищаем сохраненный путь редиректа
      if (redirectPath) {
        clearRedirectPath();
        navigate(redirectPath);
      } else {
        // Всегда на главное меню при регистрации
        navigate(ROUTES.HOME);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при регистрации. Попробуйте еще раз.');
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <div className="register-header">
          <h1>Регистрация</h1>
          <p>Создайте новый аккаунт для доступа к системе</p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email *</label>
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
            <label htmlFor="name">Имя (необязательно)</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              autoComplete="name"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль *</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                required
                autoComplete="new-password"
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
            <small className="password-hint">
              Минимум 6 символов, максимум 128 символов
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Подтверждение пароля *</label>
            <div className="password-input-wrapper">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                required
                autoComplete="new-password"
                disabled={loading}
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
            {password && confirmPassword && password !== confirmPassword && (
              <small className="password-error">
                Пароли не совпадают
              </small>
            )}
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="button-spinner"></span>
                Регистрация...
              </>
            ) : (
              'Зарегистрироваться'
            )}
          </button>
        </form>

        <div className="register-footer">
          <p>
            Уже есть аккаунт?{' '}
            <Link to="/login" className="link">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}


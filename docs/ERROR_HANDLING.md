# Документация по обработке ошибок

Централизованная система обработки ошибок приложения для улучшения UX и упрощения поддержки.

## 📋 Содержание

- [Обзор](#обзор)
- [Быстрый старт](#быстрый-старт)
- [API](#api)
- [Примеры использования](#примеры-использования)
- [Типы ошибок](#типы-ошибок)
- [Toast уведомления](#toast-уведомления)
- [Best Practices](#best-practices)

---

## Обзор

Система обработки ошибок состоит из двух основных компонентов:

1. **errorHandler.ts** - преобразование технических ошибок в понятные сообщения
2. **toast.ts** - отображение уведомлений пользователю

### Преимущества

- ✅ Понятные сообщения для пользователей
- ✅ Централизованная обработка ошибок
- ✅ Автоматическое логирование
- ✅ Типизированные ошибки
- ✅ Единообразный UX

---

## Быстрый старт

### 1. Импорт утилит

```typescript
import { showError, showSuccess } from '../utils/toast';
import { handleError, AppError, ErrorCode } from '../utils/errorHandler';
```

### 2. Базовое использование

```typescript
try {
  await someAsyncOperation();
  showSuccess('Операция выполнена успешно');
} catch (error) {
  showError(error); // Автоматически преобразует ошибку в понятное сообщение
}
```

---

## API

### errorHandler.ts

#### `handleError(error: unknown): string`

Преобразует любую ошибку в понятное сообщение для пользователя.

```typescript
import { handleError } from '../utils/errorHandler';

try {
  await login(email, password);
} catch (error) {
  const message = handleError(error);
  console.log(message); // "Неверный email или пароль"
}
```

#### `AppError` класс

Кастомный класс ошибки с пользовательским сообщением.

```typescript
import { AppError, ErrorCode } from '../utils/errorHandler';

throw new AppError(
  'Technical error message',
  ErrorCode.INVALID_CREDENTIALS,
  'Неверный email или пароль'
);
```

#### `createAppError()`

Создает AppError из любого типа ошибки.

```typescript
import { createAppError, ErrorCode } from '../utils/errorHandler';

const appError = createAppError(
  error,
  ErrorCode.NETWORK_ERROR,
  'Проблема с подключением к серверу'
);
```

#### `logError()`

Логирует ошибку с контекстом.

```typescript
import { logError } from '../utils/errorHandler';

try {
  await operation();
} catch (error) {
  logError(error, { function: 'operation', params: { id: 123 } });
}
```

### toast.ts

#### `showSuccess(message: string, options?: ToastOptions)`

Показывает успешное уведомление.

```typescript
import { showSuccess } from '../utils/toast';

showSuccess('Данные сохранены');
```

#### `showError(error: unknown, options?: ToastOptions)`

Показывает уведомление об ошибке. Автоматически обрабатывает ошибку.

```typescript
import { showError } from '../utils/toast';

try {
  await operation();
} catch (error) {
  showError(error); // Автоматически преобразует ошибку
}
```

#### `showInfo(message: string, options?: ToastOptions)`

Показывает информационное уведомление.

```typescript
import { showInfo } from '../utils/toast';

showInfo('Проверьте вашу почту');
```

#### `showWarning(message: string, options?: ToastOptions)`

Показывает предупреждение.

```typescript
import { showWarning } from '../utils/toast';

showWarning('Данные будут удалены');
```

#### `showToast(type, message, options?)`

Универсальная функция для показа toast.

```typescript
import { showToast } from '../utils/toast';

showToast('success', 'Операция выполнена');
showToast('error', error); // Автоматически обрабатывает ошибку
```

---

## Примеры использования

### Пример 1: Обработка ошибок входа

```typescript
import { showError, showSuccess } from '../utils/toast';

const handleLogin = async (email: string, password: string) => {
  try {
    await login({ email, password });
    showSuccess('Вход выполнен успешно');
    navigate('/home');
  } catch (error) {
    showError(error); // Автоматически покажет "Неверный email или пароль" или другое понятное сообщение
  }
};
```

### Пример 2: Обработка сетевых ошибок

```typescript
import { showError, showSuccess } from '../utils/toast';
import { AppError, ErrorCode } from '../utils/errorHandler';

const fetchData = async () => {
  try {
    const data = await apiRequest('/data');
    showSuccess('Данные загружены');
    return data;
  } catch (error) {
    // Автоматически определит сетевую ошибку и покажет понятное сообщение
    showError(error);
    throw error;
  }
};
```

### Пример 3: Создание кастомной ошибки

```typescript
import { AppError, ErrorCode } from '../utils/errorHandler';
import { showError } from '../utils/toast';

const validateEmail = (email: string) => {
  if (!email.includes('@')) {
    throw new AppError(
      'Invalid email format',
      ErrorCode.INVALID_EMAIL,
      'Неверный формат email адреса'
    );
  }
};

try {
  validateEmail('invalid-email');
} catch (error) {
  showError(error); // Покажет "Неверный формат email адреса"
}
```

### Пример 4: Обработка с логированием

```typescript
import { showError, logError } from '../utils/errorHandler';

const saveData = async (data: any) => {
  try {
    await saveToDatabase(data);
  } catch (error) {
    logError(error, { 
      function: 'saveData', 
      data: { id: data.id } 
    });
    showError(error);
  }
};
```

### Пример 5: Комбинирование с локальным state

```typescript
import { useState } from 'react';
import { showError, showSuccess } from '../utils/toast';

const MyComponent = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      await submitForm();
      showSuccess('Форма отправлена успешно');
    } catch (err) {
      const message = handleError(err);
      setError(message); // Для отображения в форме
      showError(err); // Для toast уведомления
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}
      {/* ... */}
    </form>
  );
};
```

---

## Типы ошибок

### ErrorCode enum

```typescript
enum ErrorCode {
  // Сетевые ошибки
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CORS_ERROR = 'CORS_ERROR',
  
  // Ошибки аутентификации
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Ошибки валидации
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_EMAIL = 'INVALID_EMAIL',
  
  // Ошибки доступа
  ACCESS_DENIED = 'ACCESS_DENIED',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',
  
  // И другие...
}
```

### Автоматическое определение ошибок

Система автоматически определяет тип ошибки по сообщению:

- `"Failed to fetch"` → Сетевая ошибка
- `"Invalid login credentials"` → Неверные учетные данные
- `"User not found"` → Пользователь не найден
- `"Session expired"` → Сессия истекла
- И другие...

---

## Toast уведомления

### Настройка

Toast уведомления уже настроены в `App.tsx`. Они отображаются в правом верхнем углу.

### Позиции

- `top-right` (по умолчанию)
- `top-left`
- `bottom-right`
- `bottom-left`
- `top-center`
- `bottom-center`

### Кастомизация

```typescript
showSuccess('Сообщение', {
  position: 'top-center',
  autoClose: 3000,
  hideProgressBar: true,
});
```

### Стили

Toast уведомления используют тему приложения и автоматически адаптируются под мобильные устройства.

---

## Best Practices

### 1. Всегда используйте showError для ошибок

```typescript
// ✅ Хорошо
try {
  await operation();
} catch (error) {
  showError(error);
}

// ❌ Плохо
try {
  await operation();
} catch (error) {
  alert(error.message);
}
```

### 2. Используйте showSuccess для успешных операций

```typescript
// ✅ Хорошо
await saveData();
showSuccess('Данные сохранены');

// ❌ Плохо
await saveData();
// Нет обратной связи пользователю
```

### 3. Логируйте ошибки с контекстом

```typescript
// ✅ Хорошо
try {
  await operation();
} catch (error) {
  logError(error, { function: 'operation', userId: user.id });
  showError(error);
}

// ❌ Плохо
try {
  await operation();
} catch (error) {
  showError(error);
  // Нет логирования
}
```

### 4. Создавайте AppError для кастомных ошибок

```typescript
// ✅ Хорошо
if (!hasPermission) {
  throw new AppError(
    'User does not have permission',
    ErrorCode.ACCESS_DENIED,
    'У вас нет доступа к этому разделу'
  );
}

// ❌ Плохо
if (!hasPermission) {
  throw new Error('User does not have permission');
}
```

### 5. Комбинируйте toast и локальный state

```typescript
// ✅ Хорошо
const [error, setError] = useState<string | null>(null);

try {
  await operation();
} catch (err) {
  const message = handleError(err);
  setError(message); // Для формы
  showError(err); // Для toast
}

// ❌ Плохо
try {
  await operation();
} catch (err) {
  showError(err);
  // Нет отображения ошибки в форме
}
```

### 6. Не дублируйте сообщения

```typescript
// ✅ Хорошо
try {
  await operation();
  showSuccess('Операция выполнена');
} catch (error) {
  showError(error);
}

// ❌ Плохо
try {
  await operation();
  showSuccess('Операция выполнена');
  alert('Операция выполнена'); // Дублирование
} catch (error) {
  showError(error);
  alert(error.message); // Дублирование
}
```

---

## Миграция существующего кода

### До

```typescript
try {
  await login(email, password);
} catch (err: any) {
  setError(err.message || 'Ошибка при входе');
}
```

### После

```typescript
import { showError, showSuccess } from '../utils/toast';

try {
  await login(email, password);
  showSuccess('Вход выполнен успешно');
} catch (err: any) {
  showError(err); // Автоматически покажет понятное сообщение
  setError(err.message || 'Ошибка при входе'); // Для формы (если нужно)
}
```

---

## Troubleshooting

### Toast не отображается

**Решение:** Убедитесь, что `ToastContainer` добавлен в `App.tsx`:

```typescript
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// В компоненте
<ToastContainer />
```

### Сообщения об ошибках не понятны

**Решение:** Используйте `AppError` для создания кастомных ошибок:

```typescript
throw new AppError(
  'Technical message',
  ErrorCode.CUSTOM_ERROR,
  'Понятное сообщение для пользователя'
);
```

### Ошибки не логируются

**Решение:** Используйте `logError()` перед `showError()`:

```typescript
try {
  await operation();
} catch (error) {
  logError(error, { context: 'operation' });
  showError(error);
}
```

---

## Дополнительные ресурсы

- [react-toastify документация](https://fkhadra.github.io/react-toastify/)
- [Error Handling Best Practices](https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript)

---

**Дата создания:** 2024  
**Версия:** 1.0.0

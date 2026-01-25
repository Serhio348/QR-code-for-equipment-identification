# План миграции с Supabase на собственный сервер

**Дата создания:** 2024  
**Версия:** 1.0  
**Статус:** План миграции

---

## 📋 Содержание

1. [Обзор миграции](#обзор-миграции)
2. [Архитектура собственного сервера](#архитектура-собственного-сервера)
3. [Миграция базы данных PostgreSQL](#миграция-базы-данных-postgresql)
4. [Миграция системы аутентификации](#миграция-системы-аутентификации)
5. [Миграция файлового хранилища](#миграция-файлового-хранилища)
6. [Миграция API клиентов](#миграция-api-клиентов)
7. [Миграция cron jobs](#миграция-cron-jobs)
8. [План развертывания](#план-развертывания)
9. [Чеклист миграции](#чеклист-миграции)

---

## 🎯 Обзор миграции

### Текущая архитектура (Supabase)

- **База данных:** PostgreSQL (Supabase)
- **Аутентификация:** Supabase Auth (JWT токены)
- **Файловое хранилище:** Supabase Storage (S3-совместимое)
- **API:** Прямые запросы к Supabase через клиентский SDK
- **Cron jobs:** Railway cron jobs с Service Role key

### Целевая архитектура (Собственный сервер)

- **База данных:** PostgreSQL (собственный сервер)
- **Аутентификация:** Собственный сервер (JWT токены, bcrypt)
- **Файловое хранилище:** Локальное хранилище или S3-совместимое (MinIO)
- **API:** REST API на Node.js/Express или Fastify
- **Cron jobs:** Системный cron или node-cron

### Компоненты для миграции

1. ✅ **PostgreSQL база данных** - все таблицы, функции, триггеры, RLS политики
2. ✅ **Система аутентификации** - регистрация, вход, восстановление пароля, сессии
3. ✅ **Файловое хранилище** - PDF файлы анализов качества воды
4. ✅ **API клиенты** - переписать на собственный backend API
5. ✅ **Cron jobs** - сбор данных Beliot

---

## 🏗️ Архитектура собственного сервера

### Рекомендуемый стек

**Backend:**
- **Node.js 20+** - runtime
- **Express.js** или **Fastify** - веб-фреймворк
- **PostgreSQL** - база данных
- **pg** (node-postgres) - драйвер PostgreSQL
- **jsonwebtoken** - JWT токены
- **bcrypt** - хеширование паролей
- **nodemailer** - отправка email (восстановление пароля)
- **multer** - загрузка файлов
- **node-cron** - cron jobs

**Frontend:**
- **React 18** - без изменений
- **Axios** или **fetch** - HTTP клиент (вместо Supabase SDK)
- **react-router-dom** - без изменений

### Структура проекта

```
backend/
├── src/
│   ├── config/
│   │   ├── database.ts          # Подключение к PostgreSQL
│   │   ├── jwt.ts               # Настройки JWT
│   │   └── storage.ts           # Настройки файлового хранилища
│   ├── models/                  # Модели данных (опционально, можно использовать raw SQL)
│   ├── routes/
│   │   ├── auth.ts              # Маршруты аутентификации
│   │   ├── water-quality.ts     # Маршруты качества воды
│   │   ├── beliot.ts            # Маршруты Beliot
│   │   └── equipment.ts         # Маршруты оборудования
│   ├── middleware/
│   │   ├── auth.ts              # Middleware аутентификации
│   │   ├── rls.ts               # Эмуляция RLS политик
│   │   └── error-handler.ts     # Обработка ошибок
│   ├── services/
│   │   ├── auth.service.ts      # Сервис аутентификации
│   │   ├── user.service.ts      # Сервис пользователей
│   │   ├── water-quality.service.ts
│   │   └── storage.service.ts   # Сервис файлового хранилища
│   ├── utils/
│   │   ├── db.ts                # Утилиты для работы с БД
│   │   └── validators.ts        # Валидация данных
│   └── cron/
│       └── collect-beliot-readings.ts
├── storage/                     # Локальное хранилище файлов
│   └── water-quality-analysis/
└── package.json
```

---

## 🗄️ Миграция базы данных PostgreSQL

### Шаг 1: Экспорт схемы из Supabase

1. **Экспорт структуры БД:**
   ```bash
   # Используя pg_dump для экспорта только структуры
   pg_dump -h <supabase-host> -U postgres -d postgres \
     --schema-only --no-owner --no-privileges \
     -f supabase-schema-export.sql
   ```

2. **Экспорт данных:**
   ```bash
   # Экспорт данных (без структуры)
   pg_dump -h <supabase-host> -U postgres -d postgres \
     --data-only --no-owner --no-privileges \
     -f supabase-data-export.sql
   ```

3. **Альтернатива: Использовать существующие SQL файлы:**
   - `docs/supabase-schema.sql` - основная схема
   - `docs/migrations/*.sql` - миграции

### Шаг 2: Адаптация схемы для собственного сервера

**Изменения, которые нужно внести:**

1. **Удалить зависимости от `auth.users`:**
   ```sql
   -- БЫЛО (Supabase):
   id UUID REFERENCES auth.users(id) ON DELETE CASCADE
   
   -- СТАНЕТ (Собственный сервер):
   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   -- Создать отдельную таблицу users
   ```

2. **Создать таблицу `users` вместо `auth.users`:**
   ```sql
   CREATE TABLE public.users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     email_verified BOOLEAN DEFAULT false,
     email_verification_token TEXT,
     password_reset_token TEXT,
     password_reset_expires TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Обновить все внешние ключи:**
   ```sql
   -- Заменить все REFERENCES auth.users(id) на REFERENCES public.users(id)
   ```

4. **Адаптировать функции с `auth.uid()`:**
   ```sql
   -- БЫЛО (Supabase):
   WHERE id = auth.uid()
   
   -- СТАНЕТ (Собственный сервер):
   -- Передавать user_id как параметр функции
   WHERE id = p_user_id
   ```

5. **Адаптировать RLS политики:**
   - RLS политики нужно будет эмулировать в middleware на уровне приложения
   - Или отключить RLS и использовать только middleware

### Шаг 3: Импорт в собственную БД

1. **Создать базу данных:**
   ```sql
   CREATE DATABASE equipment_management;
   ```

2. **Применить схему:**
   ```bash
   psql -U postgres -d equipment_management -f supabase-schema-adapted.sql
   ```

3. **Импортировать данные:**
   ```bash
   psql -U postgres -d equipment_management -f supabase-data-export.sql
   ```

### Шаг 4: Миграция данных пользователей

**ВАЖНО:** Пароли в Supabase хранятся в зашифрованном виде и не могут быть экспортированы.

**Варианты решения:**

1. **Попросить пользователей сбросить пароли:**
   - После миграции пользователи должны использовать "Восстановление пароля"
   - Отправить email всем пользователям с инструкциями

2. **Временный пароль:**
   - Сгенерировать временные пароли для всех пользователей
   - Отправить их по email

3. **Параллельная работа:**
   - Оставить Supabase для аутентификации на время миграции
   - Постепенно мигрировать пользователей

---

## 🔐 Миграция системы аутентификации

### Шаг 1: Создание API аутентификации

**Файл: `backend/src/routes/auth.ts`**

```typescript
import express from 'express';
import { register, login, logout, resetPassword, verifyEmail } from '../services/auth.service';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Регистрация
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = await register({ email, password, name });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Вход
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login({ email, password });
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// Выход
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await logout(req.user!.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Восстановление пароля (запрос)
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    await resetPassword(email);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Восстановление пароля (подтверждение)
router.post('/reset-password/confirm', async (req, res) => {
  try {
    const { token, password } = req.body;
    await confirmPasswordReset(token, password);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
```

### Шаг 2: Сервис аутентификации

**Файл: `backend/src/services/auth.service.ts`**

```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';
import { sendEmail } from '../utils/email';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = '8h';

export async function register(data: { email: string; password: string; name?: string }) {
  // 1. Проверка существования пользователя
  const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existingUser.rows.length > 0) {
    throw new Error('Пользователь с таким email уже существует');
  }

  // 2. Хеширование пароля
  const passwordHash = await bcrypt.hash(data.password, 10);

  // 3. Создание пользователя
  const result = await db.query(
    `INSERT INTO users (email, password_hash, email_verified)
     VALUES ($1, $2, false)
     RETURNING id, email, created_at`,
    [data.email, passwordHash]
  );

  const user = result.rows[0];

  // 4. Создание профиля (через триггер или вручную)
  await db.query(
    `INSERT INTO profiles (id, email, name, role)
     VALUES ($1, $2, $3, 'user')
     ON CONFLICT (id) DO NOTHING`,
    [user.id, data.email, data.name || '']
  );

  // 5. Создание записи доступа
  await db.query(
    `INSERT INTO user_app_access (user_id, equipment, water)
     VALUES ($1, false, false)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );

  // 6. Генерация JWT токена
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  // 7. Логирование входа
  await db.query(
    `INSERT INTO login_history (user_id, success, login_at)
     VALUES ($1, true, NOW())`,
    [user.id]
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      name: data.name,
      role: 'user',
    },
    token,
  };
}

export async function login(data: { email: string; password: string }) {
  // 1. Поиск пользователя
  const userResult = await db.query(
    `SELECT u.id, u.email, u.password_hash, p.name, p.role
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.email = $1`,
    [data.email]
  );

  if (userResult.rows.length === 0) {
    await db.query(
      `INSERT INTO login_history (user_id, success, failure_reason, login_at)
       VALUES (NULL, false, 'User not found', NOW())`
    );
    throw new Error('Неверный email или пароль');
  }

  const user = userResult.rows[0];

  // 2. Проверка пароля
  const passwordMatch = await bcrypt.compare(data.password, user.password_hash);
  if (!passwordMatch) {
    await db.query(
      `INSERT INTO login_history (user_id, success, failure_reason, login_at)
       VALUES ($1, false, 'Invalid password', NOW())`,
      [user.id]
    );
    throw new Error('Неверный email или пароль');
  }

  // 3. Обновление last_login_at
  await db.query(
    `UPDATE profiles SET last_login_at = NOW() WHERE id = $1`,
    [user.id]
  );

  // 4. Генерация JWT токена
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  // 5. Логирование успешного входа
  await db.query(
    `INSERT INTO login_history (user_id, success, login_at)
     VALUES ($1, true, NOW())`,
    [user.id]
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
    },
    token,
  };
}

export async function logout(userId: string) {
  // Можно добавить blacklist токенов в Redis или БД
  // Пока просто возвращаем success
  return { success: true };
}
```

### Шаг 3: Middleware аутентификации

**Файл: `backend/src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

    // Получаем актуальные данные пользователя
    const result = await db.query(
      `SELECT u.id, u.email, p.role, p.name
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = {
      id: result.rows[0].id,
      email: result.rows[0].email,
      role: result.rows[0].role || 'user',
    };

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: 'Требуется аутентификация' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Требуются права администратора' });
  }

  next();
}
```

### Шаг 4: Обновление фронтенда

**Файл: `src/config/api.ts` (новый)**

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem('auth_token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Request failed');
  }

  return response;
}
```

**Файл: `src/services/api/authApi.ts` (обновленный)**

```typescript
import { apiRequest } from '../../config/api';

export async function register(data: { email: string; password: string; name?: string }) {
  const response = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const result = await response.json();
  
  // Сохраняем токен
  if (result.token) {
    localStorage.setItem('auth_token', result.token);
  }

  return result;
}

export async function login(data: { email: string; password: string }) {
  const response = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const result = await response.json();
  
  // Сохраняем токен
  if (result.token) {
    localStorage.setItem('auth_token', result.token);
  }

  return result;
}

export async function logout() {
  await apiRequest('/api/auth/logout', {
    method: 'POST',
  });

  localStorage.removeItem('auth_token');
}
```

---

## 📁 Миграция файлового хранилища

### Вариант 1: Локальное хранилище

**Файл: `backend/src/services/storage.service.ts`**

```typescript
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';

const STORAGE_DIR = process.env.STORAGE_DIR || './storage/water-quality-analysis';

// Создаем директорию, если не существует
await fs.mkdir(STORAGE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const analysisId = req.body.analysisId || req.params.id;
    const dir = path.join(STORAGE_DIR, analysisId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${sanitizedName}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 МБ
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Поддерживаются только PDF файлы'));
    }
  },
});

export async function getFileUrl(analysisId: string, filename: string): Promise<string> {
  // Возвращаем URL для доступа к файлу через API
  return `/api/storage/water-quality-analysis/${analysisId}/${filename}`;
}

export async function deleteFile(analysisId: string, filename: string): Promise<void> {
  const filePath = path.join(STORAGE_DIR, analysisId, filename);
  await fs.unlink(filePath);
}
```

**Файл: `backend/src/routes/storage.ts`**

```typescript
import express from 'express';
import { upload, getFileUrl, deleteFile } from '../services/storage.service';
import { authenticateToken } from '../middleware/auth';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Загрузка файла
router.post(
  '/water-quality-analysis/:analysisId',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { analysisId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Файл не загружен' });
      }

      const url = await getFileUrl(analysisId, file.filename);
      res.json({ url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Получение файла
router.get(
  '/water-quality-analysis/:analysisId/:filename',
  authenticateToken,
  async (req, res) => {
    try {
      const { analysisId, filename } = req.params;
      const filePath = path.join(
        process.env.STORAGE_DIR || './storage/water-quality-analysis',
        analysisId,
        filename
      );

      // Проверка существования файла
      await fs.access(filePath);

      res.sendFile(path.resolve(filePath));
    } catch (error: any) {
      res.status(404).json({ error: 'Файл не найден' });
    }
  }
);

// Удаление файла
router.delete(
  '/water-quality-analysis/:analysisId/:filename',
  authenticateToken,
  async (req, res) => {
    try {
      const { analysisId, filename } = req.params;
      await deleteFile(analysisId, filename);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
```

### Вариант 2: MinIO (S3-совместимое хранилище)

**Установка:**
```bash
npm install minio
```

**Файл: `backend/src/services/storage.service.ts` (MinIO)**

```typescript
import MinIO from 'minio';

const minioClient = new MinIO.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const BUCKET_NAME = 'water-quality-analysis';

// Создаем bucket, если не существует
async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET_NAME);
  if (!exists) {
    await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
  }
}

ensureBucket();

export async function uploadFile(
  analysisId: string,
  file: Buffer,
  filename: string
): Promise<string> {
  const objectName = `${analysisId}/${Date.now()}_${filename}`;
  
  await minioClient.putObject(BUCKET_NAME, objectName, file);
  
  // Генерируем presigned URL (действителен 7 дней)
  const url = await minioClient.presignedGetObject(BUCKET_NAME, objectName, 7 * 24 * 60 * 60);
  
  return url;
}

export async function deleteFile(analysisId: string, filename: string): Promise<void> {
  const objectName = `${analysisId}/${filename}`;
  await minioClient.removeObject(BUCKET_NAME, objectName);
}
```

### Миграция файлов из Supabase Storage

**Скрипт миграции: `scripts/migrate-storage.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import { MinIO } from 'minio';
import fs from 'fs/promises';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const minioClient = new MinIO.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

async function migrateFiles() {
  // 1. Получаем список всех файлов из Supabase Storage
  const { data: files, error } = await supabase.storage
    .from('water-quality-analysis')
    .list('', { limit: 1000, recursive: true });

  if (error) {
    console.error('Ошибка получения файлов:', error);
    return;
  }

  // 2. Загружаем каждый файл
  for (const file of files) {
    try {
      // Скачиваем файл из Supabase
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('water-quality-analysis')
        .download(file.name);

      if (downloadError) {
        console.error(`Ошибка загрузки ${file.name}:`, downloadError);
        continue;
      }

      // Загружаем в MinIO
      const buffer = Buffer.from(await fileData.arrayBuffer());
      await minioClient.putObject('water-quality-analysis', file.name, buffer);

      console.log(`✅ Мигрирован: ${file.name}`);
    } catch (error) {
      console.error(`❌ Ошибка миграции ${file.name}:`, error);
    }
  }

  console.log('✅ Миграция файлов завершена');
}

migrateFiles();
```

---

## 🔌 Миграция API клиентов

### Шаг 1: Создание универсального API клиента

**Файл: `src/services/api/apiClient.ts`**

```typescript
import { apiRequest } from '../../config/api';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || '';
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await apiRequest(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
    });
    return response.json();
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await apiRequest(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const response = await apiRequest(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await apiRequest(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
    });
    return response.json();
  }
}

export const apiClient = new ApiClient('/api');
```

### Шаг 2: Переписать API для качества воды

**Файл: `src/services/api/waterQuality/waterAnalysis.ts` (обновленный)**

```typescript
import { apiClient } from '../apiClient';

export async function getWaterAnalyses(filters?: {
  samplingPointId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.samplingPointId) params.append('samplingPointId', filters.samplingPointId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  return apiClient.get(`/water-quality/analysis?${params.toString()}`);
}

export async function getWaterAnalysis(id: string) {
  return apiClient.get(`/water-quality/analysis/${id}`);
}

export async function createWaterAnalysis(data: any) {
  return apiClient.post('/water-quality/analysis', data);
}

export async function updateWaterAnalysis(id: string, data: any) {
  return apiClient.put(`/water-quality/analysis/${id}`, data);
}

export async function deleteWaterAnalysis(id: string) {
  return apiClient.delete(`/water-quality/analysis/${id}`);
}
```

### Шаг 3: Создание backend API

**Файл: `backend/src/routes/water-quality.ts`**

```typescript
import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { db } from '../config/database';

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// Получить список анализов
router.get('/analysis', async (req, res) => {
  try {
    const { samplingPointId, startDate, endDate } = req.query;

    let query = `
      SELECT wa.*, sp.name as sampling_point_name
      FROM water_analysis wa
      LEFT JOIN sampling_points sp ON sp.id = wa.sampling_point_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (samplingPointId) {
      query += ` AND wa.sampling_point_id = $${paramIndex++}`;
      params.push(samplingPointId);
    }

    if (startDate) {
      query += ` AND wa.sample_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND wa.sample_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY wa.sample_date DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Получить анализ по ID
router.get('/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT wa.*, sp.name as sampling_point_name
       FROM water_analysis wa
       LEFT JOIN sampling_points sp ON sp.id = wa.sampling_point_id
       WHERE wa.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Анализ не найден' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Создать анализ
router.post('/analysis', async (req, res) => {
  try {
    const {
      samplingPointId,
      sampleDate,
      sampledBy,
      analyzedBy,
      notes,
    } = req.body;

    const result = await db.query(
      `INSERT INTO water_analysis (
        sampling_point_id,
        sample_date,
        sampled_by,
        analyzed_by,
        notes,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, 'in_progress', $6)
      RETURNING *`,
      [samplingPointId, sampleDate, sampledBy, analyzedBy, notes, req.user!.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Обновить анализ
router.put('/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Динамически строим запрос UPDATE
    const setClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.keys(updates).forEach((key) => {
      if (key !== 'id') {
        setClause.push(`${key} = $${paramIndex++}`);
        params.push(updates[key]);
      }
    });

    params.push(id);

    const result = await db.query(
      `UPDATE water_analysis
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Анализ не найден' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Удалить анализ
router.delete('/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM water_analysis WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

---

## ⏰ Миграция cron jobs

### Шаг 1: Адаптация скрипта сбора данных

**Файл: `backend/src/cron/collect-beliot-readings.ts`**

```typescript
import { db } from '../config/database';
// ... остальной код из scripts/collect-beliot-readings.ts
// Заменить supabase.rpc() на прямой SQL запрос

// БЫЛО:
// await supabase.rpc('insert_beliot_reading', {...})

// СТАНЕТ:
await db.query(
  `SELECT insert_beliot_reading($1, $2, $3, $4, $5, $6, $7)`,
  [deviceId, readingDate, readingValue, unit, readingType, source, period]
);
```

### Шаг 2: Настройка node-cron

**Файл: `backend/src/server.ts`**

```typescript
import cron from 'node-cron';
import { collectReadings } from './cron/collect-beliot-readings';

// Запуск каждый час в 0 минут
cron.schedule('0 * * * *', async () => {
  console.log('🔄 Запуск сбора показаний Beliot...');
  try {
    await collectReadings();
    console.log('✅ Сбор показаний завершен');
  } catch (error) {
    console.error('❌ Ошибка сбора показаний:', error);
  }
});

console.log('✅ Cron jobs настроены');
```

---

## 🚀 План развертывания

### Этап 1: Подготовка инфраструктуры

1. **Установка PostgreSQL:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install postgresql postgresql-contrib
   
   # Создание базы данных
   sudo -u postgres createdb equipment_management
   sudo -u postgres createuser equipment_user
   sudo -u postgres psql -c "ALTER USER equipment_user WITH PASSWORD 'secure_password';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE equipment_management TO equipment_user;"
   ```

2. **Установка Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Установка Nginx:**
   ```bash
   sudo apt-get install nginx
   ```

4. **Установка MinIO (опционально):**
   ```bash
   wget https://dl.min.io/server/minio/release/linux-amd64/minio
   chmod +x minio
   sudo mv minio /usr/local/bin/
   
   # Создать директорию для данных
   sudo mkdir -p /data/minio
   sudo chown $USER:$USER /data/minio
   
   # Запуск MinIO
   minio server /data/minio
   ```

### Этап 2: Развертывание backend

1. **Клонирование и установка:**
   ```bash
   git clone <repository-url>
   cd backend
   npm install
   ```

2. **Настройка переменных окружения:**
   ```bash
   cp .env.example .env
   # Отредактировать .env
   ```

3. **Применение миграций БД:**
   ```bash
   psql -U equipment_user -d equipment_management -f ../docs/supabase-schema-adapted.sql
   ```

4. **Запуск backend:**
   ```bash
   npm run build
   npm start
   ```

### Этап 3: Настройка Nginx

**Файл: `/etc/nginx/sites-available/equipment-management`**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend (React)
    location / {
        root /var/www/equipment-management/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Storage (файлы)
    location /storage {
        alias /var/www/equipment-management/storage;
        add_header Content-Disposition "attachment";
    }
}
```

**Активация:**
```bash
sudo ln -s /etc/nginx/sites-available/equipment-management /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Этап 4: Настройка PM2 (процесс-менеджер)

```bash
npm install -g pm2

# Запуск backend
pm2 start dist/server.js --name equipment-backend

# Автозапуск при перезагрузке
pm2 startup
pm2 save
```

### Этап 5: Настройка SSL (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## ✅ Чеклист миграции

### Подготовка

- [ ] Резервное копирование данных из Supabase
- [ ] Экспорт схемы БД
- [ ] Экспорт данных БД
- [ ] Экспорт файлов из Supabase Storage
- [ ] Документирование всех зависимостей

### Инфраструктура

- [ ] Установка PostgreSQL
- [ ] Установка Node.js
- [ ] Установка Nginx
- [ ] Настройка файрвола
- [ ] Настройка SSL сертификатов

### База данных

- [ ] Создание базы данных
- [ ] Адаптация схемы (удаление зависимостей от auth.users)
- [ ] Применение миграций
- [ ] Импорт данных
- [ ] Проверка целостности данных

### Backend

- [ ] Создание структуры проекта
- [ ] Реализация аутентификации
- [ ] Реализация API endpoints
- [ ] Реализация файлового хранилища
- [ ] Настройка cron jobs
- [ ] Тестирование API

### Frontend

- [ ] Обновление API клиентов
- [ ] Обновление конфигурации
- [ ] Тестирование всех функций
- [ ] Обновление переменных окружения

### Миграция данных

- [ ] Миграция пользователей (сброс паролей)
- [ ] Миграция файлов
- [ ] Проверка всех данных

### Развертывание

- [ ] Развертывание backend
- [ ] Развертывание frontend
- [ ] Настройка Nginx
- [ ] Настройка PM2
- [ ] Тестирование в production

### Мониторинг

- [ ] Настройка логирования
- [ ] Настройка мониторинга ошибок
- [ ] Настройка резервного копирования
- [ ] Документирование процедур

---

## 📝 Примечания

### Важные моменты

1. **Пароли пользователей:** Не могут быть мигрированы напрямую. Нужно попросить пользователей сбросить пароли.

2. **RLS политики:** Нужно эмулировать в middleware на уровне приложения.

3. **Функции БД:** Нужно адаптировать функции, использующие `auth.uid()`, передавая `user_id` как параметр.

4. **Тестирование:** Обязательно протестировать все функции перед полным переходом.

5. **Откат:** Подготовить план отката на Supabase, если что-то пойдет не так.

### Оценка времени

- **Подготовка инфраструктуры:** 1-2 дня
- **Разработка backend:** 1-2 недели
- **Миграция данных:** 1-2 дня
- **Тестирование:** 3-5 дней
- **Развертывание:** 1-2 дня

**Итого:** 3-4 недели

---

**Версия документа:** 1.0  
**Последнее обновление:** 2024

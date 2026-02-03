/**
 * auth.ts
 *
 * Middleware для проверки авторизации пользователей.
 *
 * Использует Supabase Auth для валидации JWT токенов.
 * Каждый запрос к API проходит через этот middleware,
 * который проверяет, что пользователь авторизован.
 *
 * Схема работы:
 * 1. Фронтенд отправляет запрос с заголовком Authorization: Bearer <token>
 * 2. Middleware извлекает токен из заголовка
 * 3. Отправляет токен в Supabase для проверки (supabase.auth.getUser)
 * 4. Если токен валиден — добавляет данные пользователя в req.user
 * 5. Если невалиден — возвращает 401 ошибку
 */

// Express типы для типизации request, response и next
import { Request, Response, NextFunction } from 'express';

// Supabase клиент для работы с авторизацией
import { createClient } from '@supabase/supabase-js';

// Конфигурация приложения (URL Supabase, ключи)
import { config } from '../config/env.js';

// ============================================
// Инициализация Supabase клиента
// ============================================

/**
 * Создаём Supabase клиент с service_role ключом.
 *
 * ВАЖНО: Используется именно service_role key (не anon key),
 * потому что он позволяет проверять токены любых пользователей.
 * anon key может проверять только свои собственные токены.
 *
 * service_role key хранится ТОЛЬКО на сервере (в .env),
 * НИКОГДА не передаётся на фронтенд!
 */
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Типы
// ============================================

/**
 * Расширенный Request с данными пользователя.
 *
 * Стандартный Express Request не содержит поля user.
 * Мы расширяем его через interface extends, чтобы
 * после прохождения authMiddleware в req.user
 * были доступны данные авторизованного пользователя.
 *
 * @example
 * // В обработчике маршрута:
 * app.get('/api/chat', authMiddleware, (req: AuthenticatedRequest, res) => {
 *   console.log(req.user?.id);    // ID пользователя
 *   console.log(req.user?.email); // Email пользователя
 * });
 */
export interface AuthenticatedRequest extends Request {
    user?: {
        /** Уникальный ID пользователя в Supabase (UUID) */
        id: string;

        /** Email пользователя */
        email: string;
    };
}

// ============================================
// Middleware функция
// ============================================

/**
 * Middleware для проверки авторизации через Supabase JWT.
 *
 * Подключается к маршрутам, которые требуют авторизации:
 *
 * @example
 * // Защита одного маршрута:
 * router.post('/chat', authMiddleware, chatHandler);
 *
 * // Защита всех маршрутов:
 * app.use('/api', authMiddleware);
 *
 * @param req - HTTP запрос (расширенный типом AuthenticatedRequest)
 * @param res - HTTP ответ
 * @param next - Функция для передачи управления следующему middleware
 */
export async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // ----------------------------------------
        // Шаг 1: Извлекаем токен из заголовка
        // ----------------------------------------

        // Заголовок имеет формат: "Authorization: Bearer eyJhbGciOi..."
        const authHeader = req.headers.authorization;

        // Проверяем наличие заголовка и правильный формат
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Отсутствует токен авторизации' });
            return;
        }

        // Извлекаем сам токен (убираем "Bearer " — 7 символов)
        // "Bearer eyJhbGciOi..." → "eyJhbGciOi..."
        const token = authHeader.substring(7);

        // ----------------------------------------
        // Шаг 2: Проверяем токен через Supabase
        // ----------------------------------------

        // supabase.auth.getUser(token) отправляет запрос к Supabase Auth,
        // который проверяет:
        // - Не истёк ли срок действия токена
        // - Не был ли токен отозван (logout)
        // - Подпись токена корректна
        //
        // Возвращает объект пользователя или ошибку
        const { data: { user }, error } = await supabase.auth.getUser(token);

        // Если токен невалиден или пользователь не найден
        if (error || !user) {
            res.status(401).json({ error: 'Недействительный токен авторизации' });
            return;
        }

        // ----------------------------------------
        // Шаг 3: Добавляем пользователя в request
        // ----------------------------------------

        // Записываем данные пользователя в req.user,
        // чтобы следующие обработчики могли их использовать
        // (например, для логирования или проверки прав)
        req.user = {
            id: user.id,
            email: user.email || '',
        };

        // Передаём управление следующему middleware/обработчику
        // Без вызова next() запрос "зависнет" и не дойдёт до обработчика
        next();

    } catch (error) {
        // Ловим непредвиденные ошибки (проблемы сети, Supabase недоступен и т.д.)
        console.error('Ошибка в authMiddleware:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
}

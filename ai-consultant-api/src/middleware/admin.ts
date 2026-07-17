/**
 * admin.ts
 *
 * Middleware для проверки административной роли пользователя.
 *
 * Структура / что умеет:
 * 1. getProfileRole — получает роль пользователя из profiles
 * 2. createAdminMiddleware — создаёт middleware с внедряемой проверкой роли
 * 3. adminMiddleware — проверяет права через серверный Supabase клиент
 */

import { createClient } from '@supabase/supabase-js';
import { type NextFunction, type Response } from 'express';
import { config } from '../config/env.js';
import { type AuthenticatedRequest } from './auth.js';

// ============================================
// Инициализация Supabase клиента
// ============================================

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Типы
// ============================================

type ProfileRoleLookup = (userId: string) => Promise<string | null>;

// ============================================
// Получение роли
// ============================================

async function getProfileRole(userId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

    if (error) {
        throw error;
    }

    return data?.role ?? null;
}

// ============================================
// Middleware функция
// ============================================

export function createAdminMiddleware(
    lookupRole: ProfileRoleLookup
): (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => Promise<void> {
    return async function authorizeAdmin(
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        if (!req.user) {
            res.status(401).json({ error: 'Требуется авторизация' });
            return;
        }

        try {
            const role = await lookupRole(req.user.id);

            if (role !== 'admin') {
                res.status(403).json({ error: 'Недостаточно прав' });
                return;
            }

            next();
        } catch (error) {
            console.error('Ошибка в adminMiddleware:', error);
            res.status(403).json({ error: 'Недостаточно прав' });
        }
    };
}

export const adminMiddleware = createAdminMiddleware(getProfileRole);

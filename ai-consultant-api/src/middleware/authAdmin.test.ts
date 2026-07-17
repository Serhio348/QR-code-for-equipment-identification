/**
 * authAdmin.test.ts
 *
 * Регрессионные тесты middleware авторизации и административного доступа.
 *
 * Структура / что умеет:
 * 1. authMiddleware — проверяет принятие валидных и отклонение невалидных токенов
 * 2. adminMiddleware — проверяет доступ администратора и запрет обычному пользователю
 */

import { type NextFunction, type Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
    createAuthMiddleware,
    type AuthenticatedRequest,
} from './auth.js';
import { createAdminMiddleware } from './admin.js';

// ============================================
// Тестовые вспомогательные функции
// ============================================

function createRequest(
    overrides: Partial<AuthenticatedRequest> = {}
): AuthenticatedRequest {
    return {
        headers: {},
        ...overrides,
    } as AuthenticatedRequest;
}

function createResponse(): {
    response: Response;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
} {
    const json = vi.fn();
    const status = vi.fn();
    const response = {
        status,
        json,
    } as unknown as Response;
    status.mockReturnValue(response);
    json.mockReturnValue(response);

    return { response, status, json };
}

// ============================================
// Auth middleware
// ============================================

describe('authMiddleware', () => {
    it('accepts a user validated by Supabase Auth', async () => {
        const getUser = vi.fn().mockResolvedValue({
            data: {
                user: {
                    id: 'user-1',
                    email: 'user@example.com',
                },
            },
            error: null,
        });
        const middleware = createAuthMiddleware({ auth: { getUser } });
        const req = createRequest({
            headers: { authorization: 'Bearer valid-token' },
        });
        const { response, status } = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(req, response, next);

        expect(getUser).toHaveBeenCalledWith('valid-token');
        expect(req.user).toEqual({
            id: 'user-1',
            email: 'user@example.com',
        });
        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it.each(['fake', 'expired', 'revoked'])(
        'rejects a %s token without querying profiles',
        async tokenKind => {
            const getUser = vi.fn().mockResolvedValue({
                data: { user: null },
                error: new Error(`${tokenKind} token`),
            });
            const from = vi.fn();
            const client = {
                auth: { getUser },
                from,
            };
            const middleware = createAuthMiddleware(client);
            const req = createRequest({
                headers: { authorization: `Bearer ${tokenKind}-token` },
            });
            const { response, status, json } = createResponse();
            const next = vi.fn() as NextFunction;

            await middleware(req, response, next);

            expect(status).toHaveBeenCalledWith(401);
            expect(json).toHaveBeenCalledWith({
                error: 'Недействительный токен авторизации',
            });
            expect(from).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
            expect(req.user).toBeUndefined();
        }
    );
});

// ============================================
// Admin middleware
// ============================================

describe('adminMiddleware', () => {
    it('accepts an authenticated administrator', async () => {
        const lookupRole = vi.fn().mockResolvedValue('admin');
        const middleware = createAdminMiddleware(lookupRole);
        const req = createRequest({
            user: { id: 'admin-1', email: 'admin@example.com' },
        });
        const { response, status } = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(req, response, next);

        expect(lookupRole).toHaveBeenCalledWith('admin-1');
        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it('returns 403 for an authenticated regular user', async () => {
        const lookupRole = vi.fn().mockResolvedValue('user');
        const middleware = createAdminMiddleware(lookupRole);
        const req = createRequest({
            user: { id: 'user-1', email: 'user@example.com' },
        });
        const { response, status } = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(req, response, next);

        expect(status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 before querying profiles without an authenticated user', async () => {
        const lookupRole = vi.fn();
        const middleware = createAdminMiddleware(lookupRole);
        const req = createRequest();
        const { response, status } = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(req, response, next);

        expect(status).toHaveBeenCalledWith(401);
        expect(lookupRole).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('fails closed when the profile query fails', async () => {
        const lookupRole = vi.fn().mockRejectedValue(new Error('query failed'));
        const middleware = createAdminMiddleware(lookupRole);
        const req = createRequest({
            user: { id: 'admin-1', email: 'admin@example.com' },
        });
        const { response, status } = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(req, response, next);

        expect(status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});

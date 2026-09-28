/**
 * vitest.setup.ts
 *
 * В CI нет .env. Клиенты Supabase создаются при импорте модуля и требуют непустой URL.
 * Подставляем локальный адрес только если переменная не задана. Запросы тесты не отправляют.
 */

if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
}
if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
}

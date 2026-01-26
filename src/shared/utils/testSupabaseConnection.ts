/**
 * Утилита для проверки подключения к Supabase
 * 
 * Использование:
 * 1. Импортируйте функцию в консоли браузера или в коде
 * 2. Вызовите: await testSupabaseConnection()
 */

import { supabase, testSupabaseConnection } from '../config/supabase';

/**
 * Проверка подключения к Supabase с подробным выводом
 */
export async function checkSupabaseSetup(): Promise<void> {
  console.log('🔍 Проверка подключения к Supabase...\n');

  // Проверка переменных окружения
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Переменные окружения не настроены!');
    console.error('   Установите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
    return;
  }

  console.log('✅ Переменные окружения настроены');
  console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`);
  console.log(`   Key: ${supabaseAnonKey.substring(0, 20)}...\n`);

  // Проверка подключения
  console.log('🔍 Проверка подключения к базе данных...');
  const isConnected = await testSupabaseConnection();

  if (!isConnected) {
    console.error('\n❌ Не удалось подключиться к Supabase');
    console.error('   Проверьте:');
    console.error('   1. Правильность URL и ключа в .env.local');
    console.error('   2. Что проект Supabase активен');
    console.error('   3. Что таблицы созданы (выполните SQL схему)');
    return;
  }

  // Проверка таблиц
  console.log('\n🔍 Проверка таблиц...');
  const tables = ['profiles', 'user_app_access', 'login_history', 'beliot_device_overrides'];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('count').limit(1);
      if (error) {
        console.error(`❌ Таблица "${table}" не найдена или недоступна:`, error.message);
      } else {
        console.log(`✅ Таблица "${table}" доступна`);
      }
    } catch (err: any) {
      console.error(`❌ Ошибка при проверке таблицы "${table}":`, err.message);
    }
  }

  console.log('\n✅ Проверка завершена!');
  console.log('   Если все таблицы доступны, можно переходить к следующему этапу.');
}

// Экспорт для использования в консоли браузера
if (typeof window !== 'undefined') {
  (window as any).checkSupabaseSetup = checkSupabaseSetup;
}

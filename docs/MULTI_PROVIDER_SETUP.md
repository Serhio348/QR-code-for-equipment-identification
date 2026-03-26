# 🚀 Настройка Multi-Provider Architecture

Multi-provider архитектура **полностью реализована**! Теперь можно использовать как Gemini (бесплатно), так и Claude API.

## ✅ Что готово

- ✅ **Claude Provider** - рефакторинг из существующего кода
- ✅ **Gemini Provider** - новая реализация с бесплатным tier
- ✅ **Provider Factory** - автоматический выбор и fallback
- ✅ **Интеграция** - обновлён `/api/chat` эндпоинт
- ✅ **Конфигурация** - поддержка `.env` переменных

## 📋 Быстрый старт

### 1. Получить API ключ Gemini (бесплатно)

⚠️ **ВАЖНО:** Используйте тот же Google аккаунт, где находится ваша база данных (Google Sheets с оборудованием)!

1. Перейти на [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. **Войти с Google аккаунтом**, где хранится Google Sheets с оборудованием
3. Нажать **"Create API Key"**
4. Скопировать ключ (формат: `AIzaSy...`)

**Бесплатный лимит:** 15 запросов в минуту, достаточно для разработки!

**Почему тот же аккаунт?** Gemini API и Google Apps Script (GAS API) должны работать в контексте одного Google workspace для корректного доступа к данным.

### 2. Настроить `.env`

Откройте `ai-consultant-api/.env` и добавьте:

```env
# Выбор провайдера (gemini | claude)
AI_PROVIDER=gemini

# Gemini API (бесплатный)
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
GEMINI_MODEL=gemini-2.0-flash-exp

# Claude API (опционально, если есть деньги)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
CLAUDE_MODEL=claude-sonnet-4-20250514
```

**Важно:** Нужен хотя бы **один** API ключ (Gemini или Claude).

### 3. Запустить сервер

```bash
cd ai-consultant-api
npm install  # Установит @google/generative-ai
npm run dev
```

Сервер запустится на `http://localhost:3001`

## 🔄 Переключение между провайдерами

### Через `.env` (рекомендуется)

Измените `AI_PROVIDER` в `.env`:

```env
AI_PROVIDER=gemini   # Использовать Gemini
AI_PROVIDER=claude   # Использовать Claude
```

Перезапустите сервер.

### Автоматический Fallback

Если выбранный провайдер недоступен (нет API ключа или API не отвечает), система **автоматически переключится** на доступный провайдер.

Пример логов:

```
[ProviderFactory] Preferred provider claude is not configured, using fallback...
[ProviderFactory] Fallback to gemini provider
```

## 🧪 Тестирование

### Проверить доступные провайдеры

```bash
cd ai-consultant-api
node -e "
const { ProviderFactory } = require('./dist/services/ai/index.js');
const available = ProviderFactory.getAvailableProviders();
console.log('Доступные провайдеры:', available);
"
```

### Тест через API

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "Привет! Найди всё оборудование"}
    ]
  }'
```

Ответ будет содержать:

```json
{
  "success": true,
  "data": {
    "message": "Найдено 5 единиц оборудования...",
    "toolsUsed": ["get_all_equipment"],
    "provider": "Gemini",
    "tokensUsed": {
      "input": 1234,
      "output": 567
    }
  }
}
```

Поле `provider` покажет какой провайдер был использован.

## 📊 Сравнение провайдеров

| Провайдер | Стоимость | Лимиты (бесплатно) | Модель по умолчанию | Скорость |
|-----------|-----------|-------------------|---------------------|----------|
| **Gemini** | 🟢 Бесплатно | 15 req/min | gemini-2.0-flash-exp | ⚡⚡⚡ Быстро |
| **Claude** | 🔴 Платно | - | claude-sonnet-4-5 | ⚡⚡ Средне |
| OpenAI | 🔴 Платно | - | (не реализован) | - |

**Рекомендация:** Используйте Gemini для разработки, Claude для продакшена (если нужна максимальная точность).

## 🛠️ Архитектура

```
┌─────────────────────────────────────────────────────┐
│  POST /api/chat                                     │
│         ↓                                           │
│  ProviderFactory.create()                           │
│         ├─ Проверка AI_PROVIDER в .env              │
│         ├─ Проверка isAvailable()                   │
│         └─ Fallback на доступный провайдер          │
│         ↓                                           │
│  ┌──────────────────┐  ┌──────────────────┐         │
│  │ ClaudeProvider   │  │ GeminiProvider   │         │
│  │ (anthropic SDK)  │  │ (generative-ai)  │         │
│  └──────────────────┘  └──────────────────┘         │
│         ↓                      ↓                    │
│  Агентный цикл с tool calling                       │
│         ↓                                           │
│  Возврат { message, toolsUsed, provider }           │
└─────────────────────────────────────────────────────┘
```

## ⚙️ Переменные окружения

### Обязательные (одна из групп)

**Gemini:**
- `GEMINI_API_KEY` - API ключ Google AI Studio

**Claude:**
- `ANTHROPIC_API_KEY` - API ключ Anthropic

### Опциональные

- `AI_PROVIDER` - Предпочитаемый провайдер (default: `gemini`)
- `GEMINI_MODEL` - Модель Gemini (default: `gemini-2.0-flash-exp`)
- `CLAUDE_MODEL` - Модель Claude (default: `claude-sonnet-4-20250514`)

### Остальные (не изменились)

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` - Для JWT авторизации
- `GAS_API_URL` - URL Google Apps Script для работы с оборудованием (пример: https://script.google.com/macros/s/AKfycbxwY_gXYab9EMnpoewHLU7yrniPPRxkNEMITOc3ru-fBxxtGmUoR0WeFfbC250zrIfieQ/exec)
- `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS` - Настройки сервера

## 🐛 Troubleshooting

### Ошибка: "No AI providers available"

**Причина:** Не настроен ни один API ключ.

**Решение:** Добавьте `GEMINI_API_KEY` или `ANTHROPIC_API_KEY` в `.env`.

---

### Ошибка: "API_KEY_INVALID" (Gemini)

**Причина:** Неверный формат или устаревший API ключ.

**Решение:**
1. Проверьте формат ключа (должен начинаться с `AIzaSy`)
2. Создайте новый ключ на [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

---

### Ошибка: "RESOURCE_EXHAUSTED" (Gemini)

**Причина:** Превышен лимит 15 запросов в минуту.

**Решение:**
- Подождите минуту
- Или настройте Claude API как fallback

---

### Провайдер постоянно переключается на fallback

**Причина:** Основной провайдер не проходит проверку `isAvailable()`.

**Решение:**
1. Проверьте интернет соединение
2. Проверьте правильность API ключа
3. Проверьте логи: `[ProviderFactory] ...`

## 📚 Дополнительно

- **Полный план реализации:** `doc/multi-provider-implementation-plan.md`
- **Исходный код провайдеров:** `ai-consultant-api/src/services/ai/providers/`
- **Адаптеры для tool calling:** `ai-consultant-api/src/services/ai/adapters/`

## 🎉 Готово!

Теперь у вас есть:
- ✅ Бесплатный AI провайдер (Gemini)
- ✅ Автоматический fallback
- ✅ Возможность добавить другие провайдеры (OpenAI, Ollama)
- ✅ Сохранённый старый код (anthropic.ts) на случай отката

**Протестируйте систему и начинайте разработку!** 🚀

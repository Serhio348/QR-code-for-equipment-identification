# План реализации микросервиса опроса обратного осмоса (Modbus → REST) + Docker + Nginx

Цель документа: дать пошаговый, максимально практичный план, по которому можно **самостоятельно реализовать** микросервис опроса установки обратного осмоса (Weintek/Modbus TCP) и развернуть его на VPS в микросервисной схеме (**Docker Compose + Nginx reverse proxy**).

Документ ориентирован на вариант, где **авторизация/роли остаются в Supabase** (как сейчас в проекте), а сервис опроса осмоса — отдельное приложение.

---

## 0) Пошаговый “TODO-лист” (что и в каком порядке создавать)

Ниже — список шагов в формате “создай файл → что в нём должно быть → как проверить”.

### Шаг 0.1 — создать репозиторий и базовую структуру

1) Создайте репозиторий `osmos-modbus-service`.
2) В корне репозитория создайте структуру:

```
src/
  app.ts
  config.ts
  types.ts
  modbus/
    map.ts
    decode.ts
    client.ts
    poller.ts
Dockerfile
docker-compose.yml
.env.example
README.md
package.json
tsconfig.json
```

Проверка:
- проект открывается в IDE, файлы на местах.

### Шаг 0.2 — инициализировать Node/TS проект

1) Инициализируйте `package.json`.
2) Добавьте зависимости:
   - `modbus-serial`
   - HTTP framework (выберите **один**): `express` или `fastify`
3) Добавьте dev-зависимости:
   - `typescript`
   - `tsx` (для dev)
   - `@types/node`
   - (если express) `@types/express`
4) Настройте scripts в `package.json`:
   - `dev`: запуск `tsx` (watch)
   - `build`: `tsc`
   - `start`: `node dist/app.js` (или `dist/index.js`, но выберите и держите единообразно)

Проверка:
- `npm run dev` запускается (пока может делать только “hello” /health).

### Шаг 0.3 — оформить `.env.example`

Создайте `.env.example` и добавьте в него:
- `PORT=3003`
- `MODBUS_HOST=192.168.6.220`
- `MODBUS_PORT=502`
- `MODBUS_UNIT_ID=1`
- `POLL_INTERVAL_MS=5000`
- `HOLDING_PDU_OFFSET=-1`
- `MODBUS_TIMEOUT_MS=8000`
- `STALE_AFTER_MS=15000`
- `LOG_LEVEL=info`

Проверка:
- понятно, какие переменные надо задать на VPS.

### Шаг 0.4 — реализовать `src/config.ts`

В `src/config.ts`:
- прочитать env
- задать значения по умолчанию (как в `.env.example`)
- привести типы (числа/строки)
- сделать простую “валидацию” (например: PORT > 0, interval >= 1000, host не пустой)

Проверка:
- при отсутствии обязательных переменных сервис падает с понятной ошибкой (или использует defaults — решите одну стратегию и придерживайтесь).

### Шаг 0.5 — описать типы данных (`src/types.ts`)

В `src/types.ts` зафиксируйте:
- тип `OsmosSnapshot` (meta + discrete + params)
- тип `HealthResponse`
- тип `ParamDef` и `ParamValueRow` (или как назовёте)

Проверка:
- типы используются в poller и HTTP-ответах, `any` не нужен.

### Шаг 0.6 — перенести карту регистров (`src/modbus/map.ts`)

В `src/modbus/map.ts` создайте константу (массив) `PARAMS`, по образцу из:
`scripts/read-weintek-osmos-modbus.ts`

Минимальный набор (вертикальный срез):
- 9240/9242/9246/9248 (int16, scale 0.1 бар)
- 9252/9254/9256 (int32 из 2 слов, scale 0.1)
- 9258 (проводимость)
- 9260 (температура, scale 0.1)

Проверка:
- карта читается как единый список, есть `key/name/address4x/words/scale/unit/decimals`.

### Шаг 0.7 — декодирование (`src/modbus/decode.ts`)

В `src/modbus/decode.ts` реализуйте:
- `toInt16(u16): number`
- `toInt32FromWordsLoHi(lo, hi): { i32: number; u32: number }`
- `applyScale(value: number, scale?: number, decimals?: number): number | string`

Проверка:
- unit-тесты не обязательны, но минимум: ручная проверка на 2–3 примерах.

### Шаг 0.8 — Modbus клиент (`src/modbus/client.ts`)

В `src/modbus/client.ts`:
- создать/экспортировать функцию `connectModbus()` или класс `ModbusClient`
- поставить `setTimeout(MODBUS_TIMEOUT_MS)`
- `connectTCP(host, { port })`
- `setID(unitId)`

Добавьте методы:
- `readHolding4x(address4x, words): Promise<number[] | null>`
- `readDiscrete1x(address1x, bits=1): Promise<boolean[] | null>`

Важно:
- учесть `HOLDING_PDU_OFFSET` (по умолчанию -1) для 4x

Проверка:
- при неверном хосте метод возвращает `null`/ошибку, но сервис не “умирает” навсегда (ошибка должна обрабатываться poller’ом).

### Шаг 0.9 — poller (циклический опрос) (`src/modbus/poller.ts`)

В `src/modbus/poller.ts`:
- реализуйте `startPoller()` и внутренний `pollOnce()`
- храните в памяти состояние:
  - `lastSnapshot: OsmosSnapshot | null`
  - `lastOkAt: string | null`
  - `lastPollAt: string | null`
  - `lastError: string | null`
  - `consecutiveFailures: number`
- слепок обновляйте “атомарно” (заменой объекта)

Правила поведения:
- опрос каждые `POLL_INTERVAL_MS`
- “fresh” по `STALE_AFTER_MS`
- при ошибке:
  - обновить `lastError`, увеличить failures
  - **не падать процессом**
  - продолжать следующий тик

Проверка:
- если Modbus недоступен, сервис продолжает отвечать `/health` и не завершается.

### Шаг 0.10 — HTTP server (`src/app.ts`)

В `src/app.ts`:
- поднять HTTP server на `PORT`
- подключить poller при старте
- реализовать routes:
  - `GET /health` — быстро, без обращения к Modbus
  - `GET /api/osmos` — отдаёт `lastSnapshot` и meta

Проверка:
- `curl http://localhost:3003/health`
- `curl http://localhost:3003/api/osmos`

### Шаг 0.11 — Dockerfile

В `Dockerfile`:
- сборка TypeScript (`npm ci && npm run build`)
- запуск `node dist/app.js`
- выставить `NODE_ENV=production`

Проверка:
- `docker build .` проходит
- контейнер стартует и слушает `PORT`

### Шаг 0.12 — docker-compose.yml

В `docker-compose.yml`:
- `restart: unless-stopped`
- env через `.env`
- порт публиковать как:
  - `127.0.0.1:3003:3003` (если Nginx на хосте)

Проверка:
- `docker compose up -d --build`
- `docker compose logs -f`

### Шаг 0.13 — Nginx reverse proxy (на VPS)

На VPS в Nginx добавьте server block:
- `server_name osmos.<domain>`
- proxy на `http://127.0.0.1:3003`

Опционально:
- allowlist внутренней подсети
- basic-auth

Проверка:
- `https://osmos.<domain>/health` отдаёт JSON

---

## 1) Требования и границы ответственности

### 1.1. Что должен делать сервис

- Опрашивать Modbus TCP устройство (например `192.168.6.220:502`) **каждые 5 секунд**
- Собрать значения параметров (holding registers 4x + 1 дискрет 1x)
- Держать **последний слепок** (snapshot) в памяти
- Отдавать слепок через REST:
  - `GET /api/osmos` — данные + мета (fresh/stale, ошибка, время)
  - `GET /health` — состояние сервиса/опроса

### 1.2. Что НЕ делает (на первом этапе)

- Не пишет в БД (ни Postgres, ни Supabase) — только “живой” API
- Не строит графики/дашборды (это можно добавить позже Grafana/Timescale)
- Не делает сложную авторизацию (сначала — доступ внутри сети; затем можно добавить JWT/roles)

---

## 2) Стек и структура репозитория

### 2.1. Стек

- Node.js 20+
- TypeScript (`strict: true`)
- HTTP: Express или Fastify (любой, но выбрать один)
- Modbus: `modbus-serial` (как в текущем скрипте `scripts/read-weintek-osmos-modbus.ts`)
- Запуск на VPS: Docker + Docker Compose
- Reverse proxy: Nginx (поддомен `osmos.<domain>` или внутренний путь)

### 2.2. Рекомендуемая структура проекта (минимальная)

```
osmos-modbus-service/
  src/
    app.ts              # HTTP server + маршруты
    config.ts           # чтение/валидация env
    modbus/
      client.ts         # подключение, таймауты, чтение регистров
      map.ts            # карта параметров (адреса/scale/words)
      decode.ts         # int16/int32/scale/format
      poller.ts         # цикл опроса + состояние lastSnapshot
    types.ts            # типы Snapshot/Health
  package.json
  tsconfig.json
  Dockerfile
  docker-compose.yml
  .env.example
  README.md             # краткая инструкция запуска
```

---

## 3) Контракты API (обязательная часть для стабильной интеграции)

### 3.1. `GET /api/osmos`

Поведение:
- Если слепок уже есть: `200` + payload
- Если сервис ещё “разогревается” (первый опрос не завершён): `503` + `{ status: "warming_up" }`
- Если Modbus не доступен: всё равно `200`, но:
  - `fresh=false`
  - `lastError` заполнен
  - данные — последний удачный слепок (если был), иначе `null` + `503`

Рекомендуемый JSON формат:

```
{
  "meta": {
    "version": "0.1.0",
    "deviceHost": "192.168.6.220",
    "devicePort": 502,
    "unitId": 1,
    "pollIntervalMs": 5000,
    "staleAfterMs": 15000,
    "polledAt": "2026-04-23T10:12:34.123Z",
    "pollDurationMs": 182,
    "fresh": true,
    "lastOkAt": "2026-04-23T10:12:34.123Z",
    "lastError": null,
    "consecutiveFailures": 0
  },
  "discrete": {
    "m19": true,
    "source": { "type": "discrete_input", "address1x": 100 }
  },
  "params": [
    {
      "key": "pressure_1",
      "name": "Давление №1 (до фильтра)",
      "address4x": 9240,
      "words": 1,
      "raw": { "int16": 123, "uint16": 123 },
      "value": 12.3,
      "unit": "бар",
      "decimals": 1
    }
  ]
}
```

Ключевые правила:
- `key` должен быть **стабильным** (не менять без причины)
- `address4x` и `words` сохраняйте — это помогает диагностике
- `fresh` вычисляйте как `Date.now() - polledAt <= staleAfterMs`

### 3.2. `GET /health`

Цель: удобная проверка, что сервис жив и опрос идёт.

Рекомендуемый формат:

```
{
  "status": "ok" | "degraded" | "down",
  "uptimeSec": 12345,
  "lastPollAt": "…",
  "lastOkAt": "…",
  "consecutiveFailures": 2,
  "fresh": true,
  "version": "0.1.0"
}
```

Правило статусов:
- `ok`: последний слепок свежий
- `degraded`: слепок есть, но устарел (stale) или были ошибки подряд
- `down`: слепка нет вообще или очень давно нет успешного опроса (например > 5 минут)

---

## 4) Конфигурация через env (чтобы не править код при деплое)

### 4.1. Обязательные переменные

- `PORT=3003`
- `MODBUS_HOST=192.168.6.220`
- `MODBUS_PORT=502`
- `MODBUS_UNIT_ID=1`
- `POLL_INTERVAL_MS=5000`
- `HOLDING_PDU_OFFSET=-1`

### 4.2. Рекомендуемые переменные

- `MODBUS_TIMEOUT_MS=8000`
- `STALE_AFTER_MS=15000`
- `LOG_LEVEL=info|debug`

### 4.3. Пример `.env.example`

Сделайте файл `.env.example`, чтобы любой мог развернуть сервис:
- все переменные из списка выше
- пояснения (короткие)

---

## 5) Карта регистров (как стартовать быстрее всего)

Самый быстрый путь — перенести карту из текущего скрипта проекта:
`scripts/read-weintek-osmos-modbus.ts`

Минимальный набор параметров (как “вертикальный срез”):
- 4x-9240 — давление 1 (int16, scale 0.1 бар)
- 4x-9242 — давление 2
- 4x-9246 — давление 3
- 4x-9248 — давление 4
- 4x-9252 — проток 1 (int32 из 2 слов, scale 0.1)
- 4x-9254 — проток 2
- 4x-9256 — проток 3
- 4x-9258 — проводимость (int16, scale 1)
- 4x-9260 — температура (int16, scale 0.1 °C)
- 1x-100 (FC02) — “M19” (состояние/связь)

Важный нюанс Weintek:
- у Weintek “человеческие” адреса 4x обычно 1-based, а Modbus PDU часто 0-based,
  поэтому используйте `HOLDING_PDU_OFFSET=-1` по умолчанию.

---

## 6) Modbus реализация: алгоритм опроса

### 6.1. Подключение и таймауты

- Используйте `client.setTimeout(MODBUS_TIMEOUT_MS)`
- Вариант 1 (простее): на каждом тике “connect → read → close”
  - плюсы: меньше залипаний сокета
  - минусы: лишние соединения
- Вариант 2 (лучше): держать соединение, а при ошибке — переподключаться
  - вам нужен “reconnect guard”, чтобы не делать конкурентных connect()

Рекомендация для старта: **держать соединение**, но при ошибке делать `close()` и `connect` заново.

### 6.2. Чтение регистров

Из опыта Weintek (и из вашего скрипта): читать **каждую точку отдельно**:
- `readHoldingRegisters(pduAddress, words)`

Не оптимизируйте блоками на старте, пока не убедитесь, что Weintek отдаёт корректно в диапазонах.

### 6.3. Декодирование

Сделайте отдельные функции:
- `toInt16(u16)`
- `toInt32FromWordsLoHi(lo, hi)` (или hi/lo, но выбрать одно и держать везде)
- `applyScale(value, scale, decimals)`

Для `words=2` на старте используйте int32 (signed), как в вашем скрипте.

### 6.4. Состояние poller’а

В памяти храните:
- `lastSnapshot` (или `null`)
- `lastOkAt`
- `lastError` (последняя ошибка опроса)
- `consecutiveFailures`
- `lastPollDurationMs`

Слепок обновляйте **атомарно** (замена объекта целиком), чтобы API не отдавал “половину обновления”.

### 6.5. “Fresh / stale”

- `fresh = now - polledAt <= STALE_AFTER_MS`
- `STALE_AFTER_MS` сделайте больше `POLL_INTERVAL_MS` (например 3× интервала)

---

## 7) HTTP слой: реализация эндпоинтов

### 7.1. `/api/osmos`

Правило: API отдаёт “последнее известное” даже при проблемах связи, чтобы мониторинг не “падал”.

Рекомендуемая логика:
- если `lastSnapshot` есть → 200
- если нет (первый запуск) → 503 warming up

### 7.2. `/health`

Не привязывайте `/health` к Modbus напрямую (не делайте “опрос внутри health”), иначе при проблемах сети health начнёт подвисать.

Health должен отражать состояние poller’а:
- есть ли слепок
- свежий ли он
- сколько ошибок подряд

---

## 8) Docker: что именно сделать

### 8.1. Dockerfile

Минимально:
- `npm ci`
- `npm run build`
- `node dist/app.js` (или `dist/index.js`)

Отдельно:
- выставить `NODE_ENV=production`
- добавить `HEALTHCHECK` (не обязательно, но полезно)

### 8.2. docker-compose.yml (на VPS)

Рекомендации:
- `restart: unless-stopped`
- env через `.env` файл
- порт:
  - если Nginx на хосте: публиковать на `127.0.0.1:3003:3003`
  - если Nginx тоже в docker: внутренняя сеть без публикации портов наружу

На первом этапе проще: **Nginx на хосте**, сервис слушает `127.0.0.1`.

---

## 9) Nginx reverse proxy: схема

### 9.1. Вариант с поддоменом (рекомендуется)

- `osmos.<domain>` → `http://127.0.0.1:3003`

Опциональная защита:
- `allow 192.168.2.0/24; deny all;` (только внутренняя сеть)
- basic-auth (если нужно)

---

## 10) Безопасность: варианты доступа (выберите один этапом позже)

### Вариант A — “внутренняя сеть + allowlist”

Самый простой и надёжный для старта:
- Nginx allowlist по IP/подсети
- сервис без auth

### Вариант B — basic-auth на Nginx

Подходит для “быстро закрыть доступ”.

### Вариант C — Supabase JWT + роли (admin/user)

Если сервис будет дергаться браузером и нужен контроль ролей:
- проверять `Authorization: Bearer <token>`
- валидировать JWT по JWK Supabase или через supabase-js на сервере
- сравнивать роль пользователя (обычно из `profiles`)

Рекомендация: внедрять после того, как “железо читается стабильно”.

---

## 11) Логи, диагностика, отказоустойчивость

### 11.1. Логи

Логируйте по одному событию на тик:
- ok: длительность, количество параметров
- fail: ошибка + счётчик ошибок подряд

### 11.2. Поведение при падении Modbus

Требование:
- сервис продолжает отвечать HTTP
- `fresh=false`, `status=degraded/down` по правилам
- poller продолжает ретраи

---

## 12) Мини-тест план (обязательные проверки)

### 12.1. Локально (где есть доступ к Modbus)

- Запуск сервиса с реальным `MODBUS_HOST`
- Проверить:
  - `/health` отвечает быстро
  - `/api/osmos` показывает значения
  - обновление значений каждые ~5 секунд

### 12.2. Негативные сценарии

- Указать неверный `MODBUS_HOST`:
  - `/api/osmos` → warming up (если не было удачного poll)
  - затем degraded/down
  - сервис не падает
- Восстановить host:
  - через 1–2 тика слепок становится fresh

### 12.3. На VPS

- Убедиться, что VPS видит `192.168.6.220:502` (маршрутизация/ACL)
- Запустить `docker compose up -d`
- Проверить `https://osmos.<domain>/health`

---

## 13) Этапы реализации (по приоритету)

### Этап 1 — “вертикальный срез за 1 вечер”

- карта 8–10 параметров + 1 дискрет
- poll loop 5 сек
- `/api/osmos` + `/health`
- Dockerfile + compose
- Nginx прокси под поддомен

Результат: уже можно “видеть работу”.

### Этап 2 — стабильность и UX

- аккуратные таймауты/ретраи
- лучше метрики в `meta` (latency, failures)
- логирование в структурированном формате (JSON)

### Этап 3 — безопасность

- allowlist/basic auth или Supabase JWT + role guard

### Этап 4 — интеграция в основной проект

- основной фронт читает `https://osmos.<domain>/api/osmos`
- или основной backend проксирует/агрегирует

---

## 14) Чек-лист готовности к деплою

- [ ] сервис собирается (`npm run build`)
- [ ] стартует (`npm start`)
- [ ] `/health` отвечает < 50ms
- [ ] `/api/osmos` отдаёт слепок и мета-данные
- [ ] при недоступном Modbus сервис НЕ падает
- [ ] Docker контейнер стартует и рестартится сам (`restart: unless-stopped`)
- [ ] Nginx проксирует поддомен на сервис
- [ ] секреты/конфиги в `.env`, в git не коммитятся

---

## 15) Примечание: откуда брать карту регистров

В качестве “источника истины” используйте текущий файл проекта:
`scripts/read-weintek-osmos-modbus.ts`

Там уже:
- учтён PDU offset
- учтено чтение по одной точке
- есть scale/decimals и декодирование int16/int32


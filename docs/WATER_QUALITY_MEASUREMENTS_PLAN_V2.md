# План реализации функционала учета лабораторных измерений качества воды (Версия 2.0)

## Анализ предложений и улучшения

### Ключевые улучшения по сравнению с версией 1.0:

1. ✅ **Пункты отбора проб** - отдельная сущность для гибкого управления точками контроля
2. ✅ **Расширенные нормативы** - мин/макс допустимое и оптимальное для более точных оповещений
3. ✅ **Статусы анализов** - отслеживание жизненного цикла анализа
4. ✅ **Нормализованная структура** - отдельная таблица для результатов параметров
5. ⏳ **Статистические методы контроля** - карты Шухарта, KPI (позже, не в MVP)
6. ⏳ **Интегральные показатели** - индекс Ланжелье и другие расчеты (позже, не в MVP)
7. ⏳ **Расширенная аналитика** - корреляционный анализ, прогнозирование (позже, не в MVP)

> Примечание: по вашему требованию таблицы **`water_quality_alerts`**, **`water_quality_statistics`**, **`sampling_schedule`** сейчас **не создаем**. Они добавятся отдельной миграцией на этапе оповещений/аналитики/планирования.

---

## 1. Обзор функционала

Система учета лабораторных измерений качества воды для мониторинга и контроля параметров водоподготовки с расширенной аналитикой и управлением точками контроля.

### Основные параметры измерения:
- **Железо** (Fe) - мг/л
- **Щелочность** - мг-экв/л или ммоль/л
- **Жесткость** - мг-экв/л или °Ж (градусы жесткости)
- **Окисляемость** - мг O₂/л
- **pH** - единицы pH
- **Температура** - °C

---

## 2. Улучшенная структура данных

### 2.1. Таблица пунктов отбора проб (Точки контроля)

```sql
CREATE TABLE public.sampling_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- Код точки (например, "SP-001", "ВХОД-1")
  name TEXT NOT NULL, -- Название (например, "Входная вода", "После умягчителя", "Перед розливом")
  description TEXT, -- Описание точки контроля
  equipment_id TEXT, -- Связь с оборудованием (опционально, может быть несколько точек на одном оборудовании)
  location TEXT, -- Физическое расположение (например, "Цех №1, линия 2")
  
  -- Настройки отбора проб
  sampling_frequency TEXT, -- Периодичность: 'daily', 'weekly', 'monthly', 'custom'
  sampling_schedule JSONB, -- Расписание отбора проб (для custom)
  responsible_person TEXT, -- Ответственный за отбор проб
  
  -- Метаданные
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  
  CONSTRAINT fk_equipment FOREIGN KEY (equipment_id) 
    REFERENCES equipment(id) ON DELETE SET NULL
);

CREATE INDEX idx_sampling_point_code ON sampling_points(code);
CREATE INDEX idx_sampling_point_equipment ON sampling_points(equipment_id);
CREATE INDEX idx_sampling_point_active ON sampling_points(is_active) WHERE is_active = true;
```

### 2.2. Таблица лабораторных анализов (Записи в журнале)

```sql
CREATE TABLE public.water_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID NOT NULL, -- Связь с точкой отбора проб
  equipment_id TEXT, -- Дублирование для быстрого доступа (опционально)
  
  -- Временные метки
  sample_date TIMESTAMP WITH TIME ZONE NOT NULL, -- Дата и время отбора пробы
  analysis_date TIMESTAMP WITH TIME ZONE, -- Дата и время проведения анализа (может отличаться от отбора)
  received_date TIMESTAMP WITH TIME ZONE, -- Дата получения результатов (для внешних лабораторий)
  
  -- Ответственные лица
  sampled_by TEXT, -- Кто отобрал пробу (email или имя)
  analyzed_by TEXT, -- Кто провел анализ (лаборант)
  responsible_person TEXT, -- Ответственный за анализ
  
  -- Статус анализа
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'deviation', 'cancelled'
  
  -- Дополнительная информация
  notes TEXT, -- Примечания (например, "пробы мутные", "необычный запах")
  sample_condition TEXT, -- Состояние пробы: 'normal', 'turbid', 'colored', 'odorous'
  external_lab BOOLEAN DEFAULT false, -- Анализ проведен внешней лабораторией
  external_lab_name TEXT, -- Название внешней лаборатории
  certificate_number TEXT, -- Номер протокола/сертификата
  
  -- Файлы
  attachment_urls JSONB, -- Массив URL файлов (фото, протоколы, сертификаты)
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  
  -- Аудит изменений
  change_log JSONB, -- История изменений: [{user, timestamp, field, old_value, new_value}]
  
  CONSTRAINT fk_sampling_point FOREIGN KEY (sampling_point_id) 
    REFERENCES sampling_points(id) ON DELETE RESTRICT
);

CREATE INDEX idx_analysis_date ON water_analysis(sample_date DESC);
CREATE INDEX idx_analysis_sampling_point ON water_analysis(sampling_point_id, sample_date DESC);
CREATE INDEX idx_analysis_status ON water_analysis(status);
CREATE INDEX idx_analysis_equipment ON water_analysis(equipment_id) WHERE equipment_id IS NOT NULL;
```

### 2.3. Таблица результатов анализа (Нормализованная структура)

```sql
CREATE TABLE public.analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL, -- Связь с анализом
  
  -- Параметр измерения
  parameter_name TEXT NOT NULL, -- 'iron', 'alkalinity', 'hardness', 'oxidizability', 'ph', 'temperature'
  parameter_label TEXT NOT NULL, -- Человекочитаемое название: 'Железо', 'Щелочность'
  
  -- Значение и единица измерения
  value DECIMAL(10, 4) NOT NULL, -- Значение параметра
  unit TEXT NOT NULL, -- Единица измерения: 'мг/л', 'мг-экв/л', '°Ж', 'мг O₂/л', 'pH', '°C'
  
  -- Метод измерения
  method TEXT, -- Метод определения (например, "ГОСТ 4011-72", "титриметрический")
  detection_limit DECIMAL(10, 4), -- Предел обнаружения метода
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_analysis FOREIGN KEY (analysis_id) 
    REFERENCES water_analysis(id) ON DELETE CASCADE,
  
  UNIQUE(analysis_id, parameter_name) -- Один параметр на анализ
);

CREATE INDEX idx_results_analysis ON analysis_results(analysis_id);
CREATE INDEX idx_results_parameter ON analysis_results(parameter_name);
CREATE INDEX idx_results_value ON analysis_results(parameter_name, value);
```

### 2.4. Таблица нормативов (Граничные условия) - Улучшенная версия

```sql
CREATE TABLE public.water_quality_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID, -- NULL для глобальных значений, или конкретная точка
  equipment_id TEXT, -- Альтернативная привязка к оборудованию
  parameter_name TEXT NOT NULL, -- 'iron', 'alkalinity', 'hardness', 'oxidizability', 'ph'
  
  -- Оптимальные значения (целевой диапазон)
  optimal_min DECIMAL(10, 4), -- Минимальное оптимальное значение
  optimal_max DECIMAL(10, 4), -- Максимальное оптимальное значение
  
  -- Допустимые значения (границы нормы)
  min_allowed DECIMAL(10, 4), -- Минимальное допустимое значение
  max_allowed DECIMAL(10, 4), -- Максимальное допустимое значение
  
  -- Пороги предупреждений (для оповещений)
  warning_min DECIMAL(10, 4), -- Нижний порог предупреждения (близко к min_allowed)
  warning_max DECIMAL(10, 4), -- Верхний порог предупреждения (близко к max_allowed)
  
  unit TEXT NOT NULL, -- Единица измерения
  
  -- Регламент
  regulation_reference TEXT, -- Ссылка на регламент: 'СанПиН 2.1.4.1074-01', 'ТР ТС 044/2017', 'Внутренний стандарт'
  regulation_document_url TEXT, -- URL документа регламента
  
  -- Настройки оповещений
  enable_notifications BOOLEAN DEFAULT true,
  warning_threshold_percent DECIMAL(5, 2) DEFAULT 10.0, -- Процент от границы для предупреждения
  alarm_threshold_percent DECIMAL(5, 2) DEFAULT 5.0, -- Процент от границы для тревоги
  
  -- Метаданные
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  
  -- Приоритет: более специфичные нормативы (по точке) имеют приоритет над глобальными
  UNIQUE(sampling_point_id, parameter_name),
  UNIQUE(equipment_id, parameter_name) WHERE equipment_id IS NOT NULL
);

-- Примеры данных по умолчанию (глобальные нормативы)
INSERT INTO water_quality_norms (
  sampling_point_id, parameter_name, 
  optimal_min, optimal_max, 
  min_allowed, max_allowed, 
  warning_min, warning_max, 
  unit, regulation_reference
) VALUES
  (NULL, 'iron', 0.0, 0.1, 0.0, 0.3, 0.05, 0.25, 'мг/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, 'alkalinity', 1.5, 4.5, 0.5, 6.5, 1.0, 5.5, 'мг-экв/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, 'hardness', 2.0, 5.0, 1.0, 7.0, 1.5, 6.0, 'мг-экв/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, 'oxidizability', 1.0, 3.0, 0.0, 5.0, 1.0, 4.0, 'мг O₂/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, 'ph', 6.5, 8.5, 6.0, 9.0, 6.2, 8.8, 'pH', 'СанПиН 2.1.4.1074-01');

CREATE INDEX idx_norms_sampling_point ON water_quality_norms(sampling_point_id);
CREATE INDEX idx_norms_parameter ON water_quality_norms(parameter_name);
```

### 2.5. Таблица оповещений (Улучшенная версия)

```sql
CREATE TABLE public.water_quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL, -- Связь с анализом
  result_id UUID, -- Связь с конкретным результатом (опционально)
  sampling_point_id UUID NOT NULL,
  parameter_name TEXT NOT NULL,
  
  -- Тип и уровень оповещения
  alert_type TEXT NOT NULL, -- 'warning', 'alarm', 'below_min', 'above_max', 'trend'
  alert_level TEXT NOT NULL, -- 'info', 'warning', 'alarm', 'critical'
  
  -- Значения
  current_value DECIMAL(10, 4) NOT NULL,
  limit_value DECIMAL(10, 4) NOT NULL, -- Граничное значение, которое было превышено
  deviation_percent DECIMAL(5, 2), -- Процент отклонения от нормы
  
  -- Сообщение
  message TEXT NOT NULL,
  recommendation TEXT, -- Рекомендация по устранению
  
  -- Статус обработки
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'acknowledged', 'resolved', 'false_positive'
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT,
  resolution_notes TEXT, -- Примечания по устранению
  
  -- Уведомления
  notification_sent BOOLEAN DEFAULT false,
  notification_channels JSONB, -- Каналы уведомлений: ['toast', 'email', 'sms']
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_analysis FOREIGN KEY (analysis_id) 
    REFERENCES water_analysis(id) ON DELETE CASCADE,
  CONSTRAINT fk_result FOREIGN KEY (result_id) 
    REFERENCES analysis_results(id) ON DELETE SET NULL
);

CREATE INDEX idx_alerts_status ON water_quality_alerts(status, created_at DESC);
CREATE INDEX idx_alerts_unacknowledged ON water_quality_alerts(acknowledged, status) WHERE acknowledged = false;
CREATE INDEX idx_alerts_sampling_point ON water_quality_alerts(sampling_point_id, created_at DESC);
CREATE INDEX idx_alerts_parameter ON water_quality_alerts(parameter_name, created_at DESC);
```

### 2.6. Таблица статистики и KPI (для аналитики)

```sql
CREATE TABLE public.water_quality_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID,
  parameter_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
  
  -- Статистические показатели
  count INTEGER NOT NULL, -- Количество измерений
  avg_value DECIMAL(10, 4), -- Среднее значение
  min_value DECIMAL(10, 4), -- Минимальное значение
  max_value DECIMAL(10, 4), -- Максимальное значение
  std_deviation DECIMAL(10, 4), -- Стандартное отклонение
  median_value DECIMAL(10, 4), -- Медиана
  
  -- KPI
  compliance_percent DECIMAL(5, 2), -- Процент соответствия норме
  deviation_count INTEGER DEFAULT 0, -- Количество отклонений
  warning_count INTEGER DEFAULT 0, -- Количество предупреждений
  alarm_count INTEGER DEFAULT 0, -- Количество тревог
  
  -- Тренды
  trend_direction TEXT, -- 'improving', 'stable', 'degrading'
  trend_percent DECIMAL(5, 2), -- Изменение в процентах по сравнению с предыдущим периодом
  
  -- Метаданные
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(sampling_point_id, parameter_name, period_start, period_type)
);

CREATE INDEX idx_statistics_period ON water_quality_statistics(period_start, period_end);
CREATE INDEX idx_statistics_sampling_point ON water_quality_statistics(sampling_point_id, period_start DESC);
```

### 2.7. Таблица планирования отбора проб

```sql
CREATE TABLE public.sampling_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID NOT NULL,
  
  -- Расписание
  frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'custom'
  day_of_week INTEGER, -- 0-6 для weekly (0 = воскресенье)
  day_of_month INTEGER, -- 1-31 для monthly
  time_of_day TIME, -- Время отбора пробы
  custom_schedule JSONB, -- Для custom: массив дат/времен
  
  -- Настройки
  is_active BOOLEAN DEFAULT true,
  next_sampling_date DATE, -- Следующая запланированная дата
  last_reminder_sent TIMESTAMP WITH TIME ZONE,
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_sampling_point FOREIGN KEY (sampling_point_id) 
    REFERENCES sampling_points(id) ON DELETE CASCADE
);

CREATE INDEX idx_schedule_next_date ON sampling_schedule(next_sampling_date) WHERE is_active = true;
```

---

## 3. Улучшенные функциональные требования

### 3.1. Управление пунктами отбора проб

**Компоненты:**
- `SamplingPointsPage.tsx` - страница управления точками
- `SamplingPointForm.tsx` - форма создания/редактирования точки
- `SamplingPointSelector.tsx` - компонент выбора точки

**Функционал:**
- CRUD операции для точек контроля
- Привязка к оборудованию
- Настройка расписания отбора проб
- Визуализация точек на схеме (опционально)
- Импорт/экспорт списка точек

### 3.2. Ввод лабораторных анализов (Улучшенная версия)

**Компоненты:**
- `WaterAnalysisForm.tsx` - основная форма ввода
- `AnalysisResultsInput.tsx` - компонент ввода параметров
- `WaterAnalysisModal.tsx` - модальное окно быстрого ввода

**Функционал:**
- Выбор точки отбора проб (обязательно)
- Ввод даты/времени отбора пробы и анализа
- Ввод всех параметров с валидацией
- Выбор метода измерения
- Прикрепление файлов (фото, протоколы)
- Установка статуса анализа
- Автозаполнение предыдущих значений
- Сохранение черновика
- **Аудит изменений** - логирование всех изменений записи

### 3.3. Система оповещений (Расширенная версия)

**Логика оповещений:**

1. **Информационное (Info)** - значение в оптимальном диапазоне:
   - В пределах optimal_min - optimal_max
   - Зеленый индикатор

2. **Предупреждение (Warning)** - значение приближается к границе:
   - Между warning_min/max и min_allowed/max_allowed
   - В пределах 90-100% от допустимого диапазона
   - Желтый индикатор, оповещение в интерфейсе

3. **Тревога (Alarm)** - значение вышло за допустимые границы:
   - Выше max_allowed или ниже min_allowed
   - Красный индикатор, немедленное оповещение
   - Всплывающее окно, звуковой сигнал (опционально)
   - Email/SMS ответственному (настраивается)

4. **Тренд-оповещения**:
   - Быстрое ухудшение (рост >50% за неделю)
   - Стабильное превышение (3+ измерения подряд)
   - Неестественные разбросы (статистические аномалии)

**Каналы уведомлений:**
- Toast-уведомления в реальном времени
- Страница активных оповещений
- Email-уведомления (настраиваемые получатели)
- SMS-уведомления (опционально, через внешний сервис)
- Push-уведомления (для мобильных устройств)

### 3.4. Статистические методы контроля

**Компонент:** `WaterQualityControlCharts.tsx`

**Карты Шухарта (Control Charts):**
- X-bar chart (средние значения)
- R-chart (размах значений)
- Индивидуальные значения с контрольными линиями
- Выявление трендов и циклов
- Обнаружение аномалий (точки за пределами 3σ)

**Статистические показатели:**
- Среднее арифметическое (X̄)
- Медиана
- Стандартное отклонение (σ)
- Коэффициент вариации (CV)
- Процентное распределение значений

### 3.5. Интегральные показатели

**Компонент:** `WaterQualityIndices.tsx`

**Индекс Ланжелье (Langelier Saturation Index, LSI):**
```
LSI = pH - pHs
где pHs = (9.3 + A + B) - (C + D)
A = (Log10[TDS] - 1) / 10
B = -13.12 × Log10(°C + 273) + 34.55
C = Log10[Ca²⁺] - 0.4
D = Log10[alkalinity]
```
- LSI > 0: склонность к образованию накипи
- LSI < 0: коррозионная активность
- LSI ≈ 0: стабильная вода

**Индекс Ризнера (Ryznar Stability Index, RSI):**
```
RSI = 2 × pHs - pH
```
- RSI < 6: склонность к накипи
- RSI > 7: коррозионная активность

**Индекс Пакье (Puckorius Scaling Index, PSI):**
- Аналогично LSI, но с учетом буферной емкости

**Индекс качества воды (WQI):**
- Комплексный показатель на основе всех параметров
- Весовые коэффициенты для каждого параметра
- Шкала: 0-100 (отличное/хорошее/удовлетворительное/плохое)

### 3.6. Расширенная аналитика

**Компонент:** `WaterQualityAdvancedAnalytics.tsx`

**Корреляционный анализ:**
- Матрица корреляций между параметрами
- Выявление взаимосвязей (например, железо ↔ окисляемость)
- Графики рассеяния (scatter plots)

**Прогнозирование:**
- Линейная регрессия для прогноза значений
- Экспоненциальное сглаживание
- Прогноз срока замены фильтров на основе трендов
- Прогноз достижения граничных значений

**Сезонный анализ:**
- Выявление сезонных закономерностей
- Сравнение по месяцам/сезонам
- Прогнозирование с учетом сезонности

**Сравнительный анализ:**
- Сравнение точек контроля
- Сравнение периодов (месяц к месяцу, год к году)
- Бенчмаркинг (сравнение с эталонными значениями)

### 3.7. KPI и метрики производительности

**Компонент:** `WaterQualityKPIs.tsx`

**Ключевые показатели:**

1. **Процент соответствия норме:**
   ```
   Compliance % = (Анализов в норме / Всего анализов) × 100%
   ```

2. **Среднее время реакции на отклонение:**
   ```
   Reaction Time = Время между алертом и следующей записью, вернувшейся в норму
   ```

3. **Частота отклонений:**
   ```
   Deviation Rate = Количество отклонений / Общее количество измерений
   ```

4. **Эффективность очистки:**
   ```
   Removal Efficiency = ((Входное значение - Выходное значение) / Входное значение) × 100%
   ```

5. **Стабильность процесса:**
   - Коэффициент вариации (CV)
   - Процент значений в пределах ±2σ

6. **Своевременность измерений:**
   ```
   Timeliness = (Измерений в срок / Запланированных измерений) × 100%
   ```

### 3.8. Интеграция с системами управления

**Компонент:** `WaterQualityProcessControl.tsx`

**Рекомендации по коррекции:**
- Автоматические рекомендации на основе отклонений
- Расчет необходимой корректировки дозы реагента
- Предложения по настройке оборудования

**Интеграция с дозаторами (опционально):**
- API для управления дозаторами
- Режим одобрения оператором перед автоматической корректировкой
- Логирование всех автоматических действий

**Управление регенерацией:**
- Прогноз необходимости регенерации умягчителей
- Рекомендации по времени регенерации
- Отслеживание эффективности регенерации

---

## 4. Дополнительная бизнес-логика

### 4.1. Планирование и напоминания

**Компонент:** `SamplingScheduleManager.tsx`

**Функционал:**
- Календарь отбора проб
- Автоматические напоминания лаборанту
- Уведомления о пропущенных измерениях
- Генерация задач на отбор проб
- Интеграция с календарем

### 4.2. Управление ресурсами

**Компонент:** `ReagentManagement.tsx`

**Функционал:**
- Учет расхода реактивов для анализов
- Прогноз расхода на основе графика отбора проб
- Уведомления о необходимости закупки
- Связь с закупками

### 4.3. Отчетность для надзорных органов

**Компонент:** `RegulatoryReports.tsx`

**Типы отчетов:**
- Форма установленного образца
- Экспорт в требуемые форматы
- Автоматическое заполнение по шаблону
- Электронная подпись (опционально)

### 4.4. Аудит и соответствие

**Функционал:**
- Полный аудит всех изменений
- История изменений записей
- Логирование действий пользователей
- Экспорт журнала аудита
- Соответствие требованиям ISO, GMP (опционально)

---

## 5. Улучшенная структура файлов проекта

```
src/
├── pages/
│   ├── WaterQualityJournalPage.tsx          # Журнал анализов
│   ├── WaterQualityAlertsPage.tsx           # Страница оповещений
│   ├── WaterQualityReportsPage.tsx          # Отчеты
│   ├── SamplingPointsPage.tsx               # Управление точками контроля
│   ├── WaterQualityDashboardPage.tsx        # Дашборд с KPI
│   └── WaterQualityAnalyticsPage.tsx        # Расширенная аналитика
│
├── components/
│   ├── WaterQuality/
│   │   ├── WaterAnalysisForm.tsx            # Форма ввода анализа
│   │   ├── AnalysisResultsInput.tsx        # Ввод параметров
│   │   ├── WaterAnalysisTable.tsx           # Таблица анализов
│   │   ├── WaterQualityChart.tsx            # Графики
│   │   ├── WaterQualityControlCharts.tsx    # Карты Шухарта
│   │   ├── WaterQualityIndices.tsx          # Интегральные показатели
│   │   ├── WaterQualityKPIs.tsx             # KPI и метрики
│   │   ├── WaterQualityAdvancedAnalytics.tsx # Расширенная аналитика
│   │   ├── WaterQualityAlertNotification.tsx # Уведомления
│   │   ├── WaterQualityRecommendations.tsx  # Рекомендации
│   │   ├── WaterQualityReportGenerator.tsx  # Генератор отчетов
│   │   ├── SamplingPointForm.tsx            # Форма точки контроля
│   │   ├── SamplingPointSelector.tsx         # Выбор точки
│   │   ├── SamplingScheduleManager.tsx       # Планирование отбора проб
│   │   └── ReagentManagement.tsx            # Управление реактивами
│
├── services/
│   └── api/
│       ├── waterQualityApi.ts               # API функции для анализов
│       ├── samplingPointsApi.ts              # API для точек контроля
│       └── waterQualityStatisticsApi.ts     # API для статистики
│
├── hooks/
│   ├── useWaterQualityAnalysis.ts           # Хук для анализов
│   ├── useSamplingPoints.ts                  # Хук для точек контроля
│   ├── useWaterQualityAlerts.ts             # Хук для оповещений
│   ├── useWaterQualityNorms.ts               # Хук для нормативов
│   └── useWaterQualityStatistics.ts          # Хук для статистики
│
├── utils/
│   ├── waterQualityAlerts.ts                # Логика проверки границ
│   ├── waterQualityCalculations.ts          # Расчеты (LSI, RSI, WQI)
│   ├── waterQualityStatistics.ts            # Статистические расчеты
│   ├── waterQualityControlCharts.ts          # Карты Шухарта
│   ├── waterQualityFormatters.ts            # Форматирование значений
│   └── waterQualityPredictions.ts           # Прогнозирование
│
└── types/
    └── waterQuality.ts                      # TypeScript типы
```

---

## 6. Обновленные этапы реализации

### Этап 1: Базовая инфраструктура и точки контроля (2-3 недели)
- [ ] Создание всех таблиц в Supabase
- [ ] SQL миграции
- [ ] TypeScript типы
- [ ] CRUD для пунктов отбора проб
- [ ] CRUD для анализов и результатов
- [ ] Базовые API функции
- [ ] Базовая форма ввода анализа

### Этап 2: Журнал и базовые оповещения (1-2 недели)
- [ ] Страница журнала анализов
- [ ] Таблица с фильтрами и сортировкой
- [ ] Логика проверки нормативов
- [ ] Система оповещений (warning/alarm)
- [ ] Страница активных оповещений
- [ ] Toast-уведомления

### Этап 3: Графики и визуализация (1-2 недели)
- [ ] Базовые графики динамики
- [ ] Отображение нормативов на графиках
- [ ] Сравнение точек контроля
- [ ] Интеграция с существующими страницами

### Этап 4: Статистика и аналитика (2-3 недели)
- [ ] Расчет статистических показателей
- [ ] Карты Шухарта
- [ ] Интегральные показатели (LSI, RSI, WQI)
- [ ] Корреляционный анализ
- [ ] Дашборд с KPI

### Этап 5: Расширенная функциональность (2-3 недели)
- [ ] Прогнозирование и рекомендации
- [ ] Планирование отбора проб
- [ ] Напоминания и задачи
- [ ] Интеграция с планом обслуживания
- [ ] Управление реактивами

### Этап 6: Отчетность и оптимизация (1-2 недели)
- [ ] Генератор отчетов
- [ ] Экспорт в Excel/PDF
- [ ] Отчеты для надзорных органов
- [ ] Оптимизация производительности
- [ ] Документация

---

## 7. Примеры использования (обновленные)

### Сценарий 1: Создание точки контроля и первый анализ
1. Администратор создает точку контроля "После умягчителя №1" (код: SP-002)
2. Привязывает к оборудованию "Умягчитель №1"
3. Настраивает нормативы для этой точки (жесткость: оптимально 1.5-2.5, допустимо 1.0-3.0)
4. Лаборант открывает форму ввода анализа
5. Выбирает точку SP-002
6. Вводит значения параметров
7. Система автоматически проверяет против нормативов точки
8. Сохраняет анализ со статусом "completed"

### Сценарий 2: Обнаружение отклонения с расширенными оповещениями
1. Лаборант вводит анализ: жесткость = 3.2 мг-экв/л для точки SP-002
2. Система проверяет: optimal_max = 2.5, max_allowed = 3.0, warning_max = 2.8
3. Значение 3.2 > 3.0 → создается оповещение уровня "alarm"
4. Система:
   - Показывает красное toast-уведомление
   - Открывает всплывающее окно с деталями
   - Отправляет email ответственному инженеру
   - Создает запись в журнале оповещений
   - Предлагает рекомендацию: "Проверить состояние загрузки умягчителя, возможно требуется регенерация"
5. Инженер подтверждает оповещение
6. После устранения проблемы новое измерение показывает нормальные значения
7. Система автоматически помечает оповещение как "resolved"

### Сценарий 3: Статистический анализ и карты контроля
1. Администратор открывает страницу аналитики
2. Выбирает точку SP-002, параметр "жесткость", период "последний месяц"
3. Система отображает:
   - График динамики с контрольными линиями
   - Карту Шухарта (X-bar и R-chart)
   - Статистику: среднее = 2.1, σ = 0.3, CV = 14.3%
   - Выявляет аномалию: значение 3.2 выходит за пределы 3σ
4. Система показывает тренд: "Незначительное ухудшение за последнюю неделю"
5. Рекомендация: "Рекомендуется провести внеплановую регенерацию"

### Сценарий 4: Расчет интегральных показателей
1. Система автоматически рассчитывает индекс Ланжелье для каждого анализа
2. На дашборде отображается:
   - LSI = -0.5 (легкая коррозионная активность)
   - RSI = 7.2 (нормальная стабильность)
   - WQI = 85 (хорошее качество)
3. При изменении pH система пересчитывает индексы
4. При LSI < -1.0 система рекомендует корректировку pH

---

## 8. Сравнение версий

| Функция | Версия 1.0 | Версия 2.0 (Улучшенная) |
|---------|------------|-------------------------|
| Пункты отбора проб | Простое поле в форме | Отдельная сущность с управлением |
| Нормативы | Простые min/max | Оптимальные + допустимые + предупреждения |
| Статусы анализов | Нет | В работе/Завершен/Отклонение |
| Структура результатов | Денормализованная | Нормализованная (отдельная таблица) |
| Оповещения | Warning/Critical | Info/Warning/Alarm + тренды |
| Статистика | Базовая | Карты Шухарта, KPI, корреляции |
| Интегральные показатели | Только WQI | LSI, RSI, PSI, WQI |
| Аудит | Нет | Полный аудит изменений |
| Планирование | Нет | Расписание отбора проб |
| Интеграция | Нет | Рекомендации по управлению |

---

## 9. Рекомендации по реализации

### Приоритет 1 (MVP - Минимально жизнеспособный продукт):
1. ✅ Пункты отбора проб (базовый CRUD)
2. ✅ Ввод анализов с нормализованной структурой
3. ✅ Базовые нормативы (min_allowed, max_allowed)
4. ✅ Система оповещений (warning/alarm)
5. ✅ Журнал анализов с фильтрами
6. ✅ Простые графики динамики

### Приоритет 2 (Расширенный функционал):
1. Оптимальные значения в нормативах
2. Статусы анализов
3. Карты Шухарта
4. Интегральные показатели (LSI, RSI)
5. KPI и метрики
6. Планирование отбора проб

### Приоритет 3 (Продвинутые функции):
1. Корреляционный анализ
2. Прогнозирование
3. Интеграция с системами управления
4. Расширенная отчетность
5. Управление реактивами

---

## 10. Технические детали (обновленные)

### 10.1. Библиотеки для статистики
- **Статистика:** `simple-statistics` или `ml-matrix`
- **Графики:** `recharts` (рекомендуется) или `chart.js`
- **Карты контроля:** Кастомная реализация на основе `recharts`
- **Корреляции:** `ml-matrix` для матричных операций

### 10.2. Производительность
- Материализованные представления для статистики
- Периодический пересчет KPI (например, раз в час)
- Кеширование нормативов
- Индексы для быстрого поиска

### 10.3. Безопасность и аудит
- RLS политики для всех таблиц
- Триггеры для автоматического логирования изменений
- Защита от удаления критических записей
- Версионирование нормативов

---

**Дата обновления:** 2024
**Версия:** 2.0
**Статус:** Улучшенный план с расширенной функциональностью

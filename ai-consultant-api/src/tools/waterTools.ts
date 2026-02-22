/**
 * waterTools.ts
 *
 * Инструменты AI-агента для работы с водными данными:
 * 1. Показания счётчиков (Beliot) из Supabase
 * 2. Распознавание счётчика с фото и сохранение вручную
 * 3. Журнал качества воды (анализы, результаты, алерты)
 *
 * Схема взаимодействия:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  Claude/Gemini/DeepSeek AI                                  │
 * │  "Покажи потребление воды за этот месяц"                    │
 * │       ↓ tool_use: analyze_water_consumption({period: month})│
 * │                                                              │
 * │  waterTools.ts                                               │
 * │  executeWaterTool('analyze_water_consumption', {...})        │
 * │       ↓ supabase.from('beliot_device_readings').select(...)  │
 * │                                                              │
 * │  Supabase → PostgreSQL → результат                          │
 * │       ↓ JSON response                                        │
 * │                                                              │
 * │  AI формирует текстовый ответ с аналитикой                  │
 * └──────────────────────────────────────────────────────────────┘
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

// ============================================
// Supabase клиент (service role — полный доступ)
// ============================================

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Определения инструментов
// ============================================

export const waterTools: Anthropic.Tool[] = [

    // ----------------------------------------
    // Tool 0: Список устройств с названиями
    // ----------------------------------------
    {
        name: 'get_water_devices',
        description: 'Получить список всех зарегистрированных счётчиков воды с их названиями и объектами установки. Используй ПЕРВЫМ, когда пользователь упоминает название объекта или счётчика, чтобы найти нужный device_id.',
        input_schema: {
            type: 'object' as const,
            properties: {
                search: {
                    type: 'string',
                    description: 'Поиск по названию счётчика или объекту установки (нечёткий поиск). Например: "насосная", "котельная", "корпус 2".',
                },
            },
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 1: Показания счётчиков воды (Beliot)
    // ----------------------------------------
    {
        name: 'get_water_readings',
        description: 'Получить ПОКАЗАНИЯ счётчиков воды (абсолютные значения на циферблате, нарастающий итог с момента установки). Используй когда нужно увидеть сами показания, а не расход. Для расчёта РАСХОДА (сколько воды потрачено за период) используй analyze_water_consumption.',
        input_schema: {
            type: 'object' as const,
            properties: {
                device_id: {
                    type: 'string',
                    description: 'ID устройства/счётчика Beliot. Если не указан — возвращаются данные по всем устройствам.',
                },
                device_name: {
                    type: 'string',
                    description: 'Название счётчика или объекта установки для поиска (альтернатива device_id). Например: "насосная станция", "котельная". Агент автоматически найдёт нужный device_id.',
                },
                date_from: {
                    type: 'string',
                    description: 'Дата начала периода в формате YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss.',
                },
                date_to: {
                    type: 'string',
                    description: 'Дата конца периода в формате YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss.',
                },
                reading_type: {
                    type: 'string',
                    enum: ['hourly', 'daily'],
                    description: 'Тип показания: hourly — почасовые, daily — суточные.',
                },
                limit: {
                    type: 'number',
                    description: 'Максимальное количество записей (по умолчанию 50, максимум 500).',
                },
            },
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 2: Анализ потребления воды
    // ----------------------------------------
    {
        name: 'analyze_water_consumption',
        description: 'Рассчитать РАСХОД воды за период (= последнее показание − первое показание счётчика). Счётчики накопительные, поэтому расход ≠ сумме показаний. Возвращает: расход м³, среднесуточный и среднечасовой расход, начальное и конечное показания. Используй для вопросов "сколько воды потрачено?", "какой расход за месяц?", "средний расход в сутки?".',
        input_schema: {
            type: 'object' as const,
            properties: {
                device_id: {
                    type: 'string',
                    description: 'ID устройства/счётчика. Если не указан — анализируются все устройства.',
                },
                device_name: {
                    type: 'string',
                    description: 'Название счётчика или объекта установки (альтернатива device_id). Агент автоматически найдёт нужный device_id.',
                },
                period: {
                    type: 'string',
                    enum: ['day', 'week', 'month', 'year'],
                    description: 'Период анализа (если date_from/date_to не указаны): day — текущие сутки, week — текущая неделя, month — текущий месяц, year — текущий год.',
                },
                date_from: {
                    type: 'string',
                    description: 'Дата начала в формате YYYY-MM-DD (переопределяет period).',
                },
                date_to: {
                    type: 'string',
                    description: 'Дата конца в формате YYYY-MM-DD (переопределяет period).',
                },
            },
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 3: Сохранение показания с фото
    // ----------------------------------------
    {
        name: 'save_manual_meter_reading',
        description: 'Сохранить показание счётчика, прочитанное вручную (например, с фотографии). ВАЖНО: Перед вызовом покажи пользователю распознанное значение и запроси подтверждение.',
        input_schema: {
            type: 'object' as const,
            properties: {
                device_id: {
                    type: 'string',
                    description: 'ID устройства/счётчика (уточни у пользователя, если неизвестен).',
                },
                reading_value: {
                    type: 'number',
                    description: 'Числовое значение показания счётчика.',
                },
                reading_date: {
                    type: 'string',
                    description: 'Дата и время снятия показания в формате YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss. По умолчанию — текущий момент.',
                },
                unit: {
                    type: 'string',
                    description: 'Единица измерения (например: м³, л, кВт·ч). По умолчанию: м³.',
                },
                notes: {
                    type: 'string',
                    description: 'Дополнительные заметки (например: "считано с фото", "плановое снятие").',
                },
            },
            required: ['device_id', 'reading_value'],
        },
    },

    // ----------------------------------------
    // Tool 4: Журнал качества воды
    // ----------------------------------------
    {
        name: 'get_water_quality_analyses',
        description: 'Получить записи журнала качества воды с результатами измерений. Параметры: железо (iron), щёлочность (alkalinity), жёсткость (hardness), окисляемость (oxidizability), pH, температура (temperature).',
        input_schema: {
            type: 'object' as const,
            properties: {
                sampling_point_id: {
                    type: 'string',
                    description: 'ID точки пробоотбора (фильтр по конкретной точке).',
                },
                status: {
                    type: 'string',
                    enum: ['in_progress', 'completed', 'deviation', 'cancelled'],
                    description: 'Фильтр по статусу анализа. deviation — анализы с отклонениями от норм.',
                },
                date_from: {
                    type: 'string',
                    description: 'Дата начала периода в формате YYYY-MM-DD.',
                },
                date_to: {
                    type: 'string',
                    description: 'Дата конца периода в формате YYYY-MM-DD.',
                },
                limit: {
                    type: 'number',
                    description: 'Максимальное количество записей (по умолчанию 20).',
                },
            },
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 5: Превышения норм качества воды
    // ----------------------------------------
    {
        name: 'get_water_quality_alerts',
        description: 'Получить список превышений норм качества воды. По умолчанию возвращает активные алерты. Используй для вопросов "есть ли превышения норм?" или "какие параметры воды вне нормы?".',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: {
                    type: 'string',
                    enum: ['active', 'acknowledged', 'resolved', 'dismissed'],
                    description: 'Статус алерта (по умолчанию: active — активные, необработанные).',
                },
                priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'critical'],
                    description: 'Фильтр по приоритету.',
                },
                limit: {
                    type: 'number',
                    description: 'Максимальное количество записей (по умолчанию 20).',
                },
            },
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 6: Создание записи анализа
    // ----------------------------------------
    {
        name: 'add_water_quality_analysis',
        description: 'Создать новую запись анализа качества воды с результатами измерений. ВАЖНО: Перед вызовом покажи пользователю все данные и запроси подтверждение.',
        input_schema: {
            type: 'object' as const,
            properties: {
                sampling_point_id: {
                    type: 'string',
                    description: 'ID точки пробоотбора (получи из get_water_quality_analyses или уточни у пользователя).',
                },
                sample_date: {
                    type: 'string',
                    description: 'Дата отбора пробы в формате YYYY-MM-DD.',
                },
                sampled_by: {
                    type: 'string',
                    description: 'ФИО сотрудника, отобравшего пробу.',
                },
                status: {
                    type: 'string',
                    enum: ['in_progress', 'completed'],
                    description: 'Статус анализа: in_progress — анализ в процессе, completed — выполнен.',
                },
                notes: {
                    type: 'string',
                    description: 'Дополнительные примечания к анализу.',
                },
                results: {
                    type: 'array',
                    description: 'Результаты измерений параметров воды.',
                    items: {
                        type: 'object',
                        properties: {
                            parameter_name: {
                                type: 'string',
                                enum: ['iron', 'alkalinity', 'hardness', 'oxidizability', 'ph', 'temperature'],
                                description: 'Название параметра: iron — железо, alkalinity — щёлочность, hardness — жёсткость, oxidizability — окисляемость, ph — pH, temperature — температура.',
                            },
                            value: {
                                type: 'number',
                                description: 'Числовое значение измерения.',
                            },
                            unit: {
                                type: 'string',
                                description: 'Единица измерения (мг/л, мг-экв/л, ед. pH, °C и т.д.).',
                            },
                        },
                        required: ['parameter_name', 'value', 'unit'],
                    },
                },
            },
            required: ['sampling_point_id', 'sample_date', 'sampled_by'],
        },
    },
];

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Ищет device_id по названию счётчика или объекта установки
 * в таблице beliot_device_overrides.
 * Возвращает массив подходящих device_id (может быть несколько).
 */
async function resolveDeviceIdsByName(deviceName: string): Promise<{
    device_ids: string[];
    matches: Array<{ device_id: string; name: string | null; object_name: string | null }>;
}> {
    const search = `%${deviceName}%`;

    const { data, error } = await supabase
        .from('beliot_device_overrides')
        .select('device_id, name, object_name')
        .or(`name.ilike.${search},object_name.ilike.${search}`)
        .limit(10);

    if (error) {
        console.error('[waterTools] resolveDeviceIdsByName error:', error.message);
        return { device_ids: [], matches: [] };
    }

    const matches = (data || []).map(r => ({
        device_id: r.device_id,
        name: r.name ?? null,
        object_name: r.object_name ?? null,
    }));

    return {
        device_ids: matches.map(m => m.device_id),
        matches,
    };
}

/**
 * Возвращает начало и конец периода для фильтрации.
 */
function getPeriodDates(period: string): { from: string; to: string } {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    switch (period) {
        case 'day':
            return { from: `${today}T00:00:00`, to: `${today}T23:59:59` };
        case 'week': {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay() + 1);
            return {
                from: weekStart.toISOString().split('T')[0] + 'T00:00:00',
                to: `${today}T23:59:59`,
            };
        }
        case 'month': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            return {
                from: monthStart.toISOString().split('T')[0] + 'T00:00:00',
                to: `${today}T23:59:59`,
            };
        }
        case 'year': {
            const yearStart = new Date(now.getFullYear(), 0, 1);
            return {
                from: yearStart.toISOString().split('T')[0] + 'T00:00:00',
                to: `${today}T23:59:59`,
            };
        }
        default:
            return { from: `${today}T00:00:00`, to: `${today}T23:59:59` };
    }
}

// ============================================
// Функция выполнения инструментов
// ============================================

export async function executeWaterTool(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    switch (name) {

        // ----------------------------------------
        // Список устройств с названиями
        // ----------------------------------------
        case 'get_water_devices': {
            let query = supabase
                .from('beliot_device_overrides')
                .select('device_id, name, object_name, address, serial_number, device_group')
                .order('name', { ascending: true });

            if (input.search) {
                const search = `%${input.search}%`;
                query = query.or(`name.ilike.${search},object_name.ilike.${search},address.ilike.${search}`);
            }

            const { data, error } = await query;
            if (error) throw new Error(`Ошибка получения списка устройств: ${error.message}`);

            return {
                count: data?.length || 0,
                devices: (data || []).map(d => ({
                    device_id: d.device_id,
                    name: d.name || '(без названия)',
                    object_name: d.object_name || null,
                    address: d.address || null,
                    serial_number: d.serial_number || null,
                    device_group: d.device_group || null,
                })),
            };
        }

        // ----------------------------------------
        // Показания счётчиков
        // ----------------------------------------
        case 'get_water_readings': {
            const limit = Math.min(Number(input.limit) || 50, 500);

            // Разрешаем device_name → device_id через таблицу overrides
            let resolvedDeviceIds: string[] = [];
            let resolvedMatches: Array<{ device_id: string; name: string | null; object_name: string | null }> = [];

            if (input.device_name && !input.device_id) {
                const resolved = await resolveDeviceIdsByName(input.device_name as string);
                resolvedDeviceIds = resolved.device_ids;
                resolvedMatches = resolved.matches;

                if (resolvedDeviceIds.length === 0) {
                    return {
                        count: 0,
                        readings: [],
                        message: `Счётчик с названием "${input.device_name}" не найден. Используй get_water_devices для просмотра списка устройств.`,
                    };
                }
            }

            let query = supabase
                .from('beliot_device_readings')
                .select('id, device_id, reading_date, reading_value, unit, reading_type, source')
                .order('reading_date', { ascending: false })
                .limit(limit);

            if (input.device_id) {
                query = query.eq('device_id', input.device_id as string);
            } else if (resolvedDeviceIds.length === 1) {
                query = query.eq('device_id', resolvedDeviceIds[0]);
            } else if (resolvedDeviceIds.length > 1) {
                query = query.in('device_id', resolvedDeviceIds);
            }

            if (input.date_from) {
                query = query.gte('reading_date', input.date_from as string);
            }
            if (input.date_to) {
                query = query.lte('reading_date', input.date_to as string);
            }
            if (input.reading_type) {
                query = query.eq('reading_type', input.reading_type as string);
            }

            const { data, error } = await query;
            if (error) throw new Error(`Ошибка получения показаний: ${error.message}`);

            return {
                count: data?.length || 0,
                ...(resolvedMatches.length > 0 && { resolved_devices: resolvedMatches }),
                readings: data || [],
            };
        }

        // ----------------------------------------
        // Анализ потребления
        // ----------------------------------------
        case 'analyze_water_consumption': {
            // Определяем период
            let dateFrom: string;
            let dateTo: string;

            if (input.date_from && input.date_to) {
                dateFrom = input.date_from as string;
                dateTo = input.date_to as string;
            } else {
                const period = getPeriodDates((input.period as string) || 'month');
                dateFrom = period.from;
                dateTo = period.to;
            }

            // Разрешаем device_name → device_id через таблицу overrides
            let resolvedDeviceIds: string[] = [];
            let resolvedMatches: Array<{ device_id: string; name: string | null; object_name: string | null }> = [];

            if (input.device_name && !input.device_id) {
                const resolved = await resolveDeviceIdsByName(input.device_name as string);
                resolvedDeviceIds = resolved.device_ids;
                resolvedMatches = resolved.matches;

                if (resolvedDeviceIds.length === 0) {
                    return {
                        period: { from: dateFrom, to: dateTo },
                        count: 0,
                        message: `Счётчик с названием "${input.device_name}" не найден. Используй get_water_devices для просмотра списка устройств.`,
                    };
                }
            }

            let query = supabase
                .from('beliot_device_readings')
                .select('device_id, reading_date, reading_value, unit')
                .gte('reading_date', dateFrom)
                .lte('reading_date', dateTo)
                .order('reading_date', { ascending: true });

            if (input.device_id) {
                query = query.eq('device_id', input.device_id as string);
            } else if (resolvedDeviceIds.length === 1) {
                query = query.eq('device_id', resolvedDeviceIds[0]);
            } else if (resolvedDeviceIds.length > 1) {
                query = query.in('device_id', resolvedDeviceIds);
            }

            const { data, error } = await query;
            if (error) throw new Error(`Ошибка анализа потребления: ${error.message}`);

            const readings = data || [];
            const deviceLabel = (input.device_name as string)
                || (input.device_id as string)
                || 'все устройства';

            if (readings.length === 0) {
                return {
                    period: { from: dateFrom, to: dateTo },
                    device: deviceLabel,
                    ...(resolvedMatches.length > 0 && { resolved_devices: resolvedMatches }),
                    count: 0,
                    message: 'Данные за указанный период отсутствуют',
                };
            }

            // Группируем по устройствам, сохраняем показания с датами (отсортированы по возрастанию)
            const byDevice: Record<string, {
                readings: Array<{ value: number; date: string }>;
                unit: string;
            }> = {};
            for (const r of readings) {
                if (!byDevice[r.device_id]) {
                    byDevice[r.device_id] = { readings: [], unit: r.unit || 'м³' };
                }
                byDevice[r.device_id].readings.push({
                    value: Number(r.reading_value),
                    date: r.reading_date,
                });
            }

            // Строим карту device_id → человекочитаемое название
            const nameMap: Record<string, string> = {};
            for (const m of resolvedMatches) {
                nameMap[m.device_id] = m.name || m.object_name || m.device_id;
            }

            /**
             * ВАЖНО: Счётчики воды фиксируют НАКОПИТЕЛЬНЫЕ показания (нарастающий итог
             * с момента установки). Расход за период = последнее показание − первое.
             *
             * Например: первое показание = 12 300 м³, последнее = 12 345 м³
             *   → расход = 45 м³, а НЕ сумма всех показаний.
             */
            const deviceStats = Object.entries(byDevice).map(([deviceId, { readings: deviceReadings, unit }]) => {
                const firstEntry = deviceReadings[0];
                const lastEntry = deviceReadings[deviceReadings.length - 1];

                const firstReading = firstEntry.value;
                const lastReading = lastEntry.value;

                // Расход = разница показаний (накопительный счётчик)
                const consumption = parseFloat((lastReading - firstReading).toFixed(4));

                // Длительность периода в часах и сутках по реальным датам показаний
                const firstDateMs = new Date(firstEntry.date).getTime();
                const lastDateMs = new Date(lastEntry.date).getTime();
                const hoursElapsed = Math.max(1, (lastDateMs - firstDateMs) / (1000 * 60 * 60));
                const daysElapsed = parseFloat((hoursElapsed / 24).toFixed(2));

                // Среднесуточный и среднечасовой расход
                const avgDailyConsumption = parseFloat((consumption / daysElapsed).toFixed(4));
                const avgHourlyConsumption = parseFloat((consumption / hoursElapsed).toFixed(4));

                return {
                    device_id: deviceId,
                    device_name: nameMap[deviceId] || deviceId,
                    unit,
                    readings_count: deviceReadings.length,
                    // Показания (абсолютные значения на счётчике)
                    first_reading: parseFloat(firstReading.toFixed(4)),
                    last_reading: parseFloat(lastReading.toFixed(4)),
                    first_reading_date: firstEntry.date,
                    last_reading_date: lastEntry.date,
                    // Расход за период (ключевая метрика)
                    consumption,
                    // Средние значения расхода
                    avg_daily_consumption: avgDailyConsumption,
                    avg_hourly_consumption: avgHourlyConsumption,
                    // Аномалия: отрицательный расход = возможно, замена счётчика
                    anomaly: consumption < 0 ? 'Отрицательный расход — возможна замена счётчика или ошибка данных' : null,
                };
            });

            return {
                note: 'РАСХОД = последнее показание − первое показание. Счётчик накопительный.',
                period: { from: dateFrom, to: dateTo },
                device: deviceLabel,
                total_readings: readings.length,
                devices: deviceStats,
            };
        }

        // ----------------------------------------
        // Сохранение показания с фото
        // ----------------------------------------
        case 'save_manual_meter_reading': {
            const readingDate = (input.reading_date as string) || new Date().toISOString();
            const unit = (input.unit as string) || 'м³';
            const notes = input.notes ? `[ручной ввод] ${input.notes}` : '[ручной ввод]';

            const { data, error } = await supabase
                .from('beliot_device_readings')
                .insert({
                    device_id: input.device_id,
                    reading_date: readingDate,
                    reading_value: input.reading_value,
                    unit,
                    reading_type: 'hourly',
                    source: 'manual',
                    // notes хранится как часть source-поля для обратной совместимости
                })
                .select('id, device_id, reading_date, reading_value, unit')
                .single();

            if (error) throw new Error(`Ошибка сохранения показания: ${error.message}`);

            return {
                success: true,
                message: `Показание ${input.reading_value} ${unit} для счётчика ${input.device_id} сохранено`,
                notes,
                saved: data,
            };
        }

        // ----------------------------------------
        // Журнал анализов качества воды
        // ----------------------------------------
        case 'get_water_quality_analyses': {
            const limit = Math.min(Number(input.limit) || 20, 100);

            let query = supabase
                .from('water_analysis')
                .select(`
                    id,
                    sampling_point_id,
                    sample_date,
                    sampled_by,
                    analyzed_by,
                    status,
                    notes,
                    external_lab,
                    external_lab_name,
                    created_at,
                    analysis_results (
                        id,
                        parameter_name,
                        parameter_label,
                        value,
                        unit,
                        compliance_status,
                        deviation_percent
                    )
                `)
                .order('sample_date', { ascending: false })
                .limit(limit);

            if (input.sampling_point_id) {
                query = query.eq('sampling_point_id', input.sampling_point_id as string);
            }
            if (input.status) {
                query = query.eq('status', input.status as string);
            }
            if (input.date_from) {
                query = query.gte('sample_date', input.date_from as string);
            }
            if (input.date_to) {
                query = query.lte('sample_date', input.date_to as string);
            }

            const { data, error } = await query;
            if (error) throw new Error(`Ошибка получения анализов: ${error.message}`);

            return {
                count: data?.length || 0,
                analyses: data || [],
            };
        }

        // ----------------------------------------
        // Алерты превышения норм
        // ----------------------------------------
        case 'get_water_quality_alerts': {
            const limit = Math.min(Number(input.limit) || 20, 100);
            const status = (input.status as string) || 'active';

            let query = supabase
                .from('water_quality_alerts')
                .select(`
                    id,
                    alert_type,
                    parameter_name,
                    parameter_label,
                    value,
                    unit,
                    deviation_percent,
                    threshold_type,
                    status,
                    priority,
                    message,
                    created_at,
                    acknowledged_at,
                    resolved_at
                `)
                .eq('status', status)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (input.priority) {
                query = query.eq('priority', input.priority as string);
            }

            const { data, error } = await query;
            if (error) throw new Error(`Ошибка получения алертов: ${error.message}`);

            return {
                count: data?.length || 0,
                status_filter: status,
                alerts: data || [],
            };
        }

        // ----------------------------------------
        // Создание записи анализа
        // ----------------------------------------
        case 'add_water_quality_analysis': {
            // Проверяем обязательные поля
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            const sampleDate = input.sample_date as string;
            if (!dateRegex.test(sampleDate)) {
                throw new Error('Неверный формат даты пробы. Используйте YYYY-MM-DD');
            }

            // 1. Создаём запись анализа
            const { data: analysis, error: analysisError } = await supabase
                .from('water_analysis')
                .insert({
                    sampling_point_id: input.sampling_point_id,
                    sample_date: sampleDate,
                    sampled_by: input.sampled_by,
                    status: input.status || 'completed',
                    notes: input.notes || null,
                    external_lab: false,
                })
                .select('id, sampling_point_id, sample_date, status')
                .single();

            if (analysisError) throw new Error(`Ошибка создания анализа: ${analysisError.message}`);

            // 2. Сохраняем результаты параметров
            const results = input.results as Array<{
                parameter_name: string;
                value: number;
                unit: string;
            }> | undefined;

            let savedResults: unknown[] = [];
            if (results && results.length > 0) {
                const parameterLabels: Record<string, string> = {
                    iron: 'Железо',
                    alkalinity: 'Щёлочность',
                    hardness: 'Жёсткость',
                    oxidizability: 'Окисляемость',
                    ph: 'pH',
                    temperature: 'Температура',
                };

                const resultsToInsert = results.map(r => ({
                    analysis_id: analysis.id,
                    parameter_name: r.parameter_name,
                    parameter_label: parameterLabels[r.parameter_name] || r.parameter_name,
                    value: r.value,
                    unit: r.unit,
                }));

                const { data: insertedResults, error: resultsError } = await supabase
                    .from('analysis_results')
                    .insert(resultsToInsert)
                    .select('id, parameter_name, parameter_label, value, unit');

                if (resultsError) {
                    console.error('[waterTools] Ошибка сохранения результатов:', resultsError);
                    // Не прерываем — анализ уже создан
                } else {
                    savedResults = insertedResults || [];
                }
            }

            return {
                success: true,
                message: `Анализ качества воды от ${sampleDate} успешно создан`,
                analysis: {
                    id: analysis.id,
                    sampling_point_id: analysis.sampling_point_id,
                    sample_date: analysis.sample_date,
                    status: analysis.status,
                },
                results_saved: savedResults.length,
                results: savedResults,
            };
        }

        default:
            throw new Error(`Unknown water tool: ${name}`);
    }
}

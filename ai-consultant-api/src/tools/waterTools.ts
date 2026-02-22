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
    // Tool 1: Показания счётчиков воды (Beliot)
    // ----------------------------------------
    {
        name: 'get_water_readings',
        description: 'Получить показания счётчиков воды из базы данных. Можно фильтровать по ID устройства, периоду и типу показания.',
        input_schema: {
            type: 'object' as const,
            properties: {
                device_id: {
                    type: 'string',
                    description: 'ID устройства/счётчика Beliot. Если не указан — возвращаются данные по всем устройствам.',
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
        description: 'Проанализировать потребление воды за период: итого, среднее, мин/макс, тренд. Используй для вопросов типа "сколько воды потрачено за месяц?" или "есть ли аномалии в потреблении?".',
        input_schema: {
            type: 'object' as const,
            properties: {
                device_id: {
                    type: 'string',
                    description: 'ID устройства/счётчика. Если не указан — анализируются все устройства.',
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
// Вспомогательные функции для дат
// ============================================

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
        // Показания счётчиков
        // ----------------------------------------
        case 'get_water_readings': {
            const limit = Math.min(Number(input.limit) || 50, 500);

            let query = supabase
                .from('beliot_device_readings')
                .select('id, device_id, reading_date, reading_value, unit, reading_type, source')
                .order('reading_date', { ascending: false })
                .limit(limit);

            if (input.device_id) {
                query = query.eq('device_id', input.device_id as string);
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

            let query = supabase
                .from('beliot_device_readings')
                .select('device_id, reading_date, reading_value, unit')
                .gte('reading_date', dateFrom)
                .lte('reading_date', dateTo)
                .order('reading_date', { ascending: true });

            if (input.device_id) {
                query = query.eq('device_id', input.device_id as string);
            }

            const { data, error } = await query;
            if (error) throw new Error(`Ошибка анализа потребления: ${error.message}`);

            const readings = data || [];
            if (readings.length === 0) {
                return {
                    period: { from: dateFrom, to: dateTo },
                    device_id: input.device_id || 'все устройства',
                    count: 0,
                    message: 'Данные за указанный период отсутствуют',
                };
            }

            // Группируем по устройствам
            const byDevice: Record<string, { values: number[]; unit: string }> = {};
            for (const r of readings) {
                if (!byDevice[r.device_id]) {
                    byDevice[r.device_id] = { values: [], unit: r.unit || 'м³' };
                }
                byDevice[r.device_id].values.push(Number(r.reading_value));
            }

            // Статистика по каждому устройству
            const deviceStats = Object.entries(byDevice).map(([deviceId, { values, unit }]) => {
                const sum = values.reduce((a, b) => a + b, 0);
                const avg = sum / values.length;
                const min = Math.min(...values);
                const max = Math.max(...values);
                // Тренд: разница последнего и первого показания
                const trend = values[values.length - 1] - values[0];

                return {
                    device_id: deviceId,
                    unit,
                    count: values.length,
                    total: parseFloat(sum.toFixed(4)),
                    average: parseFloat(avg.toFixed(4)),
                    min: parseFloat(min.toFixed(4)),
                    max: parseFloat(max.toFixed(4)),
                    trend: parseFloat(trend.toFixed(4)),
                    trend_direction: trend > 0 ? 'рост' : trend < 0 ? 'снижение' : 'стабильно',
                };
            });

            return {
                period: { from: dateFrom, to: dateTo },
                device_id: input.device_id || 'все устройства',
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

-- Редактор пишется в updated_by. Авторство не затирается, если поля не переданы.

ALTER TABLE public.water_analysis
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

CREATE OR REPLACE FUNCTION public.save_water_analysis_bundle(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  result_row jsonb;
  delete_id uuid;
BEGIN
  IF COALESCE(payload->>'sampling_point_id', '') = '' OR COALESCE(payload->>'sample_date', '') = '' THEN
    RAISE EXCEPTION 'sampling_point_id and sample_date are required';
  END IF;

  v_id := COALESCE(NULLIF(payload->>'analysis_id', '')::uuid, gen_random_uuid());

  INSERT INTO public.water_analysis (
    id,
    sampling_point_id,
    equipment_id,
    sample_date,
    sampled_by,
    analyzed_by,
    responsible_person,
    status,
    notes,
    sample_condition,
    external_lab,
    external_lab_name,
    updated_by
  ) VALUES (
    v_id,
    (payload->>'sampling_point_id')::uuid,
    NULLIF(payload->>'equipment_id', ''),
    (payload->>'sample_date')::timestamptz,
    NULLIF(payload->>'sampled_by', ''),
    NULLIF(payload->>'analyzed_by', ''),
    NULLIF(payload->>'responsible_person', ''),
    COALESCE(NULLIF(payload->>'status', ''), 'in_progress'),
    NULLIF(payload->>'notes', ''),
    NULLIF(payload->>'sample_condition', ''),
    COALESCE((payload->>'external_lab')::boolean, false),
    NULLIF(payload->>'external_lab_name', ''),
    NULLIF(payload->>'updated_by', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    sampling_point_id = EXCLUDED.sampling_point_id,
    equipment_id = EXCLUDED.equipment_id,
    sample_date = EXCLUDED.sample_date,
    sampled_by = CASE
      WHEN payload ? 'sampled_by' THEN EXCLUDED.sampled_by
      ELSE water_analysis.sampled_by
    END,
    analyzed_by = CASE
      WHEN payload ? 'analyzed_by' THEN EXCLUDED.analyzed_by
      ELSE water_analysis.analyzed_by
    END,
    responsible_person = CASE
      WHEN payload ? 'responsible_person' THEN EXCLUDED.responsible_person
      ELSE water_analysis.responsible_person
    END,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    sample_condition = EXCLUDED.sample_condition,
    external_lab = EXCLUDED.external_lab,
    external_lab_name = EXCLUDED.external_lab_name,
    updated_by = COALESCE(EXCLUDED.updated_by, water_analysis.updated_by),
    updated_at = NOW();

  IF payload ? 'delete_result_ids' THEN
    FOR delete_id IN
      SELECT jsonb_array_elements_text(payload->'delete_result_ids')::uuid
    LOOP
      DELETE FROM public.analysis_results
      WHERE id = delete_id AND analysis_id = v_id;
    END LOOP;
  END IF;

  IF payload ? 'results' THEN
    FOR result_row IN
      SELECT value FROM jsonb_array_elements(COALESCE(payload->'results', '[]'::jsonb))
    LOOP
      INSERT INTO public.analysis_results (
        analysis_id,
        parameter_name,
        parameter_label,
        value,
        unit,
        method
      ) VALUES (
        v_id,
        result_row->>'parameter_name',
        result_row->>'parameter_label',
        (result_row->>'value')::numeric,
        result_row->>'unit',
        NULLIF(result_row->>'method', '')
      )
      ON CONFLICT (analysis_id, parameter_name) DO UPDATE SET
        parameter_label = EXCLUDED.parameter_label,
        value = EXCLUDED.value,
        unit = EXCLUDED.unit,
        method = EXCLUDED.method;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_water_analysis_bundle(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_water_analysis_bundle(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_water_analysis_bundle(jsonb) TO service_role;

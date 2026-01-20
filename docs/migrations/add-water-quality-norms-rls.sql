-- RLS policies for water_quality_norms (insert/update/delete)
-- Idempotent: drops existing policies before creating

ALTER TABLE public.water_quality_norms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert water_quality_norms" ON public.water_quality_norms;
CREATE POLICY "Users can insert water_quality_norms" ON public.water_quality_norms
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update water_quality_norms" ON public.water_quality_norms;
CREATE POLICY "Users can update water_quality_norms" ON public.water_quality_norms
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete water_quality_norms" ON public.water_quality_norms;
CREATE POLICY "Users can delete water_quality_norms" ON public.water_quality_norms
  FOR DELETE USING (auth.role() = 'authenticated');

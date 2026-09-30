-- ============================================================
-- Постоянный индекс документации оборудования
-- ============================================================
-- PDF и другие документы разбираются по страницам, затем на chunks.
-- Для каждого chunk хранятся исходный текст, полнотекстовый индекс
-- и embedding для поиска по смыслу.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.document_index_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    TEXT NOT NULL,
  equipment_name  TEXT,
  drive_file_id   TEXT NOT NULL,
  drive_file_url  TEXT,
  file_name       TEXT NOT NULL,
  mime_type       TEXT,
  folder_path     TEXT,
  modified_time   TEXT,
  content_hash    TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  error           TEXT,
  truncated       BOOLEAN NOT NULL DEFAULT false,
  page_count      INTEGER,
  chunk_count     INTEGER NOT NULL DEFAULT 0,
  embedding_model TEXT,
  indexed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_index_files_status_check
    CHECK (status IN ('pending', 'indexing', 'ready', 'error', 'skipped')),
  CONSTRAINT document_index_files_equipment_drive_key
    UNIQUE (equipment_id, drive_file_id)
);

CREATE TABLE IF NOT EXISTS public.document_index_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       UUID NOT NULL REFERENCES public.document_index_files(id) ON DELETE CASCADE,
  equipment_id  TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  page_start    INTEGER,
  page_end      INTEGER,
  section_title TEXT,
  content       TEXT NOT NULL,
  content_tsv   tsvector GENERATED ALWAYS AS (to_tsvector('russian', content)) STORED,
  embedding     extensions.vector(768),
  embedding_model TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_index_chunks_file_index_key UNIQUE (file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_index_files_status
  ON public.document_index_files (status, updated_at);

CREATE INDEX IF NOT EXISTS document_index_chunks_equipment
  ON public.document_index_chunks (equipment_id);

CREATE INDEX IF NOT EXISTS document_index_chunks_tsv
  ON public.document_index_chunks USING gin (content_tsv);

CREATE INDEX IF NOT EXISTS document_index_chunks_embedding_hnsw
  ON public.document_index_chunks
  USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.document_index_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_index_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages document index files" ON public.document_index_files;
CREATE POLICY "Service role manages document index files"
  ON public.document_index_files FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages document index chunks" ON public.document_index_chunks;
CREATE POLICY "Service role manages document index chunks"
  ON public.document_index_chunks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.match_equipment_document_chunks(
  p_equipment_id text,
  p_embedding extensions.vector(768),
  p_match_count integer
)
RETURNS TABLE (id uuid, distance double precision)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT chunks.id, (chunks.embedding <=> p_embedding) AS distance
  FROM public.document_index_chunks AS chunks
  WHERE chunks.equipment_id = p_equipment_id
    AND chunks.embedding IS NOT NULL
  ORDER BY chunks.embedding <=> p_embedding
  LIMIT GREATEST(COALESCE(p_match_count, 1), 1);
$$;

REVOKE ALL ON FUNCTION public.match_equipment_document_chunks(text, extensions.vector, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_equipment_document_chunks(text, extensions.vector, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_equipment_document_chunks(text, extensions.vector, integer) TO service_role;

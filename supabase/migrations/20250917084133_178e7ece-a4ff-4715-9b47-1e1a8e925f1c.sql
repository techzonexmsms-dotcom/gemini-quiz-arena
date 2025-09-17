-- إصلاح مشاكل search_path للدالات
CREATE OR REPLACE FUNCTION public.cleanup_old_global_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.global_question_usage 
  WHERE last_used_at < now() - interval '45 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_question_hash(question_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN encode(digest(lower(trim(question_text)), 'sha256'), 'hex');
END;
$$;
-- إنشاء جدول لتتبع الأسئلة المستخدمة عالمياً لمنع التكرار لمدة شهر
CREATE TABLE IF NOT EXISTS public.global_question_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL UNIQUE, -- hash للنص لسهولة البحث
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- إنشاء فهرس لتسريع البحث بالتاريخ
CREATE INDEX IF NOT EXISTS idx_global_question_usage_last_used 
ON public.global_question_usage (last_used_at);

-- إنشاء فهرس لتسريع البحث بالهاش
CREATE INDEX IF NOT EXISTS idx_global_question_usage_hash 
ON public.global_question_usage (question_hash);

-- دالة لتنظيف الأسئلة القديمة (أكثر من 45 يوماً)
CREATE OR REPLACE FUNCTION public.cleanup_old_global_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.global_question_usage 
  WHERE last_used_at < now() - interval '45 days';
END;
$$;

-- إضافة سياسات RLS
ALTER TABLE public.global_question_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "الجميع يمكنهم قراءة استخدام الأسئلة العالمي" 
ON public.global_question_usage 
FOR SELECT 
USING (true);

CREATE POLICY "الجميع يمكنهم إضافة استخدام الأسئلة العالمي" 
ON public.global_question_usage 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "الجميع يمكنهم تحديث استخدام الأسئلة العالمي" 
ON public.global_question_usage 
FOR UPDATE 
USING (true);

-- دالة لحساب هاش النص
CREATE OR REPLACE FUNCTION public.generate_question_hash(question_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN encode(digest(lower(trim(question_text)), 'sha256'), 'hex');
END;
$$;
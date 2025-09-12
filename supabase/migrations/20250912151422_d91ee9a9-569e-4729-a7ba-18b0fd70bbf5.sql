-- إنشاء جدول الغرف
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  host_id UUID,
  max_players INTEGER NOT NULL CHECK (max_players >= 2 AND max_players <= 15),
  current_players INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  current_question_id UUID,
  question_start_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- إنشاء جدول اللاعبين
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_answer_time TIMESTAMP WITH TIME ZONE
);

-- إنشاء جدول الأسئلة المخزنة
CREATE TABLE public.questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- مصفوفة الخيارات
  correct_answer INTEGER NOT NULL, -- رقم الإجابة الصحيحة (0-3)
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- إنشاء جدول أسئلة الغرفة
CREATE TABLE public.room_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer INTEGER NOT NULL,
  question_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- إنشاء جدول الإجابات
CREATE TABLE public.player_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.room_questions(id) ON DELETE CASCADE,
  selected_answer INTEGER, -- null إذا لم يجب
  is_correct BOOLEAN,
  answered_at TIMESTAMP WITH TIME ZONE,
  points_earned INTEGER NOT NULL DEFAULT 0,
  UNIQUE(player_id, question_id)
);

-- تمكين RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_answers ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان للغرف
CREATE POLICY "الجميع يمكنهم رؤية الغرف"
  ON public.rooms FOR SELECT
  USING (true);

CREATE POLICY "الجميع يمكنهم إنشاء غرف"
  ON public.rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "المضيف يمكنه تحديث الغرفة"
  ON public.rooms FOR UPDATE
  USING (true);

-- سياسات الأمان للاعبين
CREATE POLICY "الجميع يمكنهم رؤية اللاعبين"
  ON public.players FOR SELECT
  USING (true);

CREATE POLICY "الجميع يمكنهم الانضمام كلاعبين"
  ON public.players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "اللاعب يمكنه تحديث بياناته"
  ON public.players FOR UPDATE
  USING (true);

-- سياسات الأمان للأسئلة
CREATE POLICY "الجميع يمكنهم رؤية الأسئلة المخزنة"
  ON public.questions FOR SELECT
  USING (true);

CREATE POLICY "الجميع يمكنهم إضافة أسئلة"
  ON public.questions FOR INSERT
  WITH CHECK (true);

-- سياسات أسئلة الغرفة
CREATE POLICY "الجميع يمكنهم رؤية أسئلة الغرفة"
  ON public.room_questions FOR SELECT
  USING (true);

CREATE POLICY "الجميع يمكنهم إضافة أسئلة للغرفة"
  ON public.room_questions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "الجميع يمكنهم تحديث أسئلة الغرفة"
  ON public.room_questions FOR UPDATE
  USING (true);

-- سياسات الإجابات
CREATE POLICY "الجميع يمكنهم رؤية الإجابات"
  ON public.player_answers FOR SELECT
  USING (true);

CREATE POLICY "الجميع يمكنهم إضافة إجابات"
  ON public.player_answers FOR INSERT
  WITH CHECK (true);

-- إنشاء دوال التحديث التلقائي
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- إضافة مشغل التحديث التلقائي للغرف
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- دالة لتوليد رمز الغرفة
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER := 0;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- دالة لحذف الأسئلة القديمة (أكثر من شهر)
CREATE OR REPLACE FUNCTION cleanup_old_questions()
RETURNS void AS $$
BEGIN
  DELETE FROM public.questions 
  WHERE created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql;

-- تمكين التحديثات المباشرة
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.room_questions REPLICA IDENTITY FULL;
ALTER TABLE public.player_answers REPLICA IDENTITY FULL;

-- إضافة الجداول للنشر المباشر
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_answers;
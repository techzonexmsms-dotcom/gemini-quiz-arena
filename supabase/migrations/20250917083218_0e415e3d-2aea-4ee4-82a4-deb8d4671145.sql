-- Clean duplicates then add unique constraints to prevent repeated answers and duplicate room questions

-- 1) Ensure one answer per player per question
WITH duplicates AS (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY player_id, question_id ORDER BY answered_at NULLS LAST, id) AS rn
    FROM public.player_answers
  ) t
  WHERE t.rn > 1
)
DELETE FROM public.player_answers WHERE id IN (SELECT id FROM duplicates);

CREATE UNIQUE INDEX IF NOT EXISTS uq_player_answers_player_question
ON public.player_answers (player_id, question_id);

-- 2) Ensure no duplicate question text per room
WITH rq_dups AS (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY room_id, question_text ORDER BY created_at, id) AS rn
    FROM public.room_questions
  ) t
  WHERE t.rn > 1
)
DELETE FROM public.room_questions WHERE id IN (SELECT id FROM rq_dups);

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_questions_room_question_text
ON public.room_questions (room_id, question_text);
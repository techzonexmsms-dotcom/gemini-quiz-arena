-- Add a column to track if/when a room question has been shown to players
ALTER TABLE public.room_questions
ADD COLUMN IF NOT EXISTS shown_at TIMESTAMPTZ;

-- Helpful index to quickly fetch remaining (unshown) questions per room
CREATE INDEX IF NOT EXISTS idx_room_questions_room_shown
ON public.room_questions (room_id, shown_at);

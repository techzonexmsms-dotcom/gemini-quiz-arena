-- تمكين الامتدادات المطلوبة للكرون وطلبات الشبكة
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- إنشاء كرون جوب لتوليد الأسئلة يومياً في الساعة 8:00 صباحاً
SELECT cron.schedule(
  'daily-questions-generator',
  '0 8 * * *', -- كل يوم في الساعة 8:00 صباحاً
  $$
  SELECT
    net.http_post(
        url:='https://pwvdlmgpgyfpzoyrduok.supabase.co/functions/v1/daily-questions-generator',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3dmRsbWdwZ3lmcHpveXJkdW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2ODgzNzUsImV4cCI6MjA3MzI2NDM3NX0.3AcQxWYmfd-zFpBpIrhB1wrbfPvkGGhsmH882NenVX4"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);

-- تنفيذ فوري لتوليد 1000 سؤال الآن
SELECT
  net.http_post(
      url:='https://pwvdlmgpgyfpzoyrduok.supabase.co/functions/v1/daily-questions-generator',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3dmRsbWdwZ3lmcHpveXJkdW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2ODgzNzUsImV4cCI6MjA3MzI2NDM3NX0.3AcQxWYmfd-zFpBpIrhB1wrbfPvkGGhsmH882NenVX4"}'::jsonb,
      body:='{"immediate": true}'::jsonb
  ) as request_id;
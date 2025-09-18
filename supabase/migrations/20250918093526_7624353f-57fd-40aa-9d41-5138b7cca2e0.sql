-- إنشاء schema منفصل للامتدادات لحل التحذير الأمني
CREATE SCHEMA IF NOT EXISTS extensions;

-- نقل امتدادات pg_cron و pg_net من public schema إلى extensions schema
ALTER EXTENSION pg_cron SET SCHEMA extensions;
ALTER EXTENSION pg_net SET SCHEMA extensions;
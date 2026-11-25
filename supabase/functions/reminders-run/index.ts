// supabase/functions/reminders-run/index.ts
// Edge Function invoked by pg_cron to process subscription and credit reminders per market timezone

export const REMINDERS_SQL = `SELECT public.run_scheduled_reminders() AS result;`;


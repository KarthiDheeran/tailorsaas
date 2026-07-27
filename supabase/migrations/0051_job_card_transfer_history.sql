-- Job-card staff transfers are an auditable production event.
-- Payroll advances remain immutable staff_payments entries; the transfer
-- history notes whether an advance was recorded against the prior tailor.

alter table public.job_card_activity_logs
  drop constraint if exists job_card_activity_logs_action_type_check;

alter table public.job_card_activity_logs
  add constraint job_card_activity_logs_action_type_check
  check (action_type in (
    'Assigned',
    'Started',
    'Stage Moved',
    'Completed',
    'Delayed',
    'Rework',
    'Transferred'
  ));

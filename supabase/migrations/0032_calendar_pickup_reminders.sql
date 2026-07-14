-- Add Ready-for-Pickup reminders to the calendar reminder ledger.

alter table calendar_reminders
  drop constraint if exists calendar_reminders_reminder_type_check;

alter table calendar_reminders
  add constraint calendar_reminders_reminder_type_check
  check (reminder_type in ('Delivery','Trial','Production','Payment','Pickup'));

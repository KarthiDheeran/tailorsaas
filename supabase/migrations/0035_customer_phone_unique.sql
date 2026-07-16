-- Prevent duplicate customer master records for the same phone number.
-- The New Order quick-create flow also checks before save, but this index is
-- the race-condition guard when two requests try the same phone together.
create unique index if not exists customers_phone_unique_idx on customers (phone);

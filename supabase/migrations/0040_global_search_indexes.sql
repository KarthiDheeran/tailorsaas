-- Compact global command-palette search.
-- Trigram indexes support the MVP's case-insensitive partial matching without
-- introducing an external search service.

create extension if not exists pg_trgm;

create index if not exists customers_name_trgm_idx
  on customers using gin (name gin_trgm_ops);
create index if not exists customers_area_trgm_idx
  on customers using gin (area gin_trgm_ops);
create index if not exists customers_phone_trgm_idx
  on customers using gin (phone gin_trgm_ops);
create index if not exists customers_number_trgm_idx
  on customers using gin (customer_number gin_trgm_ops);

create index if not exists orders_number_trgm_idx
  on orders using gin (order_number gin_trgm_ops);
create index if not exists orders_customer_name_trgm_idx
  on orders using gin ((customer_snapshot ->> 'name') gin_trgm_ops);
create index if not exists orders_customer_phone_trgm_idx
  on orders using gin ((customer_snapshot ->> 'phone') gin_trgm_ops);
create index if not exists order_items_particular_trgm_idx
  on order_items using gin (particular gin_trgm_ops);

create index if not exists job_cards_number_trgm_idx
  on job_cards using gin (job_card_number gin_trgm_ops);
create index if not exists job_cards_order_number_trgm_idx
  on job_cards using gin (order_number gin_trgm_ops);
create index if not exists job_cards_customer_name_trgm_idx
  on job_cards using gin ((customer_snapshot ->> 'name') gin_trgm_ops);
create index if not exists job_cards_customer_phone_trgm_idx
  on job_cards using gin ((customer_snapshot ->> 'phone') gin_trgm_ops);
create index if not exists job_cards_garment_type_trgm_idx
  on job_cards using gin (garment_type gin_trgm_ops);
create index if not exists job_cards_assigned_staff_idx
  on job_cards (assigned_staff_id);

create index if not exists staff_name_trgm_idx
  on staff using gin (name gin_trgm_ops);
create index if not exists staff_phone_trgm_idx
  on staff using gin (phone gin_trgm_ops);
create index if not exists staff_role_trgm_idx
  on staff using gin (role gin_trgm_ops);

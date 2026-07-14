-- Inventory purchase metadata and material-usage links.
-- Keeps the MVP stock model simple, but makes vendor/cost and per-order usage
-- reportable instead of burying them in free-text movement reasons.

alter table inventory_items
  add column if not exists vendor_name text not null default '',
  add column if not exists purchase_date date,
  add column if not exists purchase_cost numeric check (purchase_cost is null or purchase_cost >= 0);

alter table inventory_movements
  add column if not exists order_id uuid references orders(id) on delete set null,
  add column if not exists job_card_id uuid references job_cards(id) on delete set null;

create index if not exists inventory_movements_order_idx
  on inventory_movements (order_id, movement_date desc);

create index if not exists inventory_movements_job_card_idx
  on inventory_movements (job_card_id, movement_date desc);

-- Customer tailoring memory: preferences and recurring notes that belong to
-- the customer record, not to a single order or measurement session.

alter table customers
  add column category_preference text not null default '',
  add column fit_preference text not null default '',
  add column style_preference text not null default '',
  add column fabric_source_preference text not null default 'Not specified'
    check (fabric_source_preference in ('Not specified','Customer provided','Shop provided','Either')),
  add column frequent_complaints text not null default '',
  add column notes text not null default '';

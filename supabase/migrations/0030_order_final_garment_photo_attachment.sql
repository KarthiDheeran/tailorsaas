-- Add an explicit final garment photo category for order dispute prevention.
-- Existing order attachment metadata/storage is unchanged.

alter table order_attachments
  drop constraint if exists order_attachments_attachment_type_check;

alter table order_attachments
  add constraint order_attachments_attachment_type_check
  check (
    attachment_type in (
      'Design Reference',
      'Fabric Photo',
      'Sample Photo',
      'Trial Photo',
      'Alteration Photo',
      'Final Garment Photo',
      'Other'
    )
  );

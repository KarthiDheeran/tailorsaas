-- Tailoring-specific role presets.
-- The permissions engine already exists; this migration adds shop-native
-- defaults so owners do not have to build common roles by hand.

insert into roles (id, name, description, type, permissions) values
  (
    'role-tailor',
    'Tailor',
    'Assigned-work access for stitchers, cutters, and masters. No payments, reports, or customer management.',
    'system',
    array[
      'staff.view',
      'customers.viewMeasurements'
    ]
  ),
  (
    'role-receptionist',
    'Receptionist',
    'Front-desk access for creating customers, orders, measurements, receipts, and reminders. No voiding payments or role management.',
    'system',
    array[
      'dashboard.view',
      'calendar.view',
      'orders.view', 'orders.create', 'orders.changeStatus',
      'orders.viewPayments', 'orders.recordPayment',
      'orders.printCustomerReceipt', 'orders.printJobCard',
      'customers.view', 'customers.create', 'customers.edit',
      'customers.viewMeasurements', 'customers.editMeasurements',
      'catalog.view'
    ]
  ),
  (
    'role-accountant',
    'Accountant',
    'Money and reporting access: payments, receipts, expenses, and reports without order editing.',
    'system',
    array[
      'dashboard.view',
      'orders.view', 'orders.viewPayments', 'orders.recordPayment', 'orders.voidPayment',
      'orders.printCustomerReceipt',
      'expenses.view', 'expenses.manage',
      'reports.view'
    ]
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  permissions = excluded.permissions;

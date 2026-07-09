-- OPTIONAL dev/demo seed data for the Phase 6D staff table — NOT part of
-- the 0007_staff.sql migration and not applied automatically. Run manually
-- against a dev project only, e.g.:
--   supabase db execute -f supabase/seed/dev_staff_seed.sql
-- (or paste into the dashboard SQL editor).
--
-- Recreates the original 6 mock staff members with their original
-- STAFF-0001..STAFF-0006 numbers (explicit, not generated) so a developer
-- gets the same familiar sample data to click through, and so the Users &
-- Access staff-link dropdown has real options during testing.
--
-- Explicit numbers mean staff_number_seq (currently at 0, unused) must be
-- fast-forwarded past 6 afterward — otherwise the next real
-- generate_staff_number() call would return STAFF-0001 again and collide
-- with the unique constraint.

insert into staff (staff_number, name, phone, role, joining_date, address, emergency_contact, status, payment_type, base_salary, piece_rates)
values
  ('STAFF-0001', 'Ramesh Tailor', '9811122233', 'Master Tailor', '2022-03-01', '14 Shivaji Nagar', '9822233344', 'Active', 'Salary', 22000, null),
  ('STAFF-0002', 'Vikas Chavan', '9822334455', 'Cutter', '2023-01-15', '9 Deccan Gymkhana', '9833445566', 'Active', 'Per Piece', null, '{"Cutting": 100}'),
  ('STAFF-0003', 'Sunita Jadhav', '9833445577', 'Stitching Staff', '2023-06-10', '22 Aundh Road', '9844556677', 'Active', 'Per Piece', null, '{"Stitching": 200, "Alteration": 80}'),
  ('STAFF-0004', 'Farida Shaikh', '9844556688', 'Embroidery Staff', '2024-02-20', '5 Camp Area', '9855667788', 'Active', 'Per Piece', null, '{"Embroidery": 300}'),
  ('STAFF-0005', 'Manoj Pawar', '9855667799', 'Finishing Staff', '2024-05-05', '31 Hadapsar', '9866778899', 'On Leave', 'Per Piece', null, '{"Finishing": 80, "Ironing/Packing": 40}'),
  ('STAFF-0006', 'Anil Gaikwad', '9866778800', 'Delivery Staff', '2023-09-18', '2 Wanowrie', '9877889900', 'Active', 'Salary', 9000, null);

-- Required: fast-forward the sequence past the 6 explicit numbers above so
-- the next generate_staff_number() call returns STAFF-0007, not a repeat.
select setval('staff_number_seq', 6, true);

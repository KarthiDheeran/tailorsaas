-- Replace the live Chudidar Work Details dropdowns with the customer's list.
-- Historical order snapshots are not changed.
-- Tailor amount shorthand supplied by the customer is converted as follows:
--   1 = 10, 2 = 20, 5 = 50.
-- Exact duplicate source rows are included only once. The unnamed ₹130 row
-- is intentionally omitted because it cannot be identified in a dropdown.

do $$
declare
  v_field_id uuid;
  v_field_count integer;
begin
  select count(distinct cf.id)
    into v_field_count
  from public.catalog_fields cf
  join public.garment_type_fields gtf on gtf.field_id = cf.id
  join public.catalog_garment_types gt on gt.id = gtf.garment_type_id
  where gt.order_section = 'Chudidar'
    and cf.code = 'work_details'
    and cf.input_type = 'table';

  if v_field_count <> 1 then
    raise exception 'Expected exactly one Chudidar work_details table field; found %.', v_field_count;
  end if;

  select cf.id
    into v_field_id
  from public.catalog_fields cf
  join public.garment_type_fields gtf on gtf.field_id = cf.id
  join public.catalog_garment_types gt on gt.id = gtf.garment_type_id
  where gt.order_section = 'Chudidar'
    and cf.code = 'work_details'
    and cf.input_type = 'table'
  limit 1;

  if v_field_id is null then
    raise exception 'Chudidar work_details table field was not found.';
  end if;

  update public.catalog_fields
  set name = 'Work Details - Chudidar',
      ui_metadata = jsonb_build_object(
        'table', jsonb_build_object(
          'rows', jsonb_build_array(
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'LINING EDU', 'labelTa', 'LINING EDU', 'itemPrice', 120, 'workerStage', 'Stitching', 'tailorAmount', 0)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'SHAWL', 'labelTa', 'SHAWL', 'itemPrice', 0, 'workerStage', 'Stitching', 'tailorAmount', 0)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'NECK PIPING', 'labelTa', 'நெக் பைப்பிங்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'NECK & SLEEVE PIPING', 'labelTa', 'நெக், கை பைப்பிங்', 'itemPrice', 60, 'workerStage', 'Stitching', 'tailorAmount', 20),
              jsonb_build_object('label', 'SLEEVE PIPING', 'labelTa', 'கை பைப்பிங்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'SHIRT COLLAR', 'labelTa', 'சர்ட் காலர்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'SMALL COLLAR - TOP FABRIC', 'labelTa', 'சின்னகாலர்டாப்துணி', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'BOAT NECK', 'labelTa', 'போட் நெக்', 'itemPrice', 50, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'KURTA COLLAR - TOP FABRIC', 'labelTa', 'குர்தா காலர்டாப் துணியில்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'KURTA COLLAR - PANT FABRIC', 'labelTa', 'குர்தா காலர்பேண்ட் துணி', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'ELASTIC PANT', 'labelTa', 'எலாஸ்டிக் பேண்ட்', 'itemPrice', 250, 'workerStage', 'Stitching', 'tailorAmount', 50),
              jsonb_build_object('label', 'PATIALA PANT', 'labelTa', 'பட்டியாலாபேண்ட்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'REGULAR PANT', 'labelTa', 'சாதா பேண்ட்', 'itemPrice', 0, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'CRUSH PANT', 'labelTa', 'கிரஷ் பேண்ட்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'BACK NECK KNOT', 'labelTa', 'பேக் நெக் நாட்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'ELBOW', 'labelTa', 'எல் போ', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'PUFF SLEEVE', 'labelTa', 'பஃப் கை', 'itemPrice', 100, 'workerStage', 'Stitching', 'tailorAmount', 20),
              jsonb_build_object('label', 'ELBOW LINING', 'labelTa', 'எல்போ லைனிங்', 'itemPrice', 50, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'ELBOW 4 PLEATS', 'labelTa', 'எல்போ 4 பிலிட்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'ELBOW LINING 4 PLEATS', 'labelTa', 'எல்போ லை 4 பிலிட்', 'itemPrice', 50, 'workerStage', 'Stitching', 'tailorAmount', 10)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'SLEEVE PIPING', 'labelTa', 'கை பைப்பிங்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'ELBOW', 'labelTa', 'எல் போ', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'SLEEVE BORDER', 'labelTa', 'கை பாடர்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'SLEEVE 4 PLEATS', 'labelTa', 'கை 4 பிலிட்', 'itemPrice', 0, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'BACK NECK KNOT', 'labelTa', 'பேக் நெக் நாட்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'SMALL COLLAR - PANT FABRIC', 'labelTa', 'சின்னகாலர்பேண்ட்துணி', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'BOTTOM BORDER', 'labelTa', 'கீழ் பார்டர்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'NECK & SLEEVE BORDER', 'labelTa', 'நெக் கை பார்டர்', 'itemPrice', 60, 'workerStage', 'Stitching', 'tailorAmount', 20),
              jsonb_build_object('label', 'NECK BORDER', 'labelTa', 'நெக்பாடர்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'OPEN PIPING', 'labelTa', 'ஓப்பன் பைப்பிங்', 'itemPrice', 3, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'OPEN BORDER', 'labelTa', 'ஓப்பன் பார்டர்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'SLEEVE LINING REQUIRED', 'labelTa', 'கைக்குலைனிங்வேண்டும்', 'itemPrice', 20, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'SLEEVE LINING NOT REQUIRED', 'labelTa', 'கைக்குலைனிங்வேண்டாம்', 'itemPrice', 0, 'workerStage', 'Stitching', 'tailorAmount', 0)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'PANT POCKET', 'labelTa', 'பேண்டில் பாக்கெட்', 'itemPrice', 40, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'BACK ZIP', 'labelTa', 'பேக் ஜிப்', 'itemPrice', 50, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'FRONT ZIP', 'labelTa', 'பிரண்ட் ஜிப்', 'itemPrice', 50, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'CENTER BORDER', 'labelTa', 'சென்டர் பார்டர்', 'itemPrice', 30, 'workerStage', 'Stitching', 'tailorAmount', 10),
              jsonb_build_object('label', 'EXTRA', 'labelTa', 'EXTRA', 'itemPrice', 10, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'BACK DART', 'labelTa', 'பின் டாட்', 'itemPrice', 0, 'workerStage', 'Stitching', 'tailorAmount', 0)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'NO TOP OPENING', 'labelTa', 'டாப் ஓப்பன் வேண்டாம்', 'itemPrice', 0, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'TOP POCKET', 'labelTa', 'டாப்பில் பாக்கெட்', 'itemPrice', 20, 'workerStage', 'Stitching', 'tailorAmount', 0),
              jsonb_build_object('label', 'PANT POCKET', 'labelTa', 'பேண்டில் பாக்கெட்', 'itemPrice', 20, 'workerStage', 'Stitching', 'tailorAmount', 0)
            )),
            jsonb_build_object('itemOptions', jsonb_build_array(
              jsonb_build_object('label', 'PANT', 'labelTa', 'பேண்ட்', 'itemPrice', 150, 'workerStage', 'Stitching', 'tailorAmount', 10)
            ))
          ),
          'columns', jsonb_build_array(
            jsonb_build_object('key', 'item', 'type', 'select', 'label', 'Item Name', 'optionsSource', 'row.itemOptions'),
            jsonb_build_object('key', 'qty', 'type', 'number', 'label', 'Qty'),
            jsonb_build_object('key', 'tailorAmount', 'type', 'number', 'label', 'Tailor Amt', 'readonly', true),
            jsonb_build_object('key', 'itemPrice', 'type', 'number', 'label', 'Item Price', 'readonly', true),
            jsonb_build_object('key', 'total', 'type', 'calculated', 'label', 'Total', 'formula', 'qty*itemPrice'),
            jsonb_build_object('key', 'display', 'type', 'display', 'label', 'Display', 'template', '{item}')
          )
        )
      ),
      updated_at = now()
  where id = v_field_id;

  raise notice 'Chudidar work details replaced on catalog field %.', v_field_id;
end $$;

select cf.id, cf.name,
  jsonb_array_length(cf.ui_metadata #> '{table,rows}') as combo_rows
from public.catalog_fields cf
where cf.code = 'work_details'
  and cf.name = 'Work Details - Chudidar';

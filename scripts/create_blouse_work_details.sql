-- Create an independent Work Details - B table for all Blouse garments.
-- Safe to re-run. Historical order snapshots are not modified.
-- Tailor amount shorthand is converted to rupees by multiplying by 10.

do $$
declare
  v_chudidar_field public.catalog_fields%rowtype;
  v_blouse_field_id uuid;
begin
  select cf.* into v_chudidar_field
  from public.catalog_fields cf
  where cf.code = 'work_details'
    and cf.input_type = 'table'
  limit 1;

  if v_chudidar_field.id is null then
    raise exception 'Work Details - C source field was not found.';
  end if;

  insert into public.catalog_fields (
    code, name, field_type, default_section_id, input_type, unit, placeholder,
    options_json, ui_metadata, min_value, max_value, decimal_places,
    is_required_default, display_order, is_active, is_system
  ) values (
    'work_details_b', 'Work Details - B', v_chudidar_field.field_type,
    v_chudidar_field.default_section_id, 'table', v_chudidar_field.unit,
    v_chudidar_field.placeholder, '[]'::jsonb,
    $metadata$
    {
      "table": {
        "rows": [
          {"itemOptions": [
            {"label":"LINING","labelTa":"லைனிங்","itemPrice":60,"workerStage":"Stitching","tailorAmount":0}
          ]},
          {"itemOptions": [
            {"label":"SAREE BORDER REMOVAL + FALLS","labelTa":"சேலை ஓரம் எடு பால்ஸ்","itemPrice":100,"workerStage":"Stitching","tailorAmount":20},
            {"label":"SAREE BORDER","labelTa":"சேலை ஓரம்","itemPrice":30,"workerStage":"Stitching","tailorAmount":10}
          ]},
          {"itemOptions": [
            {"label":"SLEEVE & NECK PIPING","labelTa":"கை ,நெக் பைப்பிங்","itemPrice":150,"workerStage":"Stitching","tailorAmount":30},
            {"label":"SLEEVE PIPING","labelTa":"கை பைப்பிங்","itemPrice":50,"workerStage":"Stitching","tailorAmount":10},
            {"label":"NECK PIPING","labelTa":"நெக் பைப்பிங்","itemPrice":100,"workerStage":"Stitching","tailorAmount":20},
            {"label":"NECK HEMMING","labelTa":"நெக் எம்மிங்","itemPrice":20,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SLEEVE & NECK LACE","labelTa":"கை ,நெக் லேஷ்","itemPrice":150,"workerStage":"Stitching","tailorAmount":20},
            {"label":"SLEEVE LACE","labelTa":"கை லேஷ்","itemPrice":50,"workerStage":"Stitching","tailorAmount":10},
            {"label":"NECK LACE","labelTa":"நெக் லேஷ்","itemPrice":100,"workerStage":"Stitching","tailorAmount":10},
            {"label":"SLEEVE & NECK BORDER","labelTa":"கை, நெக் பார்டர்","itemPrice":150,"workerStage":"Stitching","tailorAmount":20},
            {"label":"SLEEVE BORDER","labelTa":"கை பார்டர்","itemPrice":50,"workerStage":"Stitching","tailorAmount":10},
            {"label":"NECK BORDER","labelTa":"நெக் பார்டர்","itemPrice":100,"workerStage":"Stitching","tailorAmount":10},
            {"label":"REGULAR PIPING","labelTa":"சாதா பைப்பிங்","itemPrice":50,"workerStage":"Stitching","tailorAmount":10}
          ]},
          {"itemOptions": [
            {"label":"BACK NECK KNOT","labelTa":"பேக் நெக் நாட்","itemPrice":80,"workerStage":"Stitching","tailorAmount":10},
            {"label":"BACK NECK KNOT + BALL","labelTa":"பேக் நெக் நாட் + பால்","itemPrice":150,"workerStage":"Stitching","tailorAmount":10},
            {"label":"BOAT NECK","labelTa":"போட் நெக்","itemPrice":0,"workerStage":"Stitching","tailorAmount":0},
            {"label":"BOAT NECK COLS","labelTa":"போட் நெக் கோல்ஸ்","itemPrice":200,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SLEEVE & NECK GOLD BEADS","labelTa":"கை, நெக் கோல்ட் பாசி","itemPrice":200,"workerStage":"Stitching","tailorAmount":20},
            {"label":"SLEEVE GOLD BEADS","labelTa":"கை கோல்ட் பாசி","itemPrice":100,"workerStage":"Stitching","tailorAmount":10},
            {"label":"NECK GOLD BEADS","labelTa":"நெக் கோல்ட் பாசி","itemPrice":100,"workerStage":"Stitching","tailorAmount":10},
            {"label":"SKIRT BLOUSE","labelTa":"ஸ்கர்ட் பிளவுஸ்","itemPrice":0,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SHOULDER BUTTON","labelTa":"சோல்டர் பட்டன்","itemPrice":20,"workerStage":"Stitching","tailorAmount":0}
          ]},
          {"itemOptions": [
            {"label":"PRINCESS CUT","labelTa":"பிரின்சஸ்கட்","itemPrice":500,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SLEEVE & NECK BALL","labelTa":"கை நெக் பால்","itemPrice":750,"workerStage":"Stitching","tailorAmount":150},
            {"label":"SLEEVE BALL","labelTa":"கை பால்","itemPrice":250,"workerStage":"Stitching","tailorAmount":50},
            {"label":"NECK BALL","labelTa":"நெக் பால்","itemPrice":500,"workerStage":"Stitching","tailorAmount":100},
            {"label":"COLLAR","labelTa":"காலர்","itemPrice":50,"workerStage":"Stitching","tailorAmount":10},
            {"label":"NECK HEMMING","labelTa":"நெக் எம்மிங்","itemPrice":20,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SLEEVE 4 PLEATS","labelTa":"கை 4 Fleet","itemPrice":0,"workerStage":"Stitching","tailorAmount":0},
            {"label":"RAISED PUFF SLEEVE","labelTa":"தூக்கிர பப்கை","itemPrice":100,"workerStage":"Stitching","tailorAmount":20},
            {"label":"NON-RAISED PUFF SLEEVE","labelTa":"தூக்காமல் பப்கை","itemPrice":100,"workerStage":"Stitching","tailorAmount":20},
            {"label":"SLEEVE MODEL","labelTa":"கை மாடல்","itemPrice":300,"workerStage":"Stitching","tailorAmount":50}
          ]},
          {"itemOptions": [
            {"label":"RAISED PUFF SLEEVE - ELBOW","labelTa":"தூக்கிர பப்கை ELBOW","itemPrice":150,"workerStage":"Stitching","tailorAmount":50},
            {"label":"NON-RAISED PUFF SLEEVE - ELBOW","labelTa":"தூக்காமல் பப்கை ELBOW","itemPrice":150,"workerStage":"Stitching","tailorAmount":50}
          ]},
          {"itemOptions": [
            {"label":"SAREE BORDER","labelTa":"சேலை ஓரம்","itemPrice":30,"workerStage":"Stitching","tailorAmount":10},
            {"label":"SAREE BORDER + FALLS","labelTa":"சேலை ஓரம் பால்ஸ்","itemPrice":60,"workerStage":"Stitching","tailorAmount":20},
            {"label":"FALLS","labelTa":"பால்ஸ்","itemPrice":30,"workerStage":"Stitching","tailorAmount":10},
            {"label":"BACK HOOK","labelTa":"பேக் ஊக்","itemPrice":0,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SAREE FINISHING","labelTa":"சேலை முடி","itemPrice":100,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SLEEVE 4 PLEATS","labelTa":"கை 4 FILIT","itemPrice":0,"workerStage":"Stitching","tailorAmount":0},
            {"label":"FALLS HEMMING","labelTa":"பால்ஸ் எம்மிங்","itemPrice":150,"workerStage":"Stitching","tailorAmount":0},
            {"label":"SLEEVE FRILL","labelTa":"கைக்கு பிரில்","itemPrice":180,"workerStage":"Stitching","tailorAmount":40}
          ]},
          {"itemOptions": [
            {"label":"MODEL","labelTa":"மாடல்","itemPrice":600,"workerStage":"Stitching","tailorAmount":150},
            {"label":"SLEEVE & NECK BALL","labelTa":"கை நெக் பால்","itemPrice":750,"workerStage":"Stitching","tailorAmount":150},
            {"label":"SLEEVE FRILL","labelTa":"கைக்கு பிரில்","itemPrice":180,"workerStage":"Stitching","tailorAmount":40},
            {"label":"SHOULDER BUTTON","labelTa":"சோல்டர் பட்டன்","itemPrice":20,"workerStage":"Stitching","tailorAmount":0}
          ]},
          {"itemOptions": [
            {"label":"SHOULDER BUTTON","labelTa":"சோல்டர் பட்டன்","itemPrice":20,"workerStage":"Stitching","tailorAmount":0},
            {"label":"BACK HOOK","labelTa":"பேக் ஊக்","itemPrice":0,"workerStage":"Stitching","tailorAmount":0},
            {"label":"EXTRA","labelTa":"EXTRA","itemPrice":0,"workerStage":"Stitching","tailorAmount":0},
            {"label":"NECK PIPING","labelTa":"நெக் பைப்பிங்","itemPrice":100,"workerStage":"Stitching","tailorAmount":20},
            {"label":"SLEEVE PIPING","labelTa":"கை பைப்பிங்","itemPrice":50,"workerStage":"Stitching","tailorAmount":10}
          ]},
          {"itemOptions": [
            {"label":"SIDE ZIP","labelTa":"SIDE ZIP","itemPrice":100,"workerStage":"Stitching","tailorAmount":10},
            {"label":"NECK PIPING","labelTa":"நெக் பைப்பிங்","itemPrice":100,"workerStage":"Stitching","tailorAmount":20}
          ]},
          {"itemOptions": [
            {"label":"EMBROIDERY","labelTa":"எம்ப்ராய்டிங்","itemPrice":0,"workerStage":"Stitching","tailorAmount":50},
            {"label":"REGULAR EMBROIDERY","labelTa":"சாதா எம்ப்ராய்டிங்","itemPrice":0,"workerStage":"Stitching","tailorAmount":0}
          ]}
        ],
        "columns": [
          {"key":"item","type":"select","label":"Item Name","optionsSource":"row.itemOptions"},
          {"key":"qty","type":"number","label":"Qty"},
          {"key":"tailorAmount","type":"number","label":"Tailor Amt","readonly":true},
          {"key":"itemPrice","type":"number","label":"Item Price","readonly":true},
          {"key":"total","type":"calculated","label":"Total","formula":"qty*itemPrice"},
          {"key":"display","type":"display","label":"Display","template":"{item}"}
        ]
      }
    }
    $metadata$::jsonb,
    v_chudidar_field.min_value, v_chudidar_field.max_value,
    v_chudidar_field.decimal_places, false, v_chudidar_field.display_order,
    true, false
  )
  on conflict (code) do update set
    name = excluded.name,
    default_section_id = excluded.default_section_id,
    input_type = excluded.input_type,
    ui_metadata = excluded.ui_metadata,
    is_active = true,
    updated_at = now()
  returning id into v_blouse_field_id;

  -- Attach the independent field to every Blouse garment. Preserve the old
  -- field's section/order when available; otherwise append it to the section.
  insert into public.garment_type_fields (
    garment_type_id, field_id, section_id, display_order, is_required, default_value
  )
  select gt.id, v_blouse_field_id, v_chudidar_field.default_section_id,
    coalesce(
      (select old_map.display_order
       from public.garment_type_fields old_map
       where old_map.garment_type_id = gt.id
         and old_map.field_id = v_chudidar_field.id),
      (select coalesce(max(existing.display_order), 0) + 1
       from public.garment_type_fields existing
       where existing.garment_type_id = gt.id)
    ),
    false, null
  from public.catalog_garment_types gt
  where gt.order_section = 'Blouse'
  on conflict (garment_type_id, field_id) do update set
    section_id = excluded.section_id,
    display_order = excluded.display_order,
    updated_at = now();

  -- Blouse must no longer use the Chudidar options.
  delete from public.garment_type_fields mapping
  using public.catalog_garment_types gt
  where mapping.garment_type_id = gt.id
    and gt.order_section = 'Blouse'
    and mapping.field_id = v_chudidar_field.id;

  raise notice 'Work Details - B created and assigned to all Blouse garments.';
end $$;

select cf.code, cf.name,
  jsonb_array_length(cf.ui_metadata #> '{table,rows}') as combo_rows,
  count(gtf.id) as blouse_garments
from public.catalog_fields cf
left join public.garment_type_fields gtf on gtf.field_id = cf.id
left join public.catalog_garment_types gt
  on gt.id = gtf.garment_type_id and gt.order_section = 'Blouse'
where cf.code = 'work_details_b'
group by cf.id, cf.code, cf.name, cf.ui_metadata;

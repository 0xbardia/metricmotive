-- Keep historical duplicate chain writes visible without presenting them as
-- independent product cases. This is local metadata only; chain history is
-- never rewritten.
alter table guards add column if not exists record_class text not null default 'PRIMARY';
alter table guards add column if not exists superseded_by text references guards(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guards_record_class_check'
      and conrelid = 'guards'::regclass
  ) then
    alter table guards add constraint guards_record_class_check
      check (record_class in ('PRIMARY', 'DUPLICATE', 'TEST'));
  end if;
end $$;

create index if not exists guards_record_class_idx on guards (record_class);

-- Guard 4 is the first completed V2 case for this definition. Guard 9 is the
-- completed V3 draft for its near-duplicate family. Older local rows remain
-- for auditability and are linked as superseded, never deleted.
update guards
set record_class='DUPLICATE', superseded_by='grd_72a77a0da4b856c9', updated_at=now()
where id in ('grd_796801cb77d5ce22', 'grd_91f405f6b1da9698', 'grd_89d3f2e214c6c357')
  and parent_id='grd_d70b9500e452a9dd'
  and version=2
  and definition_hash='efa3870097da2ea54e4a9e9a625a3ebba95b770e8e58ad3e07b70fc49f8106f2';

update guards
set record_class='DUPLICATE', superseded_by='grd_53a7e8eb4dd7060f', updated_at=now()
where id='grd_f2825fe8c7bb7a04'
  and parent_id='grd_72a77a0da4b856c9'
  and version=3
  and definition_hash='84e6780d27a7e770280804c789d2023540094ea931b3a93101c693d29f5530a6';

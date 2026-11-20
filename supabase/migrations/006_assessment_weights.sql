-- Configurable sequence components and annual term weighting.
alter table public.terms
  add column if not exists annual_weight numeric(6,2) not null default 1
  check (annual_weight > 0);

alter table public.sequences
  drop constraint if exists sequences_seq_no_check,
  add column if not exists label text,
  add column if not exists weight numeric(6,2) not null default 1
  check (weight > 0);

update public.sequences
set label = 'Sequence ' || seq_no
where label is null or btrim(label) = '';

alter table public.sequences
  alter column label set default 'Assessment',
  alter column label set not null,
  add constraint sequences_seq_no_positive check (seq_no > 0);

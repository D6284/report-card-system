-- 004_report_archive.sql: private bucket for generated PDFs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-archives', 'report-archives', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "reports read own school" on storage.objects for select
  using (bucket_id = 'report-archives' and is_school_member(((storage.foldername(name))[1])::uuid));

create policy "reports admin write" on storage.objects for insert
  with check (bucket_id = 'report-archives' and is_school_admin(((storage.foldername(name))[1])::uuid));

create policy "reports admin delete" on storage.objects for delete
  using (bucket_id = 'report-archives' and is_school_admin(((storage.foldername(name))[1])::uuid));

-- Executar uma vez após schema.sql, sem apagar dados.
begin;
create schema if not exists gem_private;
revoke all on schema gem_private from public,anon;
grant usage on schema gem_private to authenticated;
alter function public.gem_snapshot() set schema gem_private;
alter function public.gem_apply_operation(uuid,jsonb) set schema gem_private;
create function public.gem_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select gem_private.gem_snapshot() $$;
create function public.gem_apply_operation(operation_id uuid, operation jsonb) returns jsonb language sql security invoker set search_path='' as $$ select gem_private.gem_apply_operation(operation_id,operation) $$;
revoke all on function public.gem_snapshot(),public.gem_apply_operation(uuid,jsonb) from public,anon;
revoke all on function gem_private.gem_snapshot(),gem_private.gem_apply_operation(uuid,jsonb) from public,anon;
grant execute on function public.gem_snapshot(),public.gem_apply_operation(uuid,jsonb) to authenticated;
grant execute on function gem_private.gem_snapshot(),gem_private.gem_apply_operation(uuid,jsonb) to authenticated;
create index if not exists gem_students_created_by_idx on public.gem_students(created_by);
create index if not exists gem_studies_instructor_idx on public.gem_studies(instructor_id);
create index if not exists gem_attendance_instructor_idx on public.gem_attendance(instructor_id);
create index if not exists gem_receipts_instructor_idx on public.gem_receipts(instructor_id);
-- O assistente de criação pode expor um event trigger com EXECUTE público.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke all on function public.rls_auto_enable() from public,anon,authenticated';
 end if;
end $$;
commit;

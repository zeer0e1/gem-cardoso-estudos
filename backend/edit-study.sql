begin;
create or replace function gem_private.gem_edit_study(operation_id uuid,study_id uuid,previous jsonb,changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.gem_instructors; saved public.gem_studies; receipt public.gem_receipts; result jsonb; request_value jsonb:=jsonb_build_object('kind','edit_study','study_id',study_id,'previous',previous,'changes',changes);
begin
 select * into actor from public.gem_instructors where id=auth.uid() and enabled;
 if not found then raise exception 'INSTRUCTOR_NOT_ENABLED' using errcode='42501'; end if;
 if operation_id is null then raise exception 'INVALID_OPERATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.gem_receipts where id=operation_id;
 if found then
  if receipt.instructor_id<>actor.id or receipt.request<>request_value then raise exception 'OPERATION_ID_REUSED'; end if;
  return receipt.result;
 end if;
 select * into saved from public.gem_studies where id=study_id for update;
 if not found then raise exception 'STUDY_NOT_FOUND'; end if;
 if previous is distinct from jsonb_build_object('lesson_date',saved.lesson_date,'method',saved.method,'scales',saved.scales,'hymnal',saved.hymnal) then raise exception 'VERSION_CONFLICT'; end if;
 if changes->>'lesson_date' is null or changes->>'method' is null or changes->>'scales' is null or changes->>'hymnal' is null then raise exception 'INVALID_STUDY'; end if;
 update public.gem_studies set lesson_date=(changes->>'lesson_date')::date,method=trim(changes->>'method'),scales=trim(changes->>'scales'),hymnal=trim(changes->>'hymnal') where id=study_id returning * into saved;
 result:=jsonb_build_object('operation_id',operation_id,'studies',jsonb_build_array(to_jsonb(saved)),'received_at',now());
 insert into public.gem_receipts(id,instructor_id,request,result) values(operation_id,actor.id,request_value,result);
 return result;
end $$;
create or replace function public.gem_edit_study(operation_id uuid,study_id uuid,previous jsonb,changes jsonb) returns jsonb language sql security invoker set search_path='' as $$ select gem_private.gem_edit_study(operation_id,study_id,previous,changes) $$;
revoke all on function public.gem_edit_study(uuid,uuid,jsonb,jsonb),gem_private.gem_edit_study(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.gem_edit_study(uuid,uuid,jsonb,jsonb),gem_private.gem_edit_study(uuid,uuid,jsonb,jsonb) to authenticated;
commit;

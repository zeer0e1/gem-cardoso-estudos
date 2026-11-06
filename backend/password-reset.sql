-- Registrar redefinições sem guardar senhas. Instalar após admin.sql.
begin;
grant usage on schema gem_private to service_role;
create table if not exists gem_private.gem_password_resets (
 id uuid primary key, actor_id uuid not null references public.gem_instructors(id),
 target_id uuid not null references public.gem_instructors(id), completed boolean not null default false,
 created_at timestamptz not null default now(), completed_at timestamptz
);
alter table gem_private.gem_password_resets enable row level security;
revoke all on gem_private.gem_password_resets from public,anon,authenticated;
create index if not exists gem_password_resets_actor_idx on gem_private.gem_password_resets(actor_id);
create index if not exists gem_password_resets_target_idx on gem_private.gem_password_resets(target_id);

create or replace function gem_private.gem_begin_password_reset(request_id uuid,target_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved gem_private.gem_password_resets;
begin
 if not exists(select 1 from public.gem_instructors where id=auth.uid() and enabled and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if request_id is null or not exists(select 1 from public.gem_instructors where id=target_user_id) then raise exception 'INSTRUCTOR_NOT_FOUND' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,73));
 select * into saved from gem_private.gem_password_resets where id=request_id;
 if found then
  if saved.actor_id<>auth.uid() or saved.target_id<>target_user_id then raise exception 'REQUEST_REUSED' using errcode='22023'; end if;
 else
  insert into gem_private.gem_password_resets(id,actor_id,target_id) values(request_id,auth.uid(),target_user_id) returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'target_id',saved.target_id,'completed',saved.completed);
end $$;

create or replace function gem_private.gem_complete_password_reset(request_id uuid,actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved gem_private.gem_password_resets;
begin
 if not exists(select 1 from public.gem_instructors where id=actor_user_id and enabled and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into saved from gem_private.gem_password_resets where id=request_id and actor_id=actor_user_id for update;
 if not found then raise exception 'REQUEST_NOT_FOUND' using errcode='22023'; end if;
 if not saved.completed then
  insert into public.gem_instructor_audit(actor_id,target_id,before_value,after_value)
  values(saved.actor_id,saved.target_id,null,jsonb_build_object('event','password_reset','request_id',saved.id));
  update gem_private.gem_password_resets set completed=true,completed_at=now() where id=request_id;
 end if;
 return jsonb_build_object('id',saved.target_id,'reset',true);
end $$;

create or replace function public.gem_begin_password_reset(request_id uuid,target_user_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select gem_private.gem_begin_password_reset(request_id,target_user_id) $$;
create or replace function public.gem_complete_password_reset(request_id uuid,actor_user_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select gem_private.gem_complete_password_reset(request_id,actor_user_id) $$;
revoke all on function public.gem_begin_password_reset(uuid,uuid),gem_private.gem_begin_password_reset(uuid,uuid) from public,anon;
grant execute on function public.gem_begin_password_reset(uuid,uuid),gem_private.gem_begin_password_reset(uuid,uuid) to authenticated;
revoke all on function public.gem_complete_password_reset(uuid,uuid),gem_private.gem_complete_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gem_complete_password_reset(uuid,uuid),gem_private.gem_complete_password_reset(uuid,uuid) to service_role;
commit;

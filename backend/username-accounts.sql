-- Instalar depois de admin.sql. Mantém os logins por e-mail existentes.
begin;
alter table public.gem_instructors add column if not exists username text unique;
create table if not exists gem_private.gem_account_requests (
 id uuid primary key, actor_id uuid not null references public.gem_instructors(id),
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
 user_id uuid not null unique default gen_random_uuid(),
 display_name text not null check(length(trim(display_name)) between 2 and 200),
 admin_access boolean not null, allow_access boolean not null,
 completed boolean not null default false, created_at timestamptz not null default now()
);
alter table gem_private.gem_account_requests enable row level security;
revoke all on gem_private.gem_account_requests from public,anon,authenticated;
create index if not exists gem_account_requests_actor_idx on gem_private.gem_account_requests(actor_id);

create or replace function gem_private.gem_reserve_account(request_id uuid,login_name text,display_name text,admin_access boolean,allow_access boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved gem_private.gem_account_requests; normalized text:=lower(trim(login_name));
begin
 if not exists(select 1 from public.gem_instructors where id=auth.uid() and enabled and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if request_id is null or normalized is null or normalized !~ '^[a-z0-9][a-z0-9._-]{2,31}$' or display_name is null or length(trim(display_name)) not between 2 and 200 or admin_access is null or allow_access is null then raise exception 'INVALID_ACCOUNT' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(normalized,42));
 select * into saved from gem_private.gem_account_requests where id=request_id;
 if found then
  if saved.actor_id<>auth.uid() or saved.username<>normalized or saved.display_name<>trim(display_name) or saved.admin_access<>admin_access or saved.allow_access<>allow_access then raise exception 'REQUEST_REUSED' using errcode='22023'; end if;
 else
  if exists(select 1 from gem_private.gem_account_requests where username=normalized) or exists(select 1 from public.gem_instructors where username=normalized) or exists(select 1 from auth.users where lower(email)=normalized||'@login.gem.invalid') then raise exception 'USERNAME_TAKEN' using errcode='22023'; end if;
  insert into gem_private.gem_account_requests(id,actor_id,username,display_name,admin_access,allow_access)
  values(request_id,auth.uid(),normalized,trim(display_name),admin_access,allow_access) returning * into saved;
 end if;
 return to_jsonb(saved);
end $$;

create or replace function gem_private.gem_finish_account(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved gem_private.gem_account_requests; profile public.gem_instructors;
begin
 if not exists(select 1 from public.gem_instructors where id=auth.uid() and enabled and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into saved from gem_private.gem_account_requests where id=request_id and actor_id=auth.uid() for update;
 if not found then raise exception 'REQUEST_NOT_FOUND' using errcode='22023'; end if;
 if not exists(select 1 from auth.users where id=saved.user_id and lower(email)=saved.username||'@login.gem.invalid' and email_confirmed_at is not null and raw_app_meta_data->>'gem_request_id'=saved.id::text) then raise exception 'ACCOUNT_NOT_READY' using errcode='22023'; end if;
 if not saved.completed then
  insert into public.gem_instructors(id,name,enabled,is_admin,username)
  values(saved.user_id,saved.display_name,saved.allow_access,saved.admin_access,saved.username) returning * into profile;
  insert into public.gem_instructor_audit(actor_id,target_id,before_value,after_value) values(auth.uid(),profile.id,null,to_jsonb(profile));
  update gem_private.gem_account_requests set completed=true where id=request_id;
 else select * into profile from public.gem_instructors where id=saved.user_id;
 end if;
 return jsonb_build_object('id',profile.id,'username',profile.username,'name',profile.name,'enabled',profile.enabled,'is_admin',profile.is_admin);
end $$;

create or replace function public.gem_reserve_account(request_id uuid,login_name text,display_name text,admin_access boolean,allow_access boolean) returns jsonb
language sql security invoker set search_path='' as $$ select gem_private.gem_reserve_account(request_id,login_name,display_name,admin_access,allow_access) $$;
create or replace function public.gem_finish_account(request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select gem_private.gem_finish_account(request_id) $$;
revoke all on function public.gem_reserve_account(uuid,text,text,boolean,boolean),gem_private.gem_reserve_account(uuid,text,text,boolean,boolean),public.gem_finish_account(uuid),gem_private.gem_finish_account(uuid) from public,anon;
grant execute on function public.gem_reserve_account(uuid,text,text,boolean,boolean),gem_private.gem_reserve_account(uuid,text,text,boolean,boolean),public.gem_finish_account(uuid),gem_private.gem_finish_account(uuid) to authenticated;

create or replace function gem_private.gem_list_instructors() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.gem_instructors where id=auth.uid() and enabled and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'username',i.username,'email',case when i.username is null then u.email else null end,'enabled',i.enabled,'is_admin',i.is_admin,'version',i.version,'updated_at',i.updated_at) order by i.name) from public.gem_instructors i join auth.users u on u.id=i.id),'[]'::jsonb);
end $$;
commit;

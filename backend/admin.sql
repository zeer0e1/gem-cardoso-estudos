-- Atualização de gestão de instrutores. Preserva alunos, estudos e chamadas.
begin;
alter table public.gem_instructors add column if not exists is_admin boolean not null default false;
alter table public.gem_instructors add column if not exists version integer not null default 1;
alter table public.gem_instructors add column if not exists updated_at timestamptz not null default now();
create table if not exists public.gem_instructor_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.gem_instructors(id),
 target_id uuid not null references public.gem_instructors(id),
 before_value jsonb, after_value jsonb not null, created_at timestamptz not null default now()
);
alter table public.gem_instructor_audit enable row level security;
revoke all on public.gem_instructor_audit from public,anon,authenticated;
revoke all on sequence public.gem_instructor_audit_id_seq from public,anon,authenticated;
create index if not exists gem_instructor_audit_actor_idx on public.gem_instructor_audit(actor_id);
create index if not exists gem_instructor_audit_target_idx on public.gem_instructor_audit(target_id);

create or replace function gem_private.gem_list_instructors() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.gem_instructors where id=auth.uid() and enabled and is_admin)
 then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',i.id,'name',i.name,'email',u.email,'enabled',i.enabled,
  'is_admin',i.is_admin,'version',i.version,'updated_at',i.updated_at
 ) order by i.name) from public.gem_instructors i join auth.users u on u.id=i.id),'[]'::jsonb);
end $$;

create or replace function gem_private.gem_manage_instructor(
 target_id uuid, account_email text, display_name text,
 allow_access boolean, admin_access boolean, expected_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.gem_instructors; previous public.gem_instructors; updated public.gem_instructors; target uuid;
begin
 -- Serializa mudanças de papéis para proteger o último administrador ativo.
 perform pg_advisory_xact_lock(hashtextextended('gem-instructor-management',0));
 select * into actor from public.gem_instructors where id=auth.uid() and enabled and is_admin;
 if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if display_name is null or length(trim(display_name)) not between 2 and 200
  or allow_access is null or admin_access is null or expected_version is null
 then raise exception 'INVALID_INSTRUCTOR_DATA' using errcode='22023'; end if;
 if target_id is null then
  select id into target from auth.users where lower(email)=lower(trim(account_email));
  if target is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode='22023'; end if;
 else target:=target_id; end if;
 select * into previous from public.gem_instructors where id=target for update;
 if (previous.id is null and expected_version<>0) or (previous.id is not null and previous.version<>expected_version)
 then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if target=actor.id and (not allow_access or not admin_access)
 then raise exception 'CANNOT_REMOVE_OWN_ADMIN' using errcode='22023'; end if;
 if previous.is_admin and previous.enabled and (not allow_access or not admin_access)
  and not exists(select 1 from public.gem_instructors where id<>target and enabled and is_admin)
 then raise exception 'LAST_ACTIVE_ADMIN' using errcode='22023'; end if;
 if previous.id is null then
  insert into public.gem_instructors(id,name,enabled,is_admin)
  values(target,trim(display_name),allow_access,admin_access) returning * into updated;
 else
  update public.gem_instructors set name=trim(display_name),enabled=allow_access,
   is_admin=admin_access,version=version+1,updated_at=now()
  where id=target returning * into updated;
 end if;
 insert into public.gem_instructor_audit(actor_id,target_id,before_value,after_value)
 values(actor.id,target,to_jsonb(previous),to_jsonb(updated));
 return jsonb_build_object('id',updated.id,'name',updated.name,'enabled',updated.enabled,
  'is_admin',updated.is_admin,'version',updated.version,'updated_at',updated.updated_at);
end $$;

create or replace function public.gem_list_instructors() returns jsonb
language sql security invoker set search_path='' as $$ select gem_private.gem_list_instructors() $$;
create or replace function public.gem_manage_instructor(
 target_id uuid, account_email text, display_name text, allow_access boolean, admin_access boolean, expected_version integer
) returns jsonb language sql security invoker set search_path='' as $$
 select gem_private.gem_manage_instructor(target_id,account_email,display_name,allow_access,admin_access,expected_version)
$$;
revoke all on function gem_private.gem_list_instructors(),public.gem_list_instructors() from public,anon;
revoke all on function gem_private.gem_manage_instructor(uuid,text,text,boolean,boolean,integer),public.gem_manage_instructor(uuid,text,text,boolean,boolean,integer) from public,anon;
grant execute on function gem_private.gem_list_instructors(),public.gem_list_instructors() to authenticated;
grant execute on function gem_private.gem_manage_instructor(uuid,text,text,boolean,boolean,integer),public.gem_manage_instructor(uuid,text,text,boolean,boolean,integer) to authenticated;
commit;

-- O primeiro administrador é autorizado uma vez pelo responsável do projeto,
-- usando um UUID e e-mail conferidos no painel. Nunca aceitar esse papel do cliente.

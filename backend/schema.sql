-- GEM Cardoso v2. Execute em um projeto Supabase novo.
begin;
create table public.gem_instructors (
 id uuid primary key references auth.users(id), name text not null check(length(trim(name)) between 2 and 200), enabled boolean not null default true
);
create table public.gem_students (
 id uuid primary key, name text not null check(length(trim(name)) between 2 and 200),
 instrument text not null check(length(trim(instrument)) between 1 and 100), active boolean not null default true,
 version integer not null default 1, created_by uuid not null references public.gem_instructors(id), updated_at timestamptz not null default now()
);
create table public.gem_studies (
 id uuid primary key, student_id uuid not null references public.gem_students(id), student_name text not null, instrument text not null,
 instructor_id uuid not null references public.gem_instructors(id), instructor_name text not null, lesson_date date not null,
 method text not null check(length(trim(method)) between 1 and 4000), scales text not null check(length(trim(scales)) between 1 and 4000),
 hymnal text not null check(length(trim(hymnal)) between 1 and 4000), created_at timestamptz not null default now()
);
create table public.gem_attendance (
 id text primary key, student_id uuid not null references public.gem_students(id), lesson_date date not null,
 status text not null check(status in ('present','justified','absent')), justification text not null default '' check(length(justification)<=1000),
 instructor_id uuid not null references public.gem_instructors(id), instructor_name text not null,
 version integer not null default 1, updated_at timestamptz not null default now(), unique(student_id,lesson_date),
 check(status='justified' or justification=''), check(status<>'justified' or length(trim(justification))>0),
 check(id=lesson_date::text || '_' || student_id::text)
);
create table public.gem_receipts (
 id uuid primary key, instructor_id uuid not null references public.gem_instructors(id), request jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create index on public.gem_studies(lesson_date);
create index on public.gem_studies(student_id);
create index on public.gem_attendance(lesson_date);
alter table public.gem_instructors enable row level security;
alter table public.gem_students enable row level security;
alter table public.gem_studies enable row level security;
alter table public.gem_attendance enable row level security;
alter table public.gem_receipts enable row level security;
revoke all on public.gem_instructors,public.gem_students,public.gem_studies,public.gem_attendance,public.gem_receipts from anon,authenticated;

create function public.gem_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.gem_instructors where id=auth.uid() and enabled) then raise exception 'INSTRUCTOR_NOT_ENABLED' using errcode='42501'; end if;
 return jsonb_build_object(
  'profile',(select to_jsonb(i) from public.gem_instructors i where id=auth.uid()),
  'students',coalesce((select jsonb_agg(s order by name) from public.gem_students s),'[]'::jsonb),
  'studies',coalesce((select jsonb_agg(s order by lesson_date desc,created_at desc) from public.gem_studies s),'[]'::jsonb),
  'attendance',coalesce((select jsonb_agg(a order by lesson_date desc) from public.gem_attendance a),'[]'::jsonb),
  'synced_at',now());
end $$;
create function public.gem_apply_operation(operation_id uuid, operation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.gem_instructors; receipt public.gem_receipts; s public.gem_students; a public.gem_attendance; study public.gem_studies;
 item jsonb; p jsonb:=operation->'payload'; result jsonb; changes jsonb:='[]'::jsonb; expected integer;
begin
 select * into actor from public.gem_instructors where id=auth.uid() and enabled;
 if not found then raise exception 'INSTRUCTOR_NOT_ENABLED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.gem_receipts where id=operation_id;
 if found then
  if receipt.instructor_id<>actor.id or receipt.request<>operation then raise exception 'OPERATION_ID_REUSED'; end if;
  return receipt.result;
 end if;
 if operation->>'kind'='student' then
  perform pg_advisory_xact_lock(hashtextextended(p->>'id',1));
  select * into s from public.gem_students where id=(p->>'id')::uuid for update;
  expected:=coalesce((p->>'expected_version')::integer,0);
  if (s.id is null and expected<>0) or (s.id is not null and s.version<>expected) then raise exception 'VERSION_CONFLICT'; end if;
  if s.id is null then
   insert into public.gem_students(id,name,instrument,created_by) values((p->>'id')::uuid,trim(p->>'name'),trim(p->>'instrument'),actor.id) returning * into s;
  else
   update public.gem_students set name=trim(p->>'name'),instrument=trim(p->>'instrument'),active=(p->>'active')::boolean,version=version+1,updated_at=now() where id=s.id returning * into s;
  end if;
  result:=jsonb_build_object('students',jsonb_build_array(to_jsonb(s)));
 elsif operation->>'kind'='study' then
  select * into s from public.gem_students where id=(p->>'student_id')::uuid and active;
  if not found then raise exception 'STUDENT_NOT_ACTIVE'; end if;
  insert into public.gem_studies(id,student_id,student_name,instrument,instructor_id,instructor_name,lesson_date,method,scales,hymnal)
  values((p->>'id')::uuid,s.id,s.name,s.instrument,actor.id,actor.name,(p->>'lesson_date')::date,trim(p->>'method'),trim(p->>'scales'),trim(p->>'hymnal')) returning * into study;
  result:=jsonb_build_object('studies',jsonb_build_array(to_jsonb(study)));
 elsif operation->>'kind'='attendance' then
  if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items') not between 1 and 500 then raise exception 'INVALID_ROSTER'; end if;
  -- Serializar cada data permite validar e gravar a chamada inteira em uma transação.
  perform pg_advisory_xact_lock(hashtextextended(p->>'lesson_date',2));
  for item in select value from jsonb_array_elements(p->'items') loop
   select * into s from public.gem_students where id=(item->>'student_id')::uuid;
   if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
   select * into a from public.gem_attendance where student_id=s.id and lesson_date=(p->>'lesson_date')::date for update;
   expected:=coalesce((item->>'expected_version')::integer,0);
   if (a.id is null and expected<>0) or (a.id is not null and a.version<>expected) then raise exception 'VERSION_CONFLICT'; end if;
   insert into public.gem_attendance(id,student_id,lesson_date,status,justification,instructor_id,instructor_name)
   values((p->>'lesson_date') || '_' || s.id::text,s.id,(p->>'lesson_date')::date,item->>'status',case when item->>'status'='justified' then trim(item->>'justification') else '' end,actor.id,actor.name)
   on conflict(student_id,lesson_date) do update set status=excluded.status,justification=excluded.justification,instructor_id=actor.id,instructor_name=actor.name,version=public.gem_attendance.version+1,updated_at=now() returning * into a;
   changes:=changes||jsonb_build_array(to_jsonb(a));
  end loop;
  result:=jsonb_build_object('attendance',changes);
 else raise exception 'INVALID_OPERATION'; end if;
 result:=result||jsonb_build_object('operation_id',operation_id,'received_at',now());
 insert into public.gem_receipts(id,instructor_id,request,result) values(operation_id,actor.id,operation,result);
 return result;
end $$;
revoke all on function public.gem_snapshot() from public,anon;
revoke all on function public.gem_apply_operation(uuid,jsonb) from public,anon;
grant execute on function public.gem_snapshot() to authenticated;
grant execute on function public.gem_apply_operation(uuid,jsonb) to authenticated;
commit;

-- Após criar um usuário em Authentication > Users, autorize explicitamente:
-- insert into public.gem_instructors(id,name)
-- select id, 'Nome do instrutor' from auth.users where email='email-do-instrutor';
-- Cadastro público de usuários NÃO concede acesso aos alunos.

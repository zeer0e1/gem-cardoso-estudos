-- Verificações sem persistir dados de teste. Executar inteiro.
begin;
do $$
declare teacher uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); student uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 request jsonb; response jsonb; repeated jsonb; count_rows integer; blocked boolean:=false;
begin
 insert into auth.users(id,aud,role) values(teacher,'authenticated','authenticated'),(stranger,'authenticated','authenticated');
 insert into public.gem_instructors(id,name) values(teacher,'Instrutor de teste transacional');
 perform set_config('request.jwt.claim.sub',teacher::text,true);
 request:=jsonb_build_object('kind','student','payload',jsonb_build_object('id',student,'name','Aluno de teste transacional','instrument','Violino','expected_version',0));
 response:=public.gem_apply_operation(op,request);
 repeated:=public.gem_apply_operation(op,request);
 if response<>repeated then raise exception 'FAIL: recibo não é idempotente'; end if;
 select count(*) into count_rows from public.gem_students where id=student;
 if count_rows<>1 then raise exception 'FAIL: aluno duplicado'; end if;
 response:=public.gem_apply_operation(gen_random_uuid(),jsonb_build_object('kind','study','payload',jsonb_build_object('id',gen_random_uuid(),'student_id',student,'lesson_date','2026-11-06','method','Lição 1','scales','Dó maior','hymnal','Hino 1','instructor_name','Nome falsificado')));
 if response->'studies'->0->>'instructor_name'<>'Instrutor de teste transacional' then raise exception 'FAIL: nome do instrutor falsificável'; end if;
 request:=jsonb_build_object('kind','attendance','payload',jsonb_build_object('lesson_date','2026-11-06','items',jsonb_build_array(jsonb_build_object('student_id',student,'status','present','expected_version',0))));
 perform public.gem_apply_operation(gen_random_uuid(),request);
 begin perform public.gem_apply_operation(gen_random_uuid(),request); exception when others then if sqlerrm='VERSION_CONFLICT' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'FAIL: atualização concorrente não detectada'; end if;
 select count(*) into count_rows from public.gem_attendance where student_id=student;
 if count_rows<>1 then raise exception 'FAIL: chamada duplicada'; end if;
 perform public.gem_snapshot();
 blocked:=false;perform set_config('request.jwt.claim.sub',stranger::text,true);
 begin perform public.gem_snapshot(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: usuário não autorizado acessou alunos'; end if;
 if has_function_privilege('anon','public.gem_snapshot()','execute') or has_function_privilege('anon','public.gem_apply_operation(uuid,jsonb)','execute') then raise exception 'FAIL: execução pública'; end if;
 if has_table_privilege('authenticated','public.gem_students','select') or has_table_privilege('anon','public.gem_students','select') then raise exception 'FAIL: acesso direto à tabela'; end if;
 raise notice 'PASS: idempotência, nome do instrutor, conflito, unicidade, autorização e privilégios';
end $$;
rollback;
select 'PASS - verificações concluídas; dados de teste revertidos' as resultado;

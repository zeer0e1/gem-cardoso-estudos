begin;
do $$
declare admin_id uuid:=gen_random_uuid(); teacher_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
 test_email text:=gen_random_uuid()::text||'@example.invalid'; blocked boolean; response jsonb;
begin
 insert into auth.users(id,email,aud,role) values
 (admin_id,gen_random_uuid()::text||'@example.invalid','authenticated','authenticated'),
 (teacher_id,gen_random_uuid()::text||'@example.invalid','authenticated','authenticated'),
 (new_id,test_email,'authenticated','authenticated');
 insert into public.gem_instructors(id,name,is_admin) values(admin_id,'Admin de teste',true),(teacher_id,'Instrutor de teste',false);
 perform set_config('request.jwt.claim.sub',teacher_id::text,true);
 blocked:=false;
 begin perform public.gem_list_instructors(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: instrutor comum listou contas'; end if;
 blocked:=false;
 begin perform public.gem_manage_instructor(teacher_id,null,'Fraude',true,true,1); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: instrutor se promoveu'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.gem_list_instructors();
 response:=public.gem_manage_instructor(null,test_email,'Novo instrutor',true,false,0);
 if (response->>'id')::uuid<>new_id or (response->>'is_admin')::boolean then raise exception 'FAIL: autorização incorreta'; end if;
 response:=public.gem_manage_instructor(new_id,null,'Novo instrutor',false,false,1);
 if (response->>'enabled')::boolean then raise exception 'FAIL: retirada de acesso'; end if;
 blocked:=false;
 begin perform public.gem_manage_instructor(admin_id,null,'Admin de teste',false,true,1); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'FAIL: removeu próprio acesso'; end if;
 blocked:=false;
 begin perform public.gem_manage_instructor(new_id,null,'Sobrescrita',true,false,1); exception when serialization_failure then blocked:=true; end;
 if not blocked then raise exception 'FAIL: versão antiga aceita'; end if;
 if has_function_privilege('anon','public.gem_manage_instructor(uuid,text,text,boolean,boolean,integer)','execute') then raise exception 'FAIL: RPC público'; end if;
 if has_table_privilege('authenticated','public.gem_instructors','update') then raise exception 'FAIL: escrita direta'; end if;
 if not exists(select 1 from public.gem_instructor_audit where actor_id=admin_id and target_id=new_id) then raise exception 'FAIL: sem auditoria'; end if;
end $$;
rollback;
select 'PASS - permissões de administrador, autorização, bloqueio, conflitos e auditoria; testes revertidos' as resultado;

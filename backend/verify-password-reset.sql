begin;
do $$
declare admin_id uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); ticket uuid:=gen_random_uuid();
 blocked boolean; response jsonb;
begin
 insert into auth.users(id,email,aud,role) values(admin_id,admin_id::text||'@example.invalid','authenticated','authenticated'),(target,target::text||'@example.invalid','authenticated','authenticated');
 insert into public.gem_instructors(id,name,enabled,is_admin) values(admin_id,'Admin de teste',true,true),(target,'Instrutor de teste',false,false);
 perform set_config('request.jwt.claim.sub',target::text,true);
 blocked:=false;
 begin perform public.gem_begin_password_reset(ticket,target); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: instrutor iniciou redefinição'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 response:=public.gem_begin_password_reset(ticket,target);
 if (response->>'completed')::boolean then raise exception 'FAIL: confirmação prematura'; end if;
 perform public.gem_begin_password_reset(ticket,target);
 blocked:=false;
 begin perform public.gem_begin_password_reset(ticket,admin_id); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'FAIL: pedido reutilizado para outra conta'; end if;
 response:=public.gem_complete_password_reset(ticket,admin_id);
 perform public.gem_complete_password_reset(ticket,admin_id);
 if response->>'id'<>target::text or not (response->>'reset')::boolean then raise exception 'FAIL: confirmação incorreta'; end if;
 if (select count(*) from public.gem_instructor_audit where target_id=target and after_value->>'event'='password_reset')<>1 then raise exception 'FAIL: auditoria duplicada'; end if;
 if exists(select 1 from public.gem_instructors where id=target and (enabled or is_admin or version<>1)) then raise exception 'FAIL: redefinição alterou acesso'; end if;
 if has_function_privilege('authenticated','public.gem_complete_password_reset(uuid,uuid)','execute') or has_function_privilege('anon','public.gem_begin_password_reset(uuid,uuid)','execute') then raise exception 'FAIL: privilégio indevido'; end if;
 if not has_function_privilege('service_role','public.gem_complete_password_reset(uuid,uuid)','execute') or not has_schema_privilege('service_role','gem_private','usage') then raise exception 'FAIL: servidor sem acesso'; end if;
 if has_table_privilege('authenticated','gem_private.gem_password_resets','select') then raise exception 'FAIL: redefinições expostas'; end if;
end $$;
rollback;
select 'PASS - redefinição restrita, alvo protegido, auditoria única e perfil preservado; testes revertidos' as resultado;

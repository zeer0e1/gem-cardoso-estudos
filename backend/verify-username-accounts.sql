begin;
do $$
declare admin_id uuid:=gen_random_uuid(); teacher_id uuid:=gen_random_uuid(); ticket uuid:=gen_random_uuid();
 username_value text:='t'||replace(gen_random_uuid()::text,'-',''); reserved jsonb; repeat_value jsonb; result jsonb; blocked boolean;
begin
 username_value:=left(username_value,32);
 insert into auth.users(id,email,aud,role) values(admin_id,admin_id::text||'@example.invalid','authenticated','authenticated'),(teacher_id,teacher_id::text||'@example.invalid','authenticated','authenticated');
 insert into public.gem_instructors(id,name,enabled,is_admin) values(admin_id,'Administrador teste',true,true),(teacher_id,'Instrutor teste',true,false);
 perform set_config('request.jwt.claim.sub',teacher_id::text,true);
 blocked:=false;
 begin perform public.gem_reserve_account(ticket,username_value,'Conta teste',false,true); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: instrutor criou conta'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 reserved:=public.gem_reserve_account(ticket,username_value,'Conta teste',false,true);
 repeat_value:=public.gem_reserve_account(ticket,username_value,'Conta teste',false,true);
 if reserved->>'user_id'<>repeat_value->>'user_id' then raise exception 'FAIL: duplicou reserva'; end if;
 blocked:=false;
 begin perform public.gem_reserve_account(gen_random_uuid(),username_value,'Outra conta',false,true); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'FAIL: usuário repetido'; end if;
 blocked:=false;
 begin perform public.gem_finish_account(ticket); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'FAIL: liberou conta sem Auth'; end if;
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data)
 values((reserved->>'user_id')::uuid,username_value||'@login.gem.invalid','authenticated','authenticated',now(),jsonb_build_object('gem_request_id',ticket::text));
 result:=public.gem_finish_account(ticket);
 repeat_value:=public.gem_finish_account(ticket);
 if result->>'id'<>repeat_value->>'id' or (result->>'is_admin')::boolean or not (result->>'enabled')::boolean then raise exception 'FAIL: perfil incorreto'; end if;
 if (select count(*) from public.gem_instructor_audit where target_id=(result->>'id')::uuid)<>1 then raise exception 'FAIL: auditoria duplicada'; end if;
 perform set_config('request.jwt.claim.sub',result->>'id',true);
 perform public.gem_snapshot();
 if has_function_privilege('anon','public.gem_reserve_account(uuid,text,text,boolean,boolean)','execute') then raise exception 'FAIL: criação anônima'; end if;
 if has_table_privilege('authenticated','gem_private.gem_account_requests','select') then raise exception 'FAIL: reservas expostas'; end if;
end $$;
rollback;
select 'PASS - criação restrita, usuário único, repetição segura, auditoria e login autorizado; testes revertidos' as resultado;

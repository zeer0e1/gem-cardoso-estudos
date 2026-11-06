import test from 'node:test';
import assert from 'node:assert/strict';
import {loginEmail} from '../login-identity.js';
import {createHandler} from '../backend/create-instructor/index.js';
test('usuário normalizado usa identidade interna; e-mails antigos permanecem válidos',()=>{
 assert.equal(loginEmail('  Joao.Silva '),'joao.silva@login.gem.invalid');
 assert.equal(loginEmail('Lucas@Example.com'),'lucas@example.com');
 for(const value of ['ab','joão','user space','<script>'])assert.throws(()=>loginEmail(value));
});
const env=key=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test'})[key];
const input={request_id:'11111111-1111-4111-8111-111111111111',username:'professor',name:'Professor',password:'test-only-password',is_admin:false,enabled:true};
const request=body=>new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer test-session',Origin:'https://zeer0e1.github.io'},body:JSON.stringify(body)});
test('função bloqueia chamadas sem sessão e instrutores comuns antes da chave administrativa',async()=>{
 let calls=0;const handler=createHandler(env,async url=>{calls++;return url.endsWith('/user')?Response.json({id:'teacher'}):Response.json({message:'ADMIN_REQUIRED'},{status:403})});
 assert.equal((await handler(new Request('https://edge.test',{method:'POST'}))).status,401);
 const response=await handler(request(input));assert.equal(response.status,403);assert.equal((await response.json()).message,'ADMIN_REQUIRED');assert.equal(calls,2);
});
test('perda de resposta na criação recupera a mesma identidade sem trocar a senha',async()=>{
 let created=0;const reservation={id:input.request_id,user_id:'user-id',username:input.username,completed:false};
 const handler=createHandler(env,async(url,options)=>{
  if(url.endsWith('/user'))return Response.json({id:'admin'});
  if(url.endsWith('/gem_list_instructors'))return Response.json([]);
  if(url.endsWith('/gem_reserve_account')){assert.ok(!options.body.includes(input.password));return Response.json(reservation)}
  if(url.endsWith('/admin/users')){created++;assert.equal(JSON.parse(options.body).id,reservation.user_id);assert.equal(options.headers.apikey,'server-test');throw Error('response lost')}
  if(url.endsWith('/admin/users/user-id'))return Response.json({id:'user-id',email:'professor@login.gem.invalid',app_metadata:{gem_request_id:input.request_id}});
  if(url.endsWith('/gem_finish_account'))return Response.json({id:'user-id',username:'professor'});
  throw Error('Unexpected call');
 });
 const response=await handler(request(input));assert.equal(response.status,200);assert.equal((await response.json()).username,'professor');assert.equal(created,1);
});
test('repetição já concluída não chama a administração de senhas',async()=>{
 const handler=createHandler(env,async url=>{
  if(url.endsWith('/user'))return Response.json({id:'admin'});
  if(url.endsWith('/gem_list_instructors'))return Response.json([]);
  if(url.endsWith('/gem_reserve_account'))return Response.json({id:input.request_id,completed:true});
  if(url.endsWith('/gem_finish_account'))return Response.json({id:'user-id',username:'professor'});
  throw Error('Admin API must not be called');
 });assert.equal((await handler(request(input))).status,200);
});
test('token recusado pelo Auth retorna pedido de login, sem operações administrativas',async()=>{
 const handler=createHandler(env,async()=>Response.json({message:'invalid JWT'},{status:400}));
 assert.equal((await handler(request(input))).status,401);
});

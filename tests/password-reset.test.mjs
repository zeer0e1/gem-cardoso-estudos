import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../backend/create-instructor/index.js';
const target='22222222-2222-4222-8222-222222222222';
const ticket='11111111-1111-4111-8111-111111111111';
const actor='33333333-3333-4333-8333-333333333333';
const password='test-only-reset-password';
const env=key=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test'})[key];
const request=(body={})=>new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer session',Origin:'https://zeer0e1.github.io'},body:JSON.stringify({action:'reset_password',request_id:ticket,target_id:target,password,...body})});
function fake({admin=true,known=true,completed=false,failUpdate=false,failComplete=false}={}){
 const calls=[];
 const handler=createHandler(env,async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/user'))return Response.json({id:actor});
  if(url.endsWith('/gem_list_instructors'))return admin?Response.json(known?[{id:target,enabled:false,is_admin:false}]:[]):Response.json({message:'ADMIN_REQUIRED'},{status:403});
  if(url.endsWith('/gem_begin_password_reset'))return Response.json({id:ticket,target_id:target,completed});
  if(url.endsWith('/admin/users/'+target))return failUpdate?Response.json({message:'Password too weak'},{status:422}):Response.json({id:target});
  if(url.endsWith('/gem_complete_password_reset'))return failComplete?Response.json({message:'Database unavailable'},{status:503}):Response.json({id:target,reset:true});
  throw Error('Unexpected endpoint '+url);
 });return {handler,calls};
}
test('redefinição exige administrador e limita alvo à lista de instrutores',async()=>{
 for(const options of [{admin:false},{known:false}]){
  const {handler,calls}=fake(options),response=await handler(request());
  assert.ok([403,404].includes(response.status));assert.ok(!calls.some(call=>call.options.headers.apikey==='server-test'));
 }
});
test('senha vai apenas ao Auth no servidor, sem alterar perfil e com auditoria restrita',async()=>{
 const {handler,calls}=fake();const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:target,reset:true});
 const updates=calls.filter(call=>call.options.method==='PUT');assert.equal(updates.length,1);assert.deepEqual(JSON.parse(updates[0].options.body),{password});assert.equal(updates[0].options.headers.apikey,'server-test');
 for(const call of calls.filter(call=>call.url.includes('/rpc/')))assert.ok(!call.options.body.includes(password));
 const completion=calls.find(call=>call.url.endsWith('/gem_complete_password_reset'));assert.equal(completion.options.headers.apikey,'server-test');assert.equal(JSON.parse(completion.options.body).actor_user_id,actor);
});
test('pedido concluído repetido não altera a senha novamente',async()=>{
 const {handler,calls}=fake({completed:true});assert.equal((await handler(request())).status,200);assert.ok(!calls.some(call=>call.options.method==='PUT'));
});
test('senha recusada e resposta de auditoria perdida nunca produzem falsa confirmação',async()=>{
 let result=await fake({failUpdate:true}).handler(request());assert.equal((await result.json()).message,'PASSWORD_REJECTED');
 result=await fake({failComplete:true}).handler(request());assert.equal(result.status,503);assert.equal((await result.json()).message,'RESET_NOT_CONFIRMED');
});
test('senha curta e alvo inválido não chegam à operação privilegiada',async()=>{
 const {handler,calls}=fake();assert.equal((await handler(request({password:'short'}))).status,400);assert.equal((await handler(request({target_id:'invalid'}))).status,400);assert.ok(!calls.some(call=>call.options.headers.apikey==='server-test'));
});

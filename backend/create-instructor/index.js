// Implantar como Edge Function gem-create-instructor. Nunca incluir chaves no código.
export function createHandler(env,fetcher=fetch){
 return async request=>{
  const origin=request.headers.get('origin');
  const allowed=['https://zeer0e1.github.io','http://127.0.0.1:4182','http://localhost:4182'];
  const headers={'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS',...(origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin}:{})};
  const reply=(status,code)=>new Response(JSON.stringify(code),{status,headers});
  if(origin&&!allowed.includes(origin))return reply(403,{message:'ORIGIN_NOT_ALLOWED'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{message:'METHOD_NOT_ALLOWED'});
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return reply(401,{message:'LOGIN_REQUIRED'});
  const url=env('SUPABASE_URL'),publicKey=env('SUPABASE_ANON_KEY'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!publicKey||!secret)return reply(503,{message:'SERVER_NOT_CONFIGURED'});
  async function call(path,body,privileged=false,method='POST'){
   const response=await fetcher(url+path,{method,headers:{apikey:privileged?secret:publicKey,Authorization:privileged?'Bearer '+secret:authorization,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){const error=new Error(result.message||result.msg||'SERVICE_FAILURE');error.status=response.status;throw error}return result;
  }
  let resetting=false;
  try{
   let actor;
   try{actor=await call('/auth/v1/user',undefined,false,'GET')}catch(error){if([400,401,403].includes(error.status))return reply(401,{message:'LOGIN_REQUIRED'});throw error}
   // A verificação no banco usa o perfil atual, sem confiar em metadados do cliente.
   const instructors=await call('/rest/v1/rpc/gem_list_instructors',{});
   if(Number(request.headers.get('content-length'))>12000)return reply(400,{message:'INVALID_ACCOUNT'});
   const text=await request.text();if(text.length>12000)return reply(400,{message:'INVALID_ACCOUNT'});
   let input;try{input=JSON.parse(text)}catch{return reply(400,{message:'INVALID_ACCOUNT'})}
   if(input?.action==='check')return reply(200,{ready:true});
   if(!input||typeof input!=='object')return reply(400,{message:'INVALID_ACCOUNT'});
   if(input.action==='reset_password'){
    resetting=true;
    if(typeof input.password!=='string'||input.password.length<8||input.password.length>128||!/^[0-9a-f-]{36}$/.test(input.request_id||'')||!/^[0-9a-f-]{36}$/.test(input.target_id||''))return reply(400,{message:'INVALID_RESET'});
    if(!Array.isArray(instructors)||!instructors.some(row=>row.id===input.target_id))return reply(404,{message:'INSTRUCTOR_NOT_FOUND'});
    const ticket=await call('/rest/v1/rpc/gem_begin_password_reset',{request_id:input.request_id,target_user_id:input.target_id});
    if(ticket.completed)return reply(200,{id:ticket.target_id,reset:true});
    const updated=await call('/auth/v1/admin/users/'+input.target_id,{password:input.password},true,'PUT');
    if(updated.id!==input.target_id)throw Error('RESET_NOT_CONFIRMED');
    const result=await call('/rest/v1/rpc/gem_complete_password_reset',{request_id:input.request_id,actor_user_id:actor.id},true);
    if(result.id!==input.target_id||result.reset!==true)throw Error('RESET_NOT_CONFIRMED');
    return reply(200,result);
   }
   if(typeof input.password!=='string'||input.password.length<8||input.password.length>128||typeof input.username!=='string'||!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(input.username)||typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>200||typeof input.is_admin!=='boolean'||typeof input.enabled!=='boolean'||!/^[0-9a-f-]{36}$/.test(input.request_id||''))return reply(400,{message:'INVALID_ACCOUNT'});
   const reservation=await call('/rest/v1/rpc/gem_reserve_account',{request_id:input.request_id,login_name:input.username,display_name:input.name,admin_access:input.is_admin,allow_access:input.enabled});
   if(!reservation.completed){
    const email=reservation.username+'@login.gem.invalid';
    try{
     await call('/auth/v1/admin/users',{id:reservation.user_id,email,password:input.password,email_confirm:true,app_metadata:{gem_request_id:reservation.id}},true);
    }catch(error){
     // Repetir após perda de resposta não troca senha nem cria outra conta.
     const existing=await call('/auth/v1/admin/users/'+reservation.user_id,undefined,true,'GET').catch(()=>null);
     if(!existing||existing.email!==email||existing.app_metadata?.gem_request_id!==reservation.id)throw error;
    }
   }
   const profile=await call('/rest/v1/rpc/gem_finish_account',{request_id:reservation.id});
   return reply(200,profile);
  }catch(error){
   const known=['ADMIN_REQUIRED','USERNAME_TAKEN','REQUEST_REUSED','INVALID_ACCOUNT','ACCOUNT_NOT_READY','REQUEST_NOT_FOUND','INSTRUCTOR_NOT_FOUND'];
   if(known.includes(error.message))return reply(error.message==='ADMIN_REQUIRED'?403:409,{message:error.message});
   if(error.status===401)return reply(401,{message:'LOGIN_REQUIRED'});
   if(/password|weak/i.test(error.message))return reply(400,{message:'PASSWORD_REJECTED'});
   return reply(503,{message:resetting?'RESET_NOT_CONFIRMED':'CREATE_NOT_CONFIRMED'});
  }
 };
}
if(typeof Deno!=='undefined')Deno.serve(createHandler(key=>Deno.env.get(key)));

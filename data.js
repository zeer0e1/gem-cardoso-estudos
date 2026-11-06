import {config} from './config.js';
import {emptySnapshot,applyChanges,project} from './domain.js';
import {isAdmin} from './admin.js';
import {loginEmail} from './login-identity.js';
let db,session=null,snapshot=emptySnapshot(),outbox=[],drafts={},syncing=false,refreshPromise=null,epoch=0;
export const state={data:emptySnapshot(),profile:null,pending:[],lastSync:null,error:null};
const emit=()=>{state.data=project(snapshot,outbox,snapshot.profile||{id:session?.user.id,name:''});state.profile=snapshot.profile;state.pending=outbox;state.lastSync=snapshot.synced_at;window.dispatchEvent(new Event('gem-state'))};
export const configured=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url)&&!!config.publishableKey&&!/^(sb_secret_|.*service_role)/.test(config.publishableKey);
function tx(store,mode,fn){return new Promise((resolve,reject)=>{const t=db.transaction(store,mode),r=fn(t.objectStore(store));let result;r.onsuccess=()=>result=r.result;t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Falha no armazenamento'))})}
async function get(k){return tx('settings','readonly',s=>s.get(k))}async function set(k,v){return tx('settings','readwrite',s=>s.put(v,k))}
export async function init(){db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gem-cardoso-instructors',1);r.onupgradeneeded=()=>{r.result.createObjectStore('settings');r.result.createObjectStore('outbox',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});session=await get('session');if(session){snapshot=(await get('snapshot:'+session.user.id))||emptySnapshot();drafts=(await get('drafts:'+session.user.id))||{};await loadOutbox()}emit()}
async function loadOutbox(){outbox=(await tx('outbox','readonly',s=>s.getAll())).filter(o=>o.user_id===session?.user.id).sort((a,b)=>(a.sequence||0)-(b.sequence||0)||a.created_at.localeCompare(b.created_at))}
export const currentUser=()=>session?.user||null;
export const currentIsAdmin=()=>isAdmin(state.profile);
export async function resetInstructorPassword(input){
 if(!navigator.onLine)throw Error('Conecte-se à internet para redefinir a senha.');
 if(!currentIsAdmin())throw Error('ADMIN_REQUIRED');
 const before=epoch;
 const result=await request('/functions/v1/gem-create-instructor',{...input,action:'reset_password'},await token());
 if(before!==epoch)throw Error('A sessão foi alterada.');
 if(result?.id!==input.target_id||result.reset!==true)throw Error('RESET_NOT_CONFIRMED');
 return result;
}
export async function checkAccountCreation(){
 if(!navigator.onLine||!currentIsAdmin())throw Error('ADMIN_REQUIRED');
 const result=await request('/functions/v1/gem-create-instructor',{action:'check'},await token());
 if(!result.ready)throw Error('CREATE_NOT_CONFIRMED');return true;
}
export async function listInstructors(){
 if(!navigator.onLine)throw Error('Conecte-se à internet para gerenciar os instrutores.');
 if(!currentIsAdmin())throw Error('ADMIN_REQUIRED');
 const before=epoch;const rows=await request('/rest/v1/rpc/gem_list_instructors',{},await token());
 if(before!==epoch)throw Error('A sessão foi alterada.');
 if(!Array.isArray(rows))throw Error('Não foi possível ler os perfis de instrutor.');return rows;
}
export async function manageInstructor(input){
 if(!navigator.onLine)throw Error('Conecte-se à internet para alterar os acessos.');
 if(!currentIsAdmin())throw Error('ADMIN_REQUIRED');
 const before=epoch;
 const result=await request('/rest/v1/rpc/gem_manage_instructor',input,await token());
 if(before!==epoch)throw Error('A sessão foi alterada.');
 if(!result?.id)throw Error('O servidor não confirmou a alteração. Atualize a lista antes de tentar novamente.');
 await sync(true);return result;
}
export async function createInstructor(input){
 if(!navigator.onLine)throw Error('Conecte-se à internet para cadastrar instrutores.');
 if(!currentIsAdmin())throw Error('ADMIN_REQUIRED');
 const before=epoch;
 const result=await request('/functions/v1/gem-create-instructor',input,await token());
 if(before!==epoch)throw Error('A sessão foi alterada.');
 if(!result?.id||result.username!==input.username)throw Error('CREATE_NOT_CONFIRMED');
 return result;
}
export async function editStudyRecord(input){
 if(!navigator.onLine)throw Error('Conecte-se para editar a ficha.');
 const before=epoch,user=session?.user.id;
 const result=await request('/rest/v1/rpc/gem_edit_study',input,await token());
 if(before!==epoch)throw Error('Sessão alterada.');
 if(result.operation_id!==input.operation_id)throw Error('Edição não confirmada.');
 snapshot=applyChanges(snapshot,result);await set('snapshot:'+user,snapshot);emit();return result;
}
async function request(path,body,token,method='POST'){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(config.url+path,{method,headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(data.message||data.msg||data.error_description||'Falha no serviço');e.status=r.status;e.code=data.code;throw e}return data}finally{clearTimeout(timer)}}
async function token(){if(!session)throw Error('Faça login para sincronizar.');const beforeToken=epoch;const persisted=await get('session');if(beforeToken!==epoch||!session)throw Error('A sessão foi alterada.');if(persisted?.user.id!==session.user.id){epoch++;session=null;snapshot=emptySnapshot();outbox=[];drafts={};emit();throw Error('A sessão foi alterada em outra aba. Faça login novamente.');}session=persisted;if(session.expires_at*1000>Date.now()+60000)return session.access_token;if(!refreshPromise){const before=epoch;refreshPromise=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(async data=>{if(epoch!==before)throw Error('Sessão alterada.');session={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};await set('session',session);return session.access_token}).catch(e=>{if(e.status===400||e.status===401){e.status=401;state.error='Sua sessão expirou. Entre novamente para enviar os dados pendentes.';emit()}throw e}).finally(()=>refreshPromise=null)}return refreshPromise}
export async function login(email,password){email=loginEmail(email);if(!configured())throw Error('O banco do GEM ainda precisa ser conectado.');const data=await request('/auth/v1/token?grant_type=password',{email,password});const candidate={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};const remote=await request('/rest/v1/rpc/gem_snapshot',{},candidate.access_token);epoch++;session=candidate;snapshot=remote;drafts=(await get('drafts:'+session.user.id))||{};await set('session',session);await set('snapshot:'+session.user.id,snapshot);await loadOutbox();state.error=null;emit()}
export async function logout(){epoch++;const previous=session;session=null;snapshot=emptySnapshot();outbox=[];drafts={};await tx('settings','readwrite',s=>s.delete('session'));state.error=null;emit();if(previous&&navigator.onLine)request('/auth/v1/logout?scope=local',{},previous.access_token).catch(()=>{})}
export async function saveDraft(key,value){if(!session)throw Error('Faça login.');drafts={...drafts,[key]:structuredClone(value)};await set('drafts:'+session.user.id,drafts)}
export function getDraft(key){return structuredClone(drafts[key]||null)}
export async function queue(kind,payload,{id=crypto.randomUUID(),draftKey}={}){
 if(!session||!snapshot.profile)throw Error('Faça login como instrutor.');
 const user=session.user.id,op={id,user_id:user,operation:{kind,payload:structuredClone(payload)},created_at:new Date().toISOString(),attempts:0,next_attempt:0,status:'pending'};
 await new Promise((resolve,reject)=>{
  const t=db.transaction(['outbox','settings'],'readwrite'),settings=t.objectStore('settings');
  const counter=settings.get('outbox-sequence');
  counter.onsuccess=()=>{op.sequence=(counter.result||0)+1;settings.put(op.sequence,'outbox-sequence');t.objectStore('outbox').put(op);if(draftKey){drafts={...drafts,[draftKey]:null};settings.put(drafts,'drafts:'+user)}};
  t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);
 });
 await loadOutbox();emit();return op;
}
export async function sync(force=false){if(syncing||!session||!navigator.onLine||!configured())return;const run=async()=>{syncing=true;const started=epoch,user=session.user.id;state.error=null;window.dispatchEvent(new Event('gem-sync'));try{await loadOutbox();for(const op of outbox){if(epoch!==started)return;if(op.status==='conflict'||op.status==='blocked')break;if(!force&&op.next_attempt>Date.now())break;try{const result=await request('/rest/v1/rpc/gem_apply_operation',{operation_id:op.id,operation:op.operation},await token());if(epoch!==started)return;if(result.operation_id!==op.id)throw Error('O servidor não confirmou o registro.');snapshot=applyChanges(snapshot,result);await new Promise((resolve,reject)=>{const t=db.transaction(['settings','outbox'],'readwrite');t.objectStore('settings').put(snapshot,'snapshot:'+user);t.objectStore('outbox').delete(op.id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}catch(e){if(epoch!==started)return;op.attempts++;op.error=e.message;op.status=e.message.includes('VERSION_CONFLICT')?'conflict':e.status===400||e.status===403?'blocked':'pending';op.next_attempt=Date.now()+Math.min(300000,2000*2**Math.min(op.attempts,7))+Math.random()*1000;await tx('outbox','readwrite',s=>s.put(op));throw e}}
 const remote=await request('/rest/v1/rpc/gem_snapshot',{},await token());if(epoch!==started)return;snapshot=remote;await set('snapshot:'+user,snapshot);
}catch(e){if(epoch===started)state.error=e.status===401||e.status===400&&e.message.includes('refresh')?'Entre novamente para continuar a sincronização.':e.message.includes('VERSION_CONFLICT')?'Outro instrutor alterou este registro. Revise o conflito na fila.':!navigator.onLine?'Sem conexão. Seus dados continuam na fila.':e.message.includes('INSTRUCTOR_NOT_ENABLED')?'Seu acesso de instrutor precisa ser autorizado pelo responsável.':'Não foi possível sincronizar. Seus dados continuam guardados.'}finally{syncing=false;if(epoch===started){await loadOutbox();emit()}window.dispatchEvent(new Event('gem-sync'))}};
if(navigator.locks)await navigator.locks.request('gem-sync',{ifAvailable:true},async lock=>{if(lock)await run()});else await run()}
export const isSyncing=()=>syncing;
export async function retry(id){const op=outbox.find(o=>o.id===id);if(!op)return;op.status='pending';op.next_attempt=0;await tx('outbox','readwrite',s=>s.put(op));await loadOutbox();emit();await sync(true)}
export async function resolveConflict(id){if(syncing)throw Error('Aguarde a sincronização terminar.');const op=outbox.find(o=>o.id===id);if(!op||op.status!=='conflict')return;const before=epoch,user=session.user.id;const remote=await request('/rest/v1/rpc/gem_snapshot',{},await token());if(epoch!==before)throw Error('A sessão foi alterada.');snapshot=remote;await set('snapshot:'+user,remote);const replacement=structuredClone(op);replacement.id=crypto.randomUUID();replacement.status='pending';replacement.next_attempt=0;replacement.attempts=0;delete replacement.error;const p=replacement.operation.payload;if(replacement.operation.kind==='student')p.expected_version=snapshot.students.find(s=>s.id===p.id)?.version||0;else if(replacement.operation.kind==='attendance')for(const item of p.items)item.expected_version=snapshot.attendance.find(a=>a.id===p.lesson_date+'_'+item.student_id)?.version||0;if(epoch!==before)throw Error('A sessão foi alterada.');await new Promise((resolve,reject)=>{const t=db.transaction('outbox','readwrite');t.objectStore('outbox').delete(id);t.objectStore('outbox').put(replacement);t.oncomplete=resolve;t.onerror=()=>reject(t.error)});await loadOutbox();emit();await sync(true)}
export function exportData(){return {app:'GEM Cardoso',schemaVersion:2,exportedAt:new Date().toISOString(),instructor:state.profile,snapshot,pending:outbox,drafts}}
window.addEventListener('online',()=>sync());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync()});setInterval(()=>sync(),30000);

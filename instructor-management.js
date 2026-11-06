import * as api from './data.js';
import {instructorError} from './admin.js';
import {newAccountEditor} from './new-instructor.js';
const $=selector=>document.querySelector(selector);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let version=0,rows=[];
const current=()=>location.hash.split('?')[0]==='#instrutores'&&api.currentIsAdmin();
function errorText(error){const original=instructorError(error);return error?.name==='AbortError'||/Failed to fetch/.test(original)?'Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.':original}
export async function instructorsPage(){
 const main=$('#main'),load=++version;
 if(!api.currentIsAdmin()){main.innerHTML='<div class="card"><h1>Acesso administrativo</h1><p>Somente administradores podem gerenciar os instrutores.</p><a href="#inicio" class="button secondary">Voltar ao painel</a></div>';return}
 main.innerHTML=`<section class="welcome"><div><div class="eyebrow">ADMINISTRAÇÃO DO GEM</div><h1>Instrutores</h1><p class="sub">Gerencie quem pode acompanhar a turma e autorizar novos acessos.</p></div><div><button class="button" id="create-instructor">+ Cadastrar instrutor</button> <button class="button secondary small" id="authorize-instructor" ${navigator.onLine?'':'disabled'}>Vincular conta existente</button></div></section><div class="notice">Cadastre novos instrutores com nome, usuário e senha. Eles poderão entrar pelo link do aplicativo. Contas antigas continuam usando seu e-mail.</div><div class="toolbar"><label class="sr-only" for="instructor-search">Buscar instrutor por nome, usuário ou e-mail</label><input id="instructor-search" placeholder="Buscar por nome, usuário ou e-mail"><button class="button secondary small" id="reload-instructors">Atualizar lista</button></div><p id="instructor-feedback" class="error" role="status" hidden></p><div id="instructor-counts" class="admin-counts"></div><div id="instructor-list"><p class="sub">Carregando instrutores…</p></div><p class="local-note">As alterações exigem conexão e são confirmadas pelo banco. Retirar o acesso preserva as fichas e chamadas já registradas.</p>`;
 $('#create-instructor').onclick=()=>newAccountEditor(instructorsPage);$('#create-instructor').disabled=!navigator.onLine;$('#authorize-instructor').onclick=()=>editor();$('#reload-instructors').onclick=instructorsPage;
 try{
  rows=await api.listInstructors();if(!current()||load!==version)return;
  $('#instructor-counts').innerHTML=`<span class="badge">${rows.filter(r=>r.enabled).length} com acesso ativo</span><span class="badge">${rows.filter(r=>r.enabled&&r.is_admin).length} administradores ativos</span><span class="badge">${rows.filter(r=>!r.enabled).length} sem acesso</span>`;
  $('#instructor-search').oninput=filter;filter();
 }catch(error){if(load!==version||!$('#instructor-list'))return;$('#instructor-feedback').textContent=errorText(error);$('#instructor-feedback').hidden=false;$('#instructor-list').innerHTML='';$('#authorize-instructor').disabled=true;$('#create-instructor').disabled=true}
}
function filter(){
 const q=$('#instructor-search').value.trim().toLocaleLowerCase('pt-BR');
 const matches=rows.filter(r=>[r.name,r.email,r.username].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
 $('#instructor-list').innerHTML=matches.length?matches.map(row=>`<article class="record instructor-row"><span class="avatar">${esc(row.name.slice(0,1))}</span><div class="record-info"><h3>${esc(row.name)}${row.id===api.state.profile.id?' <span class="badge">Você</span>':''}</h3><p>${row.username?'Usuário: '+esc(row.username):esc(row.email)}</p><div class="instructor-labels"><span class="status ${row.enabled?'present':'absent'}">${row.enabled?'Acesso ativo':'Sem acesso'}</span><span class="badge">${row.is_admin?'Administrador':'Instrutor'}</span></div></div><button class="button secondary small" data-instructor-id="${row.id}">Gerenciar</button></article>`).join(''):'<div class="card empty"><div><h3>Nenhum instrutor encontrado</h3><p>Confira a busca ou autorize uma conta existente.</p></div></div>';
 document.querySelectorAll('[data-instructor-id]').forEach(button=>button.onclick=()=>editor(rows.find(row=>row.id===button.dataset.instructorId)));
}
function editor(row){
 if(!api.currentIsAdmin()||!navigator.onLine)return;
 const self=row?.id===api.state.profile.id;
 $('#detail-content').innerHTML=`<div class="eyebrow">ADMINISTRAÇÃO DE ACESSOS</div><h2>${row?'Gerenciar instrutor':'Autorizar instrutor'}</h2><form id="instructor-form"><div class="fields"><div class="field full"><label for="instructor-email">${row?.username?'Usuário':'E-mail da conta de acesso'}</label><input type="${row?.username?'text':'email'}" id="instructor-email" value="${esc(row?.username||row?.email)}" required maxlength="254" autocomplete="off" ${row?'readonly':''}></div><div class="field full"><label for="instructor-display-name">Nome do instrutor</label><input id="instructor-display-name" value="${esc(row?.name)}" minlength="2" maxlength="200" required autocomplete="off"><small>Este nome aparecerá nas próximas fichas e chamadas.</small></div><div class="field full"><label for="instructor-role">Permissão</label><select id="instructor-role" ${self?'disabled':''}><option value="teacher" ${row?.is_admin?'':'selected'}>Instrutor</option><option value="admin" ${row?.is_admin?'selected':''}>Administrador</option></select><small>Administradores também podem autorizar e retirar o acesso de outras pessoas.</small></div><label class="check-label field full"><input type="checkbox" id="instructor-enabled" ${!row||row.enabled?'checked':''} ${self?'disabled':''}> Permitir acesso à turma</label></div>${self?'<p class="notice" style="margin-top:15px">Seu próprio acesso de administrador é protegido. Você pode editar seu nome.</p>':''}<p id="instructor-save-error" class="error" hidden role="alert" style="margin-top:15px"></p><button type="submit" class="button" id="save-instructor" style="margin-top:22px">${row?'Salvar alterações':'Autorizar conta'}</button></form>`;
 const dialog=$('#details');dialog.showModal();
 $('#instructor-form').onsubmit=async event=>{
  event.preventDefault();const button=$('#save-instructor');if(button.disabled)return;
  const input={target_id:row?.id||null,account_email:$('#instructor-email').value.trim().toLocaleLowerCase('en-US'),display_name:$('#instructor-display-name').value.trim(),allow_access:$('#instructor-enabled').checked,admin_access:$('#instructor-role').value==='admin',expected_version:row?.version||0};
  if(input.display_name.length<2)return;
  if(input.admin_access&&!row?.is_admin&&!confirm(`${input.display_name} poderá gerenciar o acesso dos outros instrutores. Autorizar como administrador?`))return;
  if(row?.enabled&&!input.allow_access&&!confirm(`Retirar o acesso de ${input.display_name}? As fichas e chamadas anteriores serão preservadas.`))return;
  button.disabled=true;$('#instructor-save-error').hidden=true;
  try{await api.manageInstructor(input);dialog.close();await instructorsPage();const feedback=$('#instructor-feedback');if(feedback){feedback.className='notice';feedback.textContent='Alteração confirmada pelo banco.';feedback.hidden=false}}
  catch(error){const feedback=$('#instructor-save-error');if(feedback){feedback.textContent=errorText(error);feedback.hidden=false}button.disabled=false}
 };
}

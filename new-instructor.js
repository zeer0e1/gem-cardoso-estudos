import * as api from './data.js';
const messages={USERNAME_TAKEN:'Este usuário já está em uso. Escolha outro.',REQUEST_REUSED:'Os dados mudaram após uma tentativa. Feche a janela e comece novamente.',PASSWORD_REJECTED:'A senha foi recusada. Use uma senha mais forte.',ADMIN_REQUIRED:'Somente administradores ativos podem cadastrar instrutores.',LOGIN_REQUIRED:'Sua sessão expirou. Entre novamente.',INVALID_ACCOUNT:'Confira o nome, o usuário e a senha.',CREATE_NOT_CONFIRMED:'Não foi possível confirmar o cadastro. Mantenha os dados e tente novamente; a repetição não cria outra conta.'};
export function newAccountEditor(onSaved){
 if(!api.currentIsAdmin()||!navigator.onLine)return;
 const dialog=document.querySelector('#details'),content=document.querySelector('#detail-content');
 let requestId=crypto.randomUUID(),attempted=false;
 content.innerHTML=`<div class="eyebrow">NOVO ACESSO AO GEM</div><h2>Cadastrar instrutor</h2><form id="new-instructor-form" autocomplete="off"><div class="fields"><div class="field full"><label for="new-name">Nome do instrutor</label><input id="new-name" minlength="2" maxlength="200" required></div><div class="field full"><label for="new-username">Usuário</label><input id="new-username" pattern="[a-z0-9][a-z0-9._-]{2,31}" minlength="3" maxlength="32" autocapitalize="none" spellcheck="false" required><small>De 3 a 32 caracteres. Letras minúsculas sem acento, números, ponto, hífen ou sublinhado. O usuário não poderá ser alterado.</small></div><div class="field full"><label for="new-password">Senha</label><input id="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><small>Use pelo menos 8 caracteres e compartilhe diretamente com o instrutor.</small></div><div class="field full"><label for="new-confirm">Confirmar senha</label><input id="new-confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><div class="field full"><label for="new-role">Permissão</label><select id="new-role"><option value="teacher">Instrutor</option><option value="admin">Administrador</option></select></div><label class="check-label field full"><input id="new-enabled" type="checkbox" checked> Permitir acesso à turma</label></div><p id="new-error" class="error" role="alert" hidden style="margin-top:16px"></p><button id="new-submit" class="button" style="margin-top:22px">Cadastrar e criar login</button></form>`;
 const $=s=>content.querySelector(s);
 $('#new-username').addEventListener('input',e=>{e.target.value=e.target.value.toLowerCase()});
 dialog.showModal();
 $('#new-submit').disabled=true;
 api.checkAccountCreation().then(()=>{if(dialog.open&&$('#new-submit'))$('#new-submit').disabled=false}).catch(()=>{if(dialog.open&&$('#new-error')){$('#new-error').textContent='Não foi possível conectar ao cadastro. Feche esta janela, confira sua conexão e tente novamente.';$('#new-error').hidden=false}});
 const clear=()=>{$('#new-password')&&($('#new-password').value='');$('#new-confirm')&&($('#new-confirm').value='')};
 dialog.addEventListener('close',clear,{once:true});
 $('#new-instructor-form').onsubmit=async event=>{
  event.preventDefault();const error=$('#new-error'),button=$('#new-submit');error.hidden=true;
  if($('#new-password').value!==$('#new-confirm').value){error.textContent='As senhas precisam ser iguais.';error.hidden=false;return}
  const input={request_id:requestId,name:$('#new-name').value.trim(),username:$('#new-username').value.trim().toLowerCase(),password:$('#new-password').value,is_admin:$('#new-role').value==='admin',enabled:$('#new-enabled').checked};
  if(input.is_admin&&!confirm('Esta pessoa poderá criar contas e gerenciar o acesso de outros instrutores. Cadastrar como administrador?'))return;
  button.disabled=true;attempted=true;
  try{
   const result=await api.createInstructor(input);clear();dialog.close();await onSaved();
   const feedback=document.querySelector('#instructor-feedback');if(feedback){feedback.className='notice';feedback.textContent='Conta criada. Usuário: '+result.username+'. O instrutor já pode entrar com a senha definida'+(result.enabled?'.':' após você ativar o acesso.');feedback.hidden=false}
  }catch(failure){
   error.textContent=messages[failure.message]||'Não foi possível confirmar o cadastro. Confira a conexão e tente novamente com os mesmos dados.';error.hidden=false;button.disabled=false;
   if(failure.message==='USERNAME_TAKEN'){requestId=crypto.randomUUID();attempted=false}
   // Após reservar, os dados de identidade devem continuar iguais ao repetir.
   if(attempted)for(const id of ['#new-name','#new-username','#new-role','#new-enabled'])$(id).disabled=true;
  }finally{input.password=''}
 };
}

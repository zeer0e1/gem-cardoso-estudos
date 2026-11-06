import * as api from './data.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const messages={ADMIN_REQUIRED:'Somente administradores ativos podem redefinir senhas.',LOGIN_REQUIRED:'Sua sessão expirou. Entre novamente antes de redefinir a senha.',INSTRUCTOR_NOT_FOUND:'O instrutor não foi encontrado. Atualize a lista.',INVALID_RESET:'Confira a senha: use de 8 a 128 caracteres.',PASSWORD_REJECTED:'A senha foi recusada pelo serviço. Escolha uma senha mais forte.',REQUEST_REUSED:'Este pedido não corresponde à conta selecionada. Feche a janela e tente novamente.',RESET_NOT_CONFIRMED:'Não foi possível confirmar a alteração. Mantenha esta mesma senha e tente novamente. A alteração pode já ter sido aplicada.'};
export function resetPasswordPage(row,onSaved){
 if(!row?.id||!api.currentIsAdmin()||!navigator.onLine)return;
 const dialog=document.querySelector('#details'),content=document.querySelector('#detail-content'),closeButton=document.querySelector('#close-details');
 const requestId=crypto.randomUUID();let busy=false;
 content.innerHTML=`<div class="eyebrow">SEGURANÇA DA CONTA</div><h2>Redefinir senha</h2><div class="reset-target"><strong>${esc(row.name)}</strong><span>${esc(row.username?'Usuário: '+row.username:row.email)}</span></div><p class="sub small-copy">Defina uma nova senha e compartilhe diretamente com o instrutor. A senha anterior deixará de funcionar para novos acessos.</p><form id="reset-password-form" autocomplete="off"><div class="fields"><div class="field full"><label for="reset-password">Nova senha</label><input id="reset-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><small>Use pelo menos 8 caracteres. Não reutilize uma senha antiga.</small></div><div class="field full"><label for="reset-confirm">Confirmar nova senha</label><input id="reset-confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div></div><label class="reset-consent"><input id="reset-consent" type="checkbox" required><span>Confirmo a troca da senha de ${esc(row.name)}.</span></label><p id="reset-error" class="error" role="alert" hidden></p><button id="reset-submit" class="button" style="margin-top:20px">Salvar nova senha</button><p class="sub small-copy" style="margin:15px 0 0">O usuário, a permissão e os registros do instrutor permanecem os mesmos.</p></form>`;
 const form=content.querySelector('#reset-password-form'),password=content.querySelector('#reset-password'),confirmation=content.querySelector('#reset-confirm'),feedback=content.querySelector('#reset-error'),button=content.querySelector('#reset-submit');
 const clear=()=>{password.value='';confirmation.value=''};
 const preventCancel=event=>{if(busy)event.preventDefault()};
 dialog.addEventListener('cancel',preventCancel);
 dialog.addEventListener('close',()=>{clear();dialog.removeEventListener('cancel',preventCancel);closeButton.disabled=false},{once:true});
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;feedback.hidden=true;
  if(password.value!==confirmation.value){feedback.textContent='As senhas precisam ser iguais.';feedback.hidden=false;return}
  if(!navigator.onLine){feedback.textContent='Conecte-se à internet para redefinir a senha.';feedback.hidden=false;return}
  busy=true;button.disabled=true;closeButton.disabled=true;button.textContent='Salvando nova senha…';password.readOnly=true;confirmation.readOnly=true;
  let input={request_id:requestId,target_id:row.id,password:password.value};
  try{
   await api.resetInstructorPassword(input);clear();busy=false;dialog.close();await onSaved();
   const result=document.querySelector('#instructor-feedback');if(result){result.className='notice';result.textContent='Senha de '+row.name+' redefinida. Compartilhe a nova senha diretamente com o instrutor.';result.hidden=false}
  }catch(error){
   feedback.textContent=messages[error.message]||messages.RESET_NOT_CONFIRMED;feedback.hidden=false;
   if(error.message==='PASSWORD_REJECTED'||error.message==='INVALID_RESET'){password.readOnly=false;confirmation.readOnly=false}
  }finally{input.password='';input=null;busy=false;button.disabled=false;closeButton.disabled=false;button.textContent='Salvar nova senha'}
 };
 dialog.showModal();
}

import * as api from './data.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function editStudy(row,onSaved){
 const dialog=document.querySelector('#details'),content=document.querySelector('#detail-content');
 if(row.pending||!navigator.onLine)return;
 const keys=['lesson_date','method','scales','hymnal'],previous=Object.fromEntries(keys.map(k=>[k,row[k]]));let operationId=crypto.randomUUID(),lastChanges=null;
 content.innerHTML=`<div class="eyebrow">CORRIGIR REGISTRO</div><h2>Editar ficha de estudo</h2><p>${esc(row.student_name)} · ${esc(row.instrument)}</p><p class="sub small-copy">Registrada por ${esc(row.instructor_name)}. A edição exige conexão.</p><form id="edit-study-form"><div class="fields"><div class="field full"><label for="edit-lesson">Data da aula</label><input id="edit-lesson" name="lesson_date" type="date" value="${esc(row.lesson_date)}" required></div>${[['method','Lições do Método'],['scales','Estudo das Escalas'],['hymnal','Estudo do Hinário']].map(([k,l])=>`<div class="field full"><label for="edit-${k}">${l}</label><textarea id="edit-${k}" name="${k}" required maxlength="4000">${esc(row[k])}</textarea></div>`).join('')}</div><p id="edit-error" class="error" hidden role="alert"></p><button class="button" style="margin-top:20px">Salvar alterações</button></form>`;
 content.querySelector('form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),error=form.querySelector('#edit-error');
  const changes=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v).trim()]));if(keys.some(k=>!changes[k]))return;
  if(lastChanges&&JSON.stringify(lastChanges)!==JSON.stringify(changes))operationId=crypto.randomUUID();lastChanges=changes;button.disabled=true;error.hidden=true;
  try{await api.editStudyRecord({operation_id:operationId,study_id:row.id,previous,changes});dialog.close();onSaved()}
  catch(e){error.textContent=e.message.includes('VERSION_CONFLICT')?'Outra pessoa alterou esta ficha. Feche, atualize a lista e revise a versão mais recente.':'Não foi possível confirmar a edição. Confira a conexão e repita com os mesmos dados.';error.hidden=false;button.disabled=false}
 };
}

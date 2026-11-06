export function loginEmail(value){
 const login=String(value||'').trim().toLowerCase();
 if(login.includes('@'))return login;
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login))throw Error('Use um usuário de 3 a 32 caracteres, com letras sem acento, números, ponto, hífen ou sublinhado.');
 return login+'@login.gem.invalid';
}

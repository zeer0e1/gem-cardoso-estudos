-- Substituir pelo e-mail e nome reais, após o usuário criar a própria senha.
-- Rodar pelo painel do projeto; nunca pelo cliente público.
insert into public.gem_instructors(id,name)
select id, 'Nome do instrutor'
from auth.users where email='instrutor@example.com'
on conflict(id) do nothing;

-- Desativação sem excluir histórico:
-- update public.gem_instructors set enabled=false where id='UUID_DO_INSTRUTOR';

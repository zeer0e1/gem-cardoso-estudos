# GEM Cardoso — área dos instrutores

Aplicativo web responsivo para instrutores acompanharem alunos, instrumentos, estudos e frequência. Hospedagem estática no GitHub Pages; autenticação e banco no Supabase.

## Recursos

- Login real por e-mail/senha. O nome do instrutor vem de um perfil autorizado no banco, não de um campo editável na ficha.
- Cadastro de alunos com instrumento, edição e inativação. Fichas antigas preservam o nome e instrumento do momento da gravação no servidor.
- Fichas com método, escalas, hinário e revisão antes de salvar.
- Chamada por data: presente, falta justificada com motivo, falta sem justificativa. Uma entrada por aluno/data, compartilhada pelos instrutores do GEM.
- Painel mensal: alunos ativos, instrumentos distintos, estudos, frequência, distribuição de instrumentos e frequência individual.
- IndexedDB com cópia da turma, rascunhos e fila por conta. Recibos idempotentes, atraso entre tentativas e tratamento explícito de conflitos.
- Exportação JSON da cópia local da turma e dos pendentes. A exportação é uma cópia de segurança; não há importação nesta versão.
- Página Instrutores para administradores: autorizar contas existentes, editar nomes, suspender acesso e definir administradores. Alterações online, com auditoria e proteção contra retirar o próprio acesso.

## Configuração e banco

`config.js` contém URL e **chave publishable**, própria para o navegador. Nunca colocar `service_role`, senha do banco, tokens de sessão ou chave `sb_secret` no repositório.

Para um projeto novo: executar `backend/schema.sql`, depois `backend/hardening.sql`, uma única vez e nessa ordem. Os arquivos representam a instalação inicial; não são scripts de atualização para executar novamente sobre um banco preenchido. O segundo arquivo move as funções privilegiadas para um schema privado e expõe somente wrappers invoker. Todas as tabelas têm RLS e negam acesso direto a anon/authenticated. As funções verificam o perfil autorizado antes de ler ou gravar.

Criar as contas em Supabase → Authentication → Users. Cada instrutor deve definir sua própria senha. Depois de executar `backend/admin.sql`, o responsável promove o primeiro administrador no banco. Os demais acessos são gerenciados em Instrutores no aplicativo, informando o e-mail da conta já criada. `backend/authorize-instructor.example.sql` continua como alternativa de manutenção pelo responsável do projeto. Criar conta no Auth, por si só, não concede acesso aos dados. Para desativar, alterar `enabled=false` no perfil. Não usar `user_metadata` para decisões de autorização.

Os instrutores autorizados compartilham a mesma turma do GEM. Esta versão ainda não separa escolas, turmas, horários ou múltiplas aulas na mesma data. As faltas justificadas continuam como ausência no cálculo; apenas registros efetivamente marcados entram no denominador.

## Offline e consistência

O primeiro login precisa de internet. A sessão já iniciada permite trabalhar com o último conteúdo sincronizado offline. Uma sessão expirada precisa ser renovada online para enviar. O cache local não é uma barreira de segurança em um aparelho compartilhado: usar contas e aparelhos apropriados e sair ao terminar.

O servidor atribui a autoria usando `auth.uid()`. Cada operação tem UUID; o servidor grava resultado e recibo na mesma transação. Um timeout repete o mesmo UUID. A fila só remove operações após um recibo correspondente e a atualização transacional da cópia local. Operações seguintes aguardam a resolução de um conflito anterior. Comparação de versões detecta alterações concorrentes de alunos/chamadas. Reaplicar alterações requer uma ação explícita do instrutor. Não há promessa de sincronizar com o aplicativo fechado no iPhone.

O cache do service worker contém somente os arquivos estáticos. As respostas da API e credenciais não são gravadas no Cache Storage. Sessão, cópia local e fila ficam em IndexedDB por conta. Limpar os dados do site pode apagá-las. Abrir, retomar, voltar a ter conexão ou tocar em Sincronização tenta enviar os pendentes. O navegador recebe os dados atualizados a cada sincronização, sem depender de um canal Realtime.

## Dados da primeira versão

O banco IndexedDB anterior `gem-cardoso-v1` é preservado. Ajuda permite exportar as fichas antigas no mesmo navegador/endereço. Elas não são importadas automaticamente, pois os alunos e a autoria precisam ser conciliados com os cadastros reais. O Google Forms e suas respostas não são alterados. Nada é enviado para ele nesta versão.

## Desenvolvimento e testes

Servir a raiz por HTTP no localhost ou HTTPS na hospedagem. Não há build ou dependências externas no aplicativo. O service worker fica desativado no localhost para evitar versões antigas durante o desenvolvimento.

`npm ci` e `npm test` executam testes de frequência, projeção da fila, isolamento por conta, conflito e timeout depois de gravar. A única dependência de desenvolvimento é fake-indexeddb, fixada no lockfile. `backend/verify.sql` testa idempotência, autoria, autorização, unicidade e conflito com dados transacionais que são revertidos no final.

Publicação: GitHub → Settings → Pages → Deploy from a branch → main → / (root). Depois de alterações em arquivos estáticos, incrementar a versão do cache em `sw.js`. Em uma atualização, um acesso pode ainda usar a versão anterior até o novo service worker assumir; fechar e reabrir o aplicativo carrega a nova versão. A publicação não apaga os dados locais anteriores.

## Limites desta etapa

Sem upload de arquivos, recuperação de senha ou criação de senhas de novas contas pela interface. A autorização e gestão de instrutores estão disponíveis para administradores dentro do app. Recuperação e convites por e-mail dependem da configuração de envio do Supabase. Gerenciar os primeiros usuários no painel. O snapshot completo foi escolhido para a turma do protótipo; grandes volumes exigirão paginação e sincronização incremental. Os testes não substituem a validação em aparelhos Android e iPhone reais.



## Administração de instrutores

Executar `backend/admin.sql` sobre a instalação v2 existente. Os perfis recebem `is_admin=false` por padrão. A promoção inicial deve usar o UUID e e-mail conferidos de quem administra o projeto; não se basear em nome ou metadados editáveis. A página Instrutores só aparece para um perfil ativo com `is_admin=true`, e todas as chamadas são verificadas novamente no banco. Nenhuma chave privilegiada é enviada ao navegador. Nomes alterados valem para registros futuros; fichas e chamadas antigas mantêm a autoria gravada.

Somente contas existentes em Authentication > Users podem ser autorizadas por e-mail. A senha não é cadastrada nem alterada por esta página. As operações administrativas exigem internet e não entram na fila offline. O próprio administrador não pode se desativar nem se rebaixar. Mudanças concorrentes são recusadas por versão; a auditoria registra autor, alvo e valores anteriores e posteriores.

`backend/verify-admin.sql` verifica permissões, autorização, suspensão, conflitos e auditoria com dados transacionais revertidos ao terminar.

### Contas com usuário e senha
Administradores podem abrir Instrutores → Cadastrar instrutor e informar nome, usuário único, senha e permissão. Não exige e-mail real nem SMTP. O usuário aceita 3–32 caracteres minúsculos (letras sem acento, números, ponto, hífen e sublinhado) e permanece fixo; a senha tem 8–128 caracteres. Contas antigas continuam entrando por e-mail. Cadastro exige conexão; o uso offline continua disponível após o primeiro login autorizado.

Instale backend/username-accounts.sql depois de admin.sql. Implante backend/create-instructor/index.js como função gem-create-instructor (index.ts no editor). A função valida o token com Auth, confere o administrador ativo no banco, reserva uma identidade estável e usa a API administrativa de Auth apenas no servidor. Usa SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY do ambiente do Supabase; nunca copie chaves privilegiadas para o cliente. A verificação JWT no gateway pode ficar habilitada quando compatível com os tokens do projeto; a função também verifica a autenticação internamente.

O endereço interno usuario@login.gem.invalid é somente um identificador técnico do Supabase, sem caixa de correio. Não existe recuperação de senha por e-mail para essas contas. A redefinição ainda exige o responsável pelo projeto; esta versão não tem uma página de troca de senha. Senhas não entram em logs, auditoria, IndexedDB ou na fila offline. O administrador deve compartilhá-las diretamente com o titular.

Uma reserva de cadastro salva identidade e permissões, nunca a senha. Repetições com o mesmo pedido reutilizam a identidade e não redefinem a senha. Se a resposta se perder, mantenha os dados e tente novamente. Dados do pedido ficam protegidos em schema privado, sem acesso direto de clientes. Apenas a finalização após criação confirmada no Auth libera o perfil e registra auditoria. O cadastro público não foi habilitado no app.

Validação: npm test e backend/verify-username-accounts.sql (transacional, com rollback).

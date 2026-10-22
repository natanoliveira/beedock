# Usuários e acesso do MASTER — design

Data: 2026-10-22 · Status: escrito sem rodada de perguntas (usuário pediu para seguir com o backlog). Decisões marcadas **[Claude]** são escolhas do Claude para o usuário revisar.

Contexto obrigatório: `docs/CODEBASE_MAP.md` (withScope/withAudit, RLS, TENANT_MODELS, boundaries de componentes, FormState).

## Intenção

Hoje um usuário só entra numa empresa pelo convite de Admin feito na criação da empresa; e-mail já cadastrado é recusado; não dá para trocar o Admin depois de ativo; a empresa não tem como cadastrar funcionários; e o MASTER não consegue entrar no app de uma empresa. O MASTER é dono da plataforma e precisa de **visibilidade total**: ver e operar qualquer empresa, com tudo auditado. Esta demanda fecha o ciclo de pessoas: quem existe, em quais empresas, com qual papel, e como se troca de empresa.

## Objetivos

1. **Tela de Usuários da plataforma** (`/plataforma/usuarios`): todos os usuários com nome, e-mail, tipo (MASTER/usuário), empresas + papel + ativo, último acesso, bloqueado. Busca por nome/e-mail, filtro por empresa. Detalhe `/plataforma/usuarios/[id]`.
2. **MASTER gerencia vínculos**: na empresa (`/plataforma/empresas/[id]`, seção "Pessoas") e no detalhe do usuário:
   - vincular **usuário existente** a uma empresa como ADMIN ou FUNCIONARIO (direto, sem convite — o usuário já tem senha);
   - **convidar novo** por e-mail como ADMIN ou FUNCIONARIO (link 48h, como hoje);
   - trocar papel (ADMIN ↔ FUNCIONARIO), desativar e reativar vínculo.
3. **Usuário em várias empresas**: login entra na última empresa usada; seletor "Trocar empresa" no header quando houver mais de um vínculo ativo.
4. **MASTER entra em qualquer empresa**: botão "Entrar na empresa" na tela da empresa e seletor de empresa no header da plataforma. Dentro, opera com poderes de ADMIN, faixa visível "Você está como MASTER em <empresa> · Voltar à plataforma". Entrada, saída e todas as ações auditadas com papel MASTER.
5. **Admin gerencia a equipe** (`/configuracoes/equipe`, permissão `member.manage`): lista membros, convida (ADMIN ou FUNCIONARIO), troca papel, desativa/reativa.

## Não-objetivos

- Envio de e-mail (convite continua link para copiar/WhatsApp).
- Recuperação de senha, perfil do usuário, troca de senha.
- Anonimizar/excluir usuário globalmente (LGPD — fase própria).
- Acesso de suporte com justificativa/prazo (`SupportAccessGrant`): substituído pela visibilidade total; o model fica sem uso.
- Papéis novos além de ADMIN/FUNCIONARIO; permissões customizáveis.

## Anti-objetivos (falha mesmo funcionando)

- Empresa ficar **sem nenhum Admin ativo** por ação de usuário (trocar papel/desativar o último Admin deve ser recusado).
- Admin de empresa conseguir **descobrir** se um e-mail já existe na plataforma (enumeração). Para o Admin, convidar sempre responde "convite gerado".
- Ação do MASTER dentro da empresa aparecer na auditoria como se fosse do Admin.
- Usuário desativado continuar logado naquela empresa.
- Qualquer leitura de Membership/Invitation fora de `withScope` (RLS devolve vazio silenciosamente — ver gotcha no mapa).

## Decisões

### Convites (generalização do atual)
- `Invitation.role` passa a aceitar ADMIN e FUNCIONARIO (o enum já existe). `issueInvite` deixa de revogar "todos os convites ADMIN abertos" e passa a revogar os abertos **do mesmo e-mail na mesma empresa**.
- Remover a regra "empresa já tem Admin ativo" do reenvio — vira convite comum.
- **[Claude]** Convite para e-mail que **já é usuário**: aceito pela mesma página `/convite/[token]`, que nesse caso pede a **senha atual** (não cria senha) e só cria o vínculo. Assim o Admin não enumera e-mails e o fluxo é único. Senha errada conta como falha de login (lockout/rate limit existentes).
- Criação da empresa continua convidando o Admin inicial; se o e-mail já existir, o MASTER pode escolher vincular direto (em vez do erro `EMAIL_TAKEN` atual). **[Claude]**: no formulário de criação, e-mail existente → vínculo direto como ADMIN, com aviso "usuário já cadastrado, será vinculado".
- Aceite cria `Membership` com o papel do convite; se existir vínculo inativo, reativa com o novo papel.

### Vínculo direto (só MASTER)
- MASTER busca usuário por e-mail/nome e escolhe empresa + papel. Cria ou reativa `Membership`. Auditoria `member.create`/`member.reactivate` na cadeia da empresa, ator MASTER.

### Trocar papel / desativar
- Guarda do último Admin: recusar se a operação deixaria a empresa com zero ADMIN ativos (checar dentro da mesma transação com `FOR UPDATE` nos vínculos ADMIN da empresa para evitar corrida de dois Admins se rebaixando).
- Desativar vínculo revoga as sessões do usuário **naquela empresa** (`Session.organizationId = org`). Trocar papel não precisa revogar (papel é relido a cada request em `getCurrentSession`).
- **[Claude]** Admin não pode desativar/rebaixar a si mesmo se for o último Admin (coberto pela guarda); pode se for um entre vários.
- Auditoria: `member.role_change` (before/after), `member.deactivate`, `member.reactivate`.

### Empresa ativa da sessão (multi-empresa)
- `Session.organizationId` continua sendo a empresa ativa. Trocar de empresa = action `switchOrganizationAction(orgId)` que valida (vínculo ativo + empresa ACTIVE, ou MASTER) e **atualiza a sessão** (organizationId + idleMinutes da nova empresa) na mesma transação da auditoria `auth.switch_org`. Redireciona para `/inicio`.
- **[Claude]** Login escolhe a empresa da **sessão mais recente do usuário** que ainda tenha vínculo ativo; senão o vínculo mais antigo (comportamento atual). Sem mudança de schema.
- Seletor no header (organism novo no slot `account` ou junto do `brand` do `AppShellTemplate`) só aparece com 2+ opções.

### MASTER dentro da empresa
- `getCurrentSession`: MASTER com `organizationId` e sem vínculo ativo recebe **papel efetivo ADMIN** e flag `actingAsMaster: true` (com vínculo ativo, usa o papel do vínculo e `actingAsMaster: false`). `requireTenant` deixa de mandar MASTER para `/plataforma` quando há empresa.
- Auditoria: `TenantContext` ganha o papel de auditoria; quando `actingAsMaster`, o `userRole` gravado é `MASTER` (permissão continua avaliada como ADMIN). Isso cobre todas as escritas existentes sem tocar cada service.
- Entrar: `platform.org_enter` (cadeia da empresa); sair ("Voltar à plataforma"): `platform.org_leave`, sessão volta a `organizationId = null`.
- Faixa no shell (`AppShellTemplate` já tem slot `banner`) com nome da empresa e botão "Voltar à plataforma". Tom de aviso (`--warning`), sempre visível.
- Empresa suspensa: MASTER **pode** entrar? **[Claude]** Não — mantém a regra atual (sessão em empresa não-ACTIVE é inválida); reativar primeiro pelo painel.
- No header da plataforma, seletor/busca de empresa com "Entrar".

### Tela de equipe do Admin
- `/configuracoes/equipe`: tabela de membros (nome, e-mail, papel, ativo, último acesso), convites pendentes (com reenviar/revogar), botão "Convidar pessoa" (Dialog desktop / Drawer mobile, como o resto) com nome, e-mail, telefone opcional, papel. Link do convite mostrado uma vez para copiar/WhatsApp (reusar `InviteCard`/flash existente).
- Link "Equipe" no dropdown "Empresa" do `AppNavigation` (permissão `member.manage`).
- Funcionário não vê a tela (`AdminOnlyNotice`, como as outras de configurações).

### RLS / dados
- Sem tabela nova. Possível migration só se o builder achar necessário (ex.: índice `Invitation(organizationId, email)`; `Session(userId, createdAt)`).
- Lista global de usuários: `User` é global (sem RLS); vínculos via `withScope({platform:true})` numa única transação.

## Testes (integração Neon, padrão de `tests/`)
- MASTER vincula usuário existente; reativa vínculo inativo; não-MASTER negado + auditado.
- Convite FUNCIONARIO para e-mail novo (cria usuário) e para e-mail existente (pede senha atual; senha errada falha e conta para lockout).
- Admin convida: resposta idêntica para e-mail novo e existente (sem enumeração).
- Guarda do último Admin: rebaixar/desativar último Admin recusado; dois Admins se rebaixando em paralelo → um falha.
- Desativar vínculo revoga só as sessões daquela empresa.
- Trocar empresa: sem vínculo recusado; empresa suspensa recusada; sessão atualizada + auditoria na mesma tx.
- MASTER entra na empresa: `getCurrentSession` devolve ADMIN + actingAsMaster; escrita (ex.: criar lançamento) grava `userRole = MASTER`; sair volta a plataforma.
- Login escolhe a última empresa usada.

## Validação UI
`/frontend-design` antes de implementar telas; validar com agent-browser no dev (porta 3004) ou preview em `previews/`. Precisa de senha conhecida do Admin demo no banco dev — o builder pode redefinir via script/SQL no banco dev.

## Deixado para o builder
- Nomes exatos de actions/services e divisão em arquivos (sugestão: `features/members/` para equipe/vínculos/troca de empresa; convites continuam em `features/platform/invitations.ts` ou migram para `features/members/`).
- Layout fino das tabelas e do seletor (seguir design system Colmeia & Doca, desktop-first, responsivo).
- Paginação da lista de usuários (simples, 50 por página como lançamentos).
- Atualizar `docs/CODEBASE_MAP.md` ao final.

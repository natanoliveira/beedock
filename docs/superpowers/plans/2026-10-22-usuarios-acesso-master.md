# Usuários e acesso do MASTER · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o ciclo de pessoas: convites ADMIN/FUNCIONARIO (inclusive para quem já tem conta), vínculos geridos pelo MASTER e pelo Admin, usuário em várias empresas com troca no header, MASTER entrando em qualquer empresa com auditoria `MASTER`, e a tela global de usuários.

**Architecture:** Novo módulo `features/members/` (equipe/vínculos em `service.ts`, empresa ativa da sessão em `switch.ts`, actions finas em `actions.ts`); convites seguem em `features/platform/invitations.ts` e ganham papel; lista global em `features/platform/users.ts`. Papel de auditoria entra no `Actor` (`auditRole`) e é preenchido por `requireTenant`, cobrindo todas as escritas sem tocar cada service. Sem tabela nova e sem migration.

**Tech Stack:** Next 16.4 (App Router, Server Actions), Prisma 7.10 + adapter Neon (RLS), Auth.js v5, Zod 4, Vitest 5, Tailwind 4 + shadcn, Argon2 (`@node-rs/argon2`).

**Spec:** `docs/superpowers/specs/2026-10-22-usuarios-acesso-master-design.md` — ler junto; o plano não repete o que a spec fixa (objetivos, anti-objetivos, eventos de auditoria). Ler também `docs/CODEBASE_MAP.md` (withScope/withAudit, RLS, boundaries, FormState) e `AGENTS.md`.

## Pendências para o usuário

1. **MASTER com vínculo próprio na empresa.** A spec diz que, com vínculo ativo, o MASTER usa o papel do vínculo e `actingAsMaster: false`, mas não diz se ele vê a faixa "Voltar à plataforma" nesse caso. Sem ela não há como sair para a plataforma, a não ser fazendo logout. **Decisão provisória (Task 7):** a faixa aparece para todo MASTER dentro de uma empresa. O texto "Você está como MASTER em <empresa>" só aparece quando `actingAsMaster`. Quando ele usa o próprio vínculo, a faixa diz "<empresa> · Voltar à plataforma". A auditoria segue a spec.
2. **"Bloqueado" na lista de usuários** só mostra o estado (`lockedUntil > agora`). A spec não pede ação de desbloquear e o plano não cria uma. Confirmar se o MASTER precisa de "Desbloquear".
3. **"Último acesso"** vem de `max(Session.lastSeenAt)`, que é mais fiel que `User.lastLoginAt`. Na equipe da empresa é o máximo das sessões *naquela empresa*. Confirmar.

## Decisões do plano (revisar junto)

- Convite para e-mail que **já é membro ativo daquela empresa** é recusado com "Esta pessoa já faz parte da equipe.". Isso não abre enumeração, porque o Admin já vê a lista da própria equipe. E-mail que existe na plataforma mas não está na equipe recebe sempre "convite gerado".
- Aceite de convite quando o vínculo já está **ativo** (corrida) marca o convite como aceito e **não** muda o papel. Papel só muda por `changeMemberRole`, que tem a guarda do último Admin.
- Aceite com **senha atual errada** não consome o convite. Grava `auth.login_failed`, conta para o lockout e responde "Senha incorreta.". Com a conta bloqueada, a resposta é a mesma mensagem de bloqueio do login.
- Troca de empresa e entrada do MASTER auditam na **cadeia da empresa de destino**. `platform.org_leave` vai para a cadeia da empresa que ficou para trás.
- Ao sair ("Voltar à plataforma"), a sessão volta a `organizationId = null` e `idleMinutes = DEFAULT_IDLE_MINUTES` (60).
- Na criação de empresa com e-mail já cadastrado, o MASTER vê o aviso no blur do campo, via `findUserByEmailAction`, só para MASTER. Depois de salvar, a página da empresa mostra "Usuário já cadastrado: vinculado como Admin.".
- `InviteCard` e `resendInvitation` são substituídos pela seção "Pessoas" (`TeamManager`). O trecho do link (copiar/WhatsApp) vira a molecule `InviteLink`.
- Sem migration: os índices sugeridos na spec só entram se o `EXPLAIN` mostrar necessidade (YAGNI).

## Global Constraints

- Node: `source ~/.nvm/nvm.sh && nvm use 22.16.0 >/dev/null &&` antes de qualquer `pnpm` (vale para **toda** task).
- Integração: `set -a && source .env && set +a && TEST_DATABASE_URL="$DATABASE_URL" TEST_DIRECT_URL="$DIRECT_URL" pnpm vitest run <arquivo>`. Padrão de `tests/platform.test.ts`/`tests/auth.test.ts`: `describe.skipIf(!APP_URL || !OWNER_URL)`, cliente dono (`TEST_DIRECT_URL`) para preparo/limpeza, imports dinâmicos depois de setar `process.env.DATABASE_URL`, `suffix = Date.now().toString(36)`, limpeza de tudo em `afterAll` (sessions → invitations → memberships → catálogo/settings → orgs → users; `AuditLog` é imutável e fica). Arquivo que importa `lib/session.ts` faz `vi.mock("server-only", () => ({}))` e `vi.mock("@/lib/auth", () => ({ auth: async () => null }))`.
- Next 16.4: ler `node_modules/next/dist/docs/` antes de usar params/searchParams assíncronos, Server Actions, `redirect`, `revalidatePath`.
- RLS: `Membership` e `Invitation` **sempre** dentro de `withScope`/`withAudit`. Lista sem empresa conhecida → `withScope({ platform: true })`. `include: { memberships }` fora de `withScope` volta vazio sem erro.
- Toda escrita: autorização (`authorize`/`assertMaster`/`assertCanManage`) → escrita + `appendAudit` na **mesma** transação. Nenhum token, hash ou senha em `before`/`after`/logs.
- Papéis: só `ADMIN` | `FUNCIONARIO` (enum `MemberRole`). Permissão de equipe: `member.manage` (já existe, só ADMIN).
- Mensagens fixas: `LAST_ADMIN = "A empresa precisa de pelo menos um Admin ativo."`, `ALREADY_MEMBER = "Esta pessoa já faz parte da equipe."`, `USER_NOT_FOUND = "Nenhum usuário com este e-mail. Use Convidar."`.
- Proteção de rota só por guard (`requireTenant`/`requireMaster`) em page, action e route handler: não há middleware.
- UI: invocar `/frontend-design` antes de cada task de tela. Boundaries do eslint: organisms recebem actions como props e nunca importam `features/`; molecules/organisms não importam `components/ui` (usar os atoms `App*`); pages não importam `components/ui`. Dialog no desktop e Drawer no mobile (`useMediaQuery("(min-width: 768px)")`, como `ConfirmAction`). Tokens Colmeia & Doca (`bg-ink`, `bg-warning-soft`/`text-warning`, `text-primary`, `tape`, `font-heading`), alvos ≥44px, `motion-reduce`, copy pt-BR. Desktop-first, utilizável em 390px. Toda rota nova com leitura ganha `loading.tsx` com skeleton (`AppSkeleton`).
- **Git:** nenhum agente roda `git add/commit/push/branch/checkout`. Cada task termina com "não commitar": só propõe a mensagem (conventional commits em pt-BR, sem menção a IA).

## Review Focus

1. **MASTER faz uma escrita qualquer dentro da empresa** (lançamento, categoria, negação DENIED) e precisa aparecer como `MASTER` na auditoria, nunca como ADMIN. Teste: Task 1 (`createCategory` com o ctx do MASTER → `userRole = "MASTER"`; FUNCIONARIO-MASTER negado → DENIED com `userRole = "MASTER"`).
2. **Usuário desativado com aba aberta**: a próxima request não pode passar. Teste: Task 3 (depois de `setMemberActive(false)`, `loadSession(sid)` da sessão revogada → `null`).
3. **Empresa suspensa durante a troca/entrada**: a troca é recusada e a sessão fica como estava. Teste: Task 2.
4. **Admin de outra empresa mandando `membershipId` alheio** (burlando a UI): `NotFoundError`, nada muda. Teste: Task 3.
5. **Dois aceites/convites para o mesmo e-mail em empresas diferentes**: revogar só os convites do mesmo e-mail **na mesma empresa**. Teste: Task 4.

---

### Task 1: Papel de auditoria + MASTER dentro da empresa na sessão ⚠️ RISCO (sessão/auditoria — revisão opus)

**Files:**
- Modify: `lib/audit.ts` (campo `auditRole` no `Actor`; `appendAudit`)
- Modify: `lib/session.ts` (`loadSession`, `toTenantContext`, `actingAsMaster`, `requireTenant`)
- Modify: `features/platform/actor.ts` (MASTER → `organizationId: null`)
- Test: `tests/session.test.ts` (novo)

**Interfaces:**
- Produces:
  - `Actor.auditRole?: string`. `appendAudit` grava `userRole: actor.auditRole ?? actor.role`. `authorize`/`can` continuam usando `ctx.role`.
  - `CurrentSession` ganha `actingAsMaster: boolean`. Para MASTER com `organizationId` sem vínculo ativo: `role = "ADMIN"`, `actingAsMaster = true`. MASTER com vínculo ativo: papel do vínculo, `false`. Não-MASTER sem vínculo ativo: `null` (como hoje). Empresa não-ACTIVE: `null` para todos, inclusive MASTER.
  - `loadSession(sid: string): Promise<CurrentSession | null>`: o corpo atual de `getCurrentSession` sem `auth()`. `getCurrentSession = cache(async () => { const sid = (await auth())?.sid; return sid ? loadSession(sid) : null; })`.
  - `toTenantContext(session: CurrentSession, meta: RequestMeta): TenantContext & { session: CurrentSession }`: lança `Error` se faltar `organization`/`role`. Preenche `auditRole: session.actingAsMaster ? "MASTER" : undefined`. `requireTenant` mantém os redirects e chama `toTenantContext`.
  - `platformActor()`: quando `isMaster`, `organizationId: null` (ações da plataforma passam a empresa explicitamente).

- [ ] **Step 1: Testes que falham** em `tests/session.test.ts`. No preparo, o dono cria uma org ACTIVE + `organizationSettings`, um MASTER, um USER com vínculo FUNCIONARIO e as `Session` (`expiresAt` +1 dia, `idleMinutes` 60):
  - `loadSession(sid do MASTER com organizationId = org, sem vínculo)` → `role === "ADMIN"`, `actingAsMaster === true`
  - mesmo MASTER depois que o dono cria um vínculo FUNCIONARIO ativo → `role === "FUNCIONARIO"`, `actingAsMaster === false` (remover o vínculo depois)
  - USER com vínculo desativado pelo dono → `null`
  - org suspensa pelo dono → sessão do MASTER nessa org → `null` (reativar depois)
  - `createCategory(toTenantContext(sessãoMaster, meta), { name: \`Cat ${suffix}\`, type: "INCOME" })` → `AuditLog` `category.create` da org com `userRole === "MASTER"` e `userId` do MASTER
  - MASTER com vínculo FUNCIONARIO chama `createCategory` (ADMIN-only) → `ForbiddenError` e DENIED com `userRole === "FUNCIONARIO"` (sem `auditRole`, porque está usando o próprio vínculo)
- [ ] **Step 2:** `set -a && source .env && set +a && TEST_DATABASE_URL="$DATABASE_URL" TEST_DIRECT_URL="$DIRECT_URL" pnpm vitest run tests/session.test.ts` → FAIL (`loadSession` não exportado)
- [ ] **Step 3:** Implementar conforme Interfaces.
- [ ] **Step 4:** Mesmo comando → PASS. `pnpm typecheck && pnpm lint` → limpos. `pnpm vitest run tests/` (com TEST_*) → suíte verde.
- [ ] **Step 5:** não commitar; propor `feat(auth): papel MASTER na auditoria e MASTER dentro da empresa`

---

### Task 2: Empresa ativa da sessão — trocar, entrar, sair, login na última usada ⚠️ RISCO (sessão/auth — revisão opus)

**Files:**
- Create: `features/members/switch.ts`
- Modify: `features/auth/service.ts` (exportar `DEFAULT_IDLE_MINUTES`; escolha da empresa no login)
- Test: `tests/switch.test.ts` (novo), `tests/auth.test.ts` (novo caso)

**Interfaces:**
- Consumes: `loadSession` (Task 1), `appendAudit`, `recordAudit`, `withScope`, `ForbiddenError`
- Produces (`features/members/switch.ts`):
  - `type SessionActor = { sessionId: string; userId: string; userName: string; isMaster: boolean; currentOrganizationId: string | null; meta: RequestMeta }`
  - `listOrganizationOptions(actor: Pick<SessionActor, "userId" | "isMaster">): Promise<{ id: string; name: string }[]>`. Não-MASTER: vínculos ativos com org ACTIVE, lidos em `withScope({ platform: true })`. MASTER: todas as orgs ACTIVE. Ordenado por nome.
  - `switchOrganization(actor: SessionActor, organizationId: string): Promise<void>`. Regras:
    - org inexistente/não-ACTIVE, ou não-MASTER sem vínculo ativo → `recordAudit({ userId, userName, role: actor.isMaster ? "MASTER" : null, organizationId: actor.currentOrganizationId, meta }, { action: "auth.switch_org", entityType: "Organization", entityId: organizationId, result: "DENIED" })` + `ForbiddenError`.
    - Mesma org atual → no-op.
    - Senão, em `withScope({ organizationId })`, faz `session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { organizationId, idleMinutes: settings.sessionIdleMinutes, lastSeenAt: now } })`. `count !== 1` → `ForbiddenError`.
    - Audita na mesma tx: `auth.switch_org` (com vínculo; `role` = papel do vínculo) ou `platform.org_enter` (MASTER sem vínculo; `role: "MASTER"`), com `entityType: "Session"`, `entityId: sessionId`, `before: { organizationId: atual }`, `after: { organizationId }`.
  - `leaveOrganization(actor: SessionActor): Promise<void>`. Não-MASTER → `ForbiddenError` (DENIED auditado). Sem empresa atual → no-op. Senão, em `withScope({ organizationId: atual })`, sessão → `organizationId: null`, `idleMinutes: DEFAULT_IDLE_MINUTES` + `platform.org_leave` (`role: "MASTER"`).
- `verifyCredentials`: entre os vínculos ativos com org ACTIVE, escolhe o da sessão mais recente: `db.session.findFirst({ where: { userId, organizationId: { in: ids } }, orderBy: { lastSeenAt: "desc" }, select: { organizationId: true } })`. Sem sessão anterior, usa o vínculo mais antigo (como hoje). MASTER continua com `organizationId: null`.

- [ ] **Step 1: Testes que falham** em `tests/switch.test.ts`. Preparo pelo dono: orgs A e B ACTIVE com settings (`sessionIdleMinutes` 30 em B), org C SUSPENDED, USER com vínculos ativos em A e B, MASTER sem vínculo e `Session` para cada um:
  - `listOrganizationOptions(USER)` → exatamente A e B; `(MASTER)` → contém A e B, não contém C
  - USER troca A→B: `session.organizationId === B`, `idleMinutes === 30`; `AuditLog` de B tem `auth.switch_org` com `before.organizationId === A`
  - USER troca para org sem vínculo → `ForbiddenError`, sessão continua em A, DENIED gravado
  - USER troca para C (suspensa, mesmo com vínculo criado pelo dono) → `ForbiddenError`; sessão inalterada (Review Focus 3)
  - MASTER entra em A → `platform.org_enter` com `userRole === "MASTER"` na cadeia de A; `loadSession` → `actingAsMaster === true`
  - MASTER `leaveOrganization` → `organizationId === null`, `idleMinutes === 60`, `platform.org_leave` na cadeia de A; `loadSession` → `organization === null`
  - USER `leaveOrganization` → `ForbiddenError`
  - sessão revogada pelo dono → `switchOrganization` → `ForbiddenError`

  Em `tests/auth.test.ts`: USER com vínculos em A (mais antigo) e B, mais uma `Session` antiga em B com `lastSeenAt` recente → `verifyCredentials` → a sessão criada tem `organizationId === B`; depois de desativar o vínculo em B → nova sessão em A.
- [ ] **Step 2:** `... pnpm vitest run tests/switch.test.ts tests/auth.test.ts` → FAIL
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS; `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(auth): troca de empresa, entrada do MASTER e login na última empresa`

---

### Task 3: Equipe — listar, trocar papel, desativar/reativar, vínculo direto ⚠️ RISCO (RLS/concorrência/sessões — revisão opus)

**Files:**
- Create: `features/members/service.ts`, `features/members/schemas.ts`
- Test: `tests/members.test.ts` (novo)

**Interfaces:**
- Consumes: `PlatformActor`, `assertMaster` (`features/platform/service.ts`), `FieldError`, `NotFoundError` (`features/platform/errors.ts`), `can`
- Produces:
  - `type MemberActor = Actor & { userId: string; userName: string; isMaster?: boolean }` (serve para `TenantContext` e `PlatformActor`)
  - `assertCanManage(actor: MemberActor, organizationId: string, action: string): Promise<void>`. Passa se `actor.isMaster`, ou se `actor.organizationId === organizationId && actor.role` for papel com `can(role, "member.manage")`. Senão, `recordAudit(actor, { action, result: "DENIED" })` + `ForbiddenError`.
  - `LAST_ADMIN`, `ALREADY_MEMBER`, `USER_NOT_FOUND` (constantes exportadas, textos em Global Constraints)
  - `type MemberRow = { id: string /* membershipId */; userId: string; name: string; email: string; role: MemberRole; active: boolean; lastSeenAt: Date | null }`
  - `type PendingInviteRow = { id: string; name: string; email: string; phone: string | null; role: MemberRole; expiresAt: Date }`
  - `listTeam(actor, organizationId): Promise<{ members: MemberRow[]; invites: PendingInviteRow[] }>`. Uma transação `withScope({ organizationId })`: vínculos com `user`, convites pendentes (não aceitos, não revogados, não expirados) e `session.groupBy({ by: ["userId"], where: { organizationId }, _max: { lastSeenAt } })`. Ordem: ativos primeiro, depois nome.
  - `changeMemberRole(actor, organizationId, membershipId, role: MemberRole): Promise<void>`. Audita `member.role_change` com `before/after: { role }`; mesmo papel → no-op.
  - `setMemberActive(actor, organizationId, membershipId, active: boolean): Promise<void>`. Ao desativar, revoga as sessões do usuário **naquela empresa** na mesma tx: `session.updateMany({ where: { userId, organizationId, revokedAt: null }, data: { revokedAt: now } })`. Audita `member.deactivate` / `member.reactivate`. Mesmo estado → no-op.
  - `linkUser(actor: PlatformActor, input: LinkUserInput): Promise<void>`. `assertMaster(actor, "member.create")`. Busca o `User` por e-mail (minúsculas). Inexistente ou `anonymizedAt` → `FieldError("email", USER_NOT_FOUND)`. Vínculo ativo → `FieldError("email", ALREADY_MEMBER)`. Inativo → reativa com o papel novo (`member.reactivate`, `after: { role }`). Sem vínculo → cria (`member.create`, `after: { name, email, role }`). Auditoria na cadeia da empresa com ator `{ ...actor, organizationId }`.
  - `schemas.ts`: `roleSchema = z.enum(["ADMIN", "FUNCIONARIO"], "Escolha o papel.")`; `linkUserSchema` → `LinkUserInput = { organizationId: string; email: string; role: MemberRole }` (e-mail `trim().toLowerCase()`).
- Ponto de entrada de cada escrita: `assertCanManage(actor, organizationId, "<evento>")`, depois `withScope({ organizationId })`. O vínculo é lido por `membershipId` dentro do escopo (RLS + `scopeArgs` garantem a empresa). Ausente → `NotFoundError`.
- **Guarda do último Admin** (`changeMemberRole` para FUNCIONARIO e `setMemberActive(false)`): como **primeira** query da tx, `tx.$queryRaw<{ id: string }[]>\`SELECT id FROM "Membership" WHERE "organizationId" = ${organizationId} AND role = 'ADMIN'::"MemberRole" AND active FOR UPDATE\``. Se o alvo está nessa lista e ela tem 1 linha, `FieldError("role", LAST_ADMIN)`. O `FOR UPDATE` serializa e, no READ COMMITTED, a segunda tx reavalia o filtro e já não vê o Admin rebaixado.

- [ ] **Step 1: Testes que falham** em `tests/members.test.ts`. Preparo pelo dono: org X (ACTIVE, settings), org Y; admins A1 e A2, funcionário F em X; admin O em Y; MASTER M. Sessões de F em X e em Y (vínculo F em Y também). Ctx de tenant montado à mão como em `tests/transactions.test.ts` (`TenantContext` com `organizationId`, `role`, `meta`):
  - `listTeam(ctxA1, X)` → 3 membros com `lastSeenAt` preenchido para F; convite pendente criado pelo dono aparece em `invites`
  - `changeMemberRole(ctxA1, X, vínculoA2, "FUNCIONARIO")` → ok, `member.role_change` com `before.role === "ADMIN"`; rebaixar o agora único A1 → `FieldError` com mensagem `LAST_ADMIN`
  - concorrência: restaurar A2 como ADMIN; `Promise.allSettled([changeMemberRole(ctxA1, X, vA2, "FUNCIONARIO"), changeMemberRole(ctxA2, X, vA1, "FUNCIONARIO")])` → exatamente 1 `fulfilled`, 1 `rejected` com `LAST_ADMIN`; `owner.membership.count({ where: { organizationId: X, role: "ADMIN", active: true } }) === 1`
  - `setMemberActive(false)` no último Admin → `LAST_ADMIN`
  - `setMemberActive(ctxA1, X, vF, false)` → sessão de F em X com `revokedAt`, a de Y intacta; `member.deactivate` auditado; `loadSession(sid de F em X)` → `null` (Review Focus 2; mocks de Task 1)
  - reativar F → `active === true`, `member.reactivate`
  - ctx de F (FUNCIONARIO) chama `changeMemberRole` → `ForbiddenError` + DENIED
  - ctx de O (org Y) chama `changeMemberRole(ctxO, Y, vínculoF_em_X, …)` → `NotFoundError`; e `changeMemberRole(ctxO, X, …)` → `ForbiddenError` (Review Focus 4)
  - `linkUser(M, { organizationId: X, email: O.email, role: "FUNCIONARIO" })` → vínculo criado; `AuditLog` de X `member.create` com `userRole === "MASTER"`; repetir → `FieldError` `ALREADY_MEMBER`; desativar e `linkUser` com `"ADMIN"` → reativado como ADMIN, `member.reactivate`; e-mail inexistente → `USER_NOT_FOUND`; ator USER → `ForbiddenError` + DENIED
- [ ] **Step 2:** `... pnpm vitest run tests/members.test.ts` → FAIL
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS; `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(equipe): vínculos com guarda do último Admin e revogação de sessão`

---

### Task 4: Convites com papel, aceite por quem já tem conta, criação com vínculo direto ⚠️ RISCO (auth/lockout/enumeração — revisão opus)

**Files:**
- Modify: `features/auth/service.ts` (extrair `verifyPassword`)
- Modify: `features/platform/service.ts` (`issueInvite` com papel, `createOrganization`)
- Modify: `features/platform/invitations.ts` (`findInvitation`, `acceptInvitation`, `resendInvitation` delegando)
- Modify: `features/members/service.ts` (`inviteMember`, `revokeInvitation`), `features/members/schemas.ts` (`memberInviteSchema`)
- Modify: `tests/platform.test.ts`, `tests/members.test.ts`

**Interfaces:**
- Consumes: `assertCanManage`, `ALREADY_MEMBER` (Task 3)
- Produces:
  - `verifyPassword(user: { id: string; passwordHash: string; lockedUntil: Date | null }, password: string, actor: Actor): Promise<"ok" | "invalid" | "locked">` reúne o trecho de `verifyCredentials` que hoje vai de "lockedUntil" até o incremento atômico, com os eventos `auth.login_blocked` / `auth.login_failed` / `auth.locked`. `verifyCredentials` passa a chamá-la sem mudar o comportamento, e os testes de `tests/auth.test.ts` continuam verdes.
  - `memberInviteSchema` → `MemberInviteInput = AdminInviteInput & { role: MemberRole }`
  - `issueInvite(tx, actor, organizationId, invite: MemberInviteInput): Promise<string>`. Revoga os convites abertos **do mesmo e-mail na mesma empresa** (`where: { organizationId, email: invite.email, acceptedAt: null, revokedAt: null }`) e grava `role: invite.role`; `after.role` = papel do convite.
  - `inviteMember(actor: MemberActor, organizationId: string, input: MemberInviteInput): Promise<{ inviteUrl: string }>`. `assertCanManage(actor, organizationId, "invitation.create")`. Vínculo **ativo** com o e-mail nessa empresa → `FieldError("email", ALREADY_MEMBER)`. **Nunca** consulta `User` (anti-enumeração).
  - `revokeInvitation(actor: MemberActor, organizationId, invitationId): Promise<void>` audita `invitation.revoke`; convite inexistente/já fechado → `NotFoundError`.
  - `resendInvitation(actor, organizationId, admin)` vira `inviteMember(actor, organizationId, { ...admin, role: "ADMIN" })`, sem a regra "já tem Admin ativo" e sem `EMAIL_TAKEN`. Continua só até a Task 8 removê-la.
  - `findInvitation(...)` → `{ organizationName; name; email; existingUser: boolean } | null`. `existingUser` = existe `User` com o e-mail, `passwordHash` não nulo e sem `anonymizedAt`.
  - `acceptInvitation({ token, password }, meta): Promise<{ ok: true; email: string; existingUser: boolean } | { ok: false; reason: "invalid" | "password" | "locked" }>`:
    - Usuário existe → `verifyPassword(user, password, { userId, userName, role: null, organizationId: null, meta })`. Resultado `invalid` → `{ ok: false, reason: "password" }`; `locked` → `"locked"`. Nos dois casos o convite **não** é consumido.
    - Senão, `password.length < 10` → `{ ok: false, reason: "invalid" }`, e o fluxo atual cria o `User`.
    - Na mesma tx, marcar `acceptedAt` com `updateMany`/`count === 1`, como hoje. Vínculo: nenhum → cria com `inv.role` (`member.create`); inativo → `active: true, role: inv.role` (`member.reactivate`); ativo → inalterado. Sempre `invitation.accept`. Usuário existente: zera `failedLoginCount`/`lockedUntil`.
    - P2002 na criação do `User` (corrida) → `{ ok: false, reason: "invalid" }`.
  - `createOrganization(...)` → `{ organizationId: string; inviteUrl: string | null }`. Sai a pré-checagem `EMAIL_TAKEN`. Dentro da tx: `User` com o e-mail e sem `anonymizedAt` → cria `Membership` ADMIN + `member.create`, sem convite (`inviteUrl: null`). Anonimizado → `FieldError("email", "Este usuário não pode ser vinculado.")`. Senão, convite como hoje com `role: "ADMIN"`.

- [ ] **Step 1: Testes que falham.**

  `tests/platform.test.ts`:
  - **substituir** "e-mail de Admin já existente vira FieldError(email) sem org órfã": e-mail do USER do preparo → `inviteUrl === null`, `Membership` ADMIN ativa para o USER, 0 `Invitation`, `member.create` auditado
  - **ajustar** "acceptInvitation … reenviar é recusado": `resendInvitation` depois do aceite agora devolve `inviteUrl`
  - **ajustar** "e-mail virou User depois do convite": aceitar com a senha do convite → `{ ok: false, reason: "password" }`, `acceptedAt` continua `null`, `failedLoginCount` do usuário = 1, `auth.login_failed` com `entityId` do usuário
  - aceite por usuário existente com a senha atual certa → `{ ok: true, existingUser: true }`, vínculo com o papel do convite, `passwordHash` igual ao de antes
  - 5 senhas erradas no aceite → `reason: "locked"` e `lockedUntil` preenchido
  - vínculo inativo + convite FUNCIONARIO aceito → `active === true`, `role === "FUNCIONARIO"`, `member.reactivate`
  - `findInvitation` → `existingUser` `true`/`false` conforme o caso

  `tests/members.test.ts`:
  - `inviteMember(ctxA1, X, { name, email: novo, role: "FUNCIONARIO" })` e `inviteMember(ctxA1, X, { …, email: O.email /* já é User */ })`: as duas respostas têm as mesmas chaves (`Object.keys(r)` iguais) e `inviteUrl` string; os dois `invitation.create` têm as mesmas chaves em `after` (sem enumeração)
  - convite para o e-mail de F (ativo em X) → `FieldError` `ALREADY_MEMBER`
  - revogação por e-mail: convites abertos para `e1` e `e2` em X e para `e1` em Y; novo convite `e1` em X → só o antigo `e1`/X fica com `revokedAt` (Review Focus 5)
  - aceitar convite FUNCIONARIO de e-mail novo → `User` criado, `Membership` FUNCIONARIO
  - `revokeInvitation` → `revokedAt` + `invitation.revoke`; segunda vez → `NotFoundError`
  - ctx de F → `inviteMember` → `ForbiddenError` + DENIED
- [ ] **Step 2:** `... pnpm vitest run tests/platform.test.ts tests/members.test.ts tests/auth.test.ts` → FAIL nos novos
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS (inclusive `tests/auth.test.ts` intacto); `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(convites): papel no convite, aceite por conta existente e vínculo direto na criação`

---

### Task 5: Lista global de usuários (service)

**Files:**
- Create: `features/platform/users.ts`
- Test: `tests/platform-users.test.ts` (novo)

**Interfaces:**
- Consumes: `assertMaster`, `PlatformActor`
- Produces:
  - `type UserRow = { id: string; name: string; email: string; isMaster: boolean; locked: boolean; lastSeenAt: Date | null; memberships: { id: string; organizationId: string; organizationName: string; role: MemberRole; active: boolean }[] }`
  - `USERS_PAGE_SIZE = 50`
  - `usersFiltersSchema` lê os searchParams `?q=&empresa=&pagina=` e produz `{ q?: string; organizationId?: string; page: number }` (página ≥ 1, padrão 1, `q` com trim e máximo de 100).
  - `listUsers(actor, filters): Promise<{ rows: UserRow[]; total: number }>`. Tudo numa transação `withScope({ platform: true })`. `where`: `q` → `OR` de `name`/`email` `contains` `mode: "insensitive"`; `organizationId` → `memberships: { some: { organizationId } }`. `orderBy: { name: "asc" }`, `skip`/`take`, `include: { memberships: { include: { organization: { select: { name: true } } } } }`, mais `session.groupBy` por `userId` (ids da página) para `lastSeenAt`. `locked = lockedUntil > now`.
  - `getUser(actor, id): Promise<(UserRow & { phone: string | null; createdAt: Date }) | null>`
  - `findUserByEmail(actor, email): Promise<{ name: string } | null>` (só não anonimizados)
  - Todas chamam `assertMaster` (`platform.user_list` / `platform.user_view`).

- [ ] **Step 1: Testes que falham** (preparo pelo dono: org P e dois usuários com nome único `Zeta ${suffix}`, um com vínculo ativo em P e outro com vínculo inativo em P, mais um terceiro sem vínculo):
  - `listUsers(master, { q: suffix, page: 1 })` → 3 linhas; `q` em maiúsculas → mesmo resultado
  - `listUsers(master, { q: suffix, organizationId: P, page: 1 })` → 2 linhas, cada uma com o vínculo em P (`organizationName` preenchido; prova que o RLS foi lido no escopo da plataforma) e o inativo com `active === false`
  - `getUser(master, id)` traz os vínculos; id inexistente → `null`
  - `findUserByEmail(master, EMAIL.toUpperCase().trim())` → `{ name }` (normalizar no service); inexistente → `null`
  - ator USER → `ForbiddenError` + DENIED
  - `usersFiltersSchema.parse({ pagina: "0" })` → `page === 1`
- [ ] **Step 2:** `... pnpm vitest run tests/platform-users.test.ts` → FAIL
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS; `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(plataforma): service da lista global de usuários`

---

### Task 6: Server Actions (equipe, vínculo, troca de empresa, aceite, criação) ⚠️ RISCO leve (actions de sessão — revisão opus junto com Task 2)

**Files:**
- Create: `features/members/actions.ts`
- Modify: `features/platform/actions.ts` (`acceptInvitationAction`, `createOrganizationAction`, `findUserByEmailAction`)
- Modify: `features/platform/schemas.ts` (`acceptExistingInviteSchema`)

**Interfaces:**
- Consumes: Tasks 2–5; `toFormState`, `plainValues` (`lib/form-state.ts`); `requireTenant`, `getCurrentSession`; `platformActor`
- Produces (`"use server"`, todas devolvem `FormState` de `lib/form-state.ts` ou `FormState & { inviteUrl?: string }`):
  - Resolução do ator: helper interno `memberActor(organizationId: string | null)`. Com `null`, usa `requireTenant()` e a empresa da sessão. Com string, usa `platformActor()`, e a autorização real fica no service (`assertCanManage`).
  - `inviteMemberAction(organizationId: string | null, prev, fd)`: campos `name`, `email`, `phone`, `role` → `{ ok: true, inviteUrl }`
  - `changeMemberRoleAction(organizationId: string | null, membershipId: string, role: string)`; `setMemberActiveAction(organizationId: string | null, membershipId: string, active: boolean)`; `revokeInvitationAction(organizationId: string | null, invitationId: string)`. Argumentos validados em runtime com zod (`roleSchema`, `z.boolean()`, `z.string().min(1)`).
  - `linkUserAction(prev, fd)`: campos `organizationId`, `email`, `role`
  - `switchOrganizationAction(organizationId: string)`: monta o `SessionActor` com `getCurrentSession()` (sem sessão → `redirect("/login")`) e faz `redirect("/inicio")` no sucesso; `ForbiddenError` → `{ error }`
  - `leaveOrganizationAction()` → `redirect("/plataforma")`
  - `findUserByEmailAction(email: string): Promise<{ name: string } | null>` (MASTER; e-mail inválido → `null`)
  - `revalidatePath`: `/configuracoes/equipe`, `/plataforma/empresas/${id}`, `/plataforma/usuarios` conforme o caso
  - `acceptInvitationAction`: `fd.has("confirm")` → `acceptInviteSchema`; senão `acceptExistingInviteSchema = { token: min(1), password: min(1, "Informe sua senha.") }`. `reason: "password"` → `fieldErrors.password = "Senha incorreta."`; `"locked"` → a mensagem de bloqueio do login; `"invalid"` → a mensagem atual. Sucesso → `redirect(\`/login?convite=${existingUser ? "vinculado" : "aceito"}&email=…\`)`.
  - `createOrganizationAction`: com `inviteUrl === null`, não grava o flash e faz `redirect(\`/plataforma/empresas/${id}?vinculado=1\`)`.
- Comentário de contrato de campos no topo de `features/members/actions.ts`, como nos outros `actions.ts`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm vitest run` (com TEST_*) → verdes
- [ ] **Step 3:** não commitar; propor `feat(equipe): server actions de equipe, vínculo e troca de empresa`

(Sem teste dedicado: as actions são finas e a regra está nas Tasks 2–5. A validação fica na Task 11.)

---

### Task 7: Shell — seletor de empresa, faixa do MASTER, link Equipe, header da plataforma

Antes: invocar `/frontend-design`.

**Files:**
- Create: `components/organisms/OrgSwitcher/` (`index.tsx`, `OrgSwitcher.types.ts`)
- Create: `components/organisms/MasterBanner/` (`index.tsx`, `MasterBanner.types.ts`)
- Modify: `components/organisms/AppNavigation/` (prop `showTeam`; item "Equipe" `/configuracoes/equipe` com ícone `UsersRound` no dropdown "Empresa" e na gaveta)
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(plataforma)/layout.tsx` (nav "Empresas" `/plataforma` | "Usuários" `/plataforma/usuarios`; `OrgSwitcher` com label "Entrar em empresa")
- Modify: `app/(plataforma)/plataforma/empresas/[id]/page.tsx` (botão "Entrar na empresa" → `switchOrganizationAction.bind(null, id)`; desabilitado com dica "Reative a empresa para entrar." quando não ACTIVE)

**Interfaces:**
- Consumes: `listOrganizationOptions`, `switchOrganizationAction`, `leaveOrganizationAction` (Tasks 2, 6); `session.actingAsMaster` (Task 1)
- Produces:
  - `OrgSwitcherProps = { options: { id: string; name: string }[]; currentId: string | null; label: string; switchAction: (organizationId: string) => Promise<{ error?: string }> }`. Dropdown (`AppDropdownMenu`) com a empresa atual marcada e um campo de busca local quando há mais de 8 opções. Ao escolher, chama a action dentro de `useTransition`, chama `startNavigationProgress("/inicio")` e mostra o erro em `toast.error`. Não renderiza nada com menos de 2 opções quando `currentId` existe (header da empresa); no header da plataforma, renderiza com 1+.
  - `MasterBannerProps = { organizationName: string; actingAsMaster: boolean; leaveAction: () => Promise<void> }`. Faixa `bg-warning-soft text-warning` logo abaixo do header (slot `banner`), sempre visível, com `role="status"`. Texto: "Você está como MASTER em {org}" quando `actingAsMaster`, senão "{org}". Botão "Voltar à plataforma" (form com a action e spinner via `useFormStatus`). Ver Pendência 1.
- `app/(app)/layout.tsx`: `options = await listOrganizationOptions(...)`; `brand` = `OrgHeader` + `OrgSwitcher` (`label` "Trocar empresa"); `banner` = `MasterBanner` se `session.user.isMaster`; `roleLabel` = `"MASTER"` quando `actingAsMaster`; `showTeam={can(role, "member.manage")}`.

- [ ] **Step 1:** Invocar `/frontend-design`; implementar.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes
- [ ] **Step 3:** Preview rápido: `pnpm dev` + agent-browser em 1280px e 390px. MASTER entra em uma empresa e vê a faixa; "Voltar à plataforma" funciona; o seletor aparece só com 2+ empresas.
- [ ] **Step 4:** não commitar; propor `feat(shell): seletor de empresa e faixa do MASTER`

---

### Task 8: Telas de equipe (Admin) e seção "Pessoas" (MASTER)

Antes: invocar `/frontend-design` e `/ui-ux-pro-max` (tela nova com tabela e diálogos).

**Files:**
- Create: `components/molecules/InviteLink/` (extraído do `InviteCard`: aviso "Copie agora…", input readonly, Copiar e WhatsApp `https://wa.me/55${digits}?text=…`; props `{ url: string; phone: string | null }`)
- Create: `components/organisms/TeamManager/` (`index.tsx`, `TeamManager.types.ts`, e `MemberInviteDialog.tsx` se passar de ~250 linhas)
- Create: `app/(app)/configuracoes/equipe/page.tsx` + `loading.tsx`
- Modify: `app/(app)/configuracoes/page.tsx` (link "Equipe" — "Convide pessoas e defina papéis.")
- Modify: `app/(plataforma)/plataforma/empresas/[id]/page.tsx` (troca `InviteCard` por `TeamManager` com `linkAction`; lê o flash como hoje e passa `flashUrl`; `?vinculado=1` → aviso "Usuário já cadastrado: vinculado como Admin.")
- Delete: `components/organisms/InviteCard/`. Remover `resendInvitation` (`features/platform/invitations.ts`) e `resendInvitationAction` (`features/platform/actions.ts`), e os testes de `resendInvitation` em `tests/platform.test.ts` passam para `inviteMember` (mesmas asserções).

**Interfaces:**
- Consumes: `listTeam`, `MemberRow`, `PendingInviteRow` (Task 3); actions da Task 6 com `organizationId` já vinculado (`null` no Admin, `id` no MASTER)
- Produces: `TeamManagerProps = { members: MemberRow[]; invites: PendingInviteRow[]; currentUserId: string; flashUrl?: string | null; consumeFlash?: () => Promise<void>; inviteAction: (prev: FormState & { inviteUrl?: string }, fd: FormData) => Promise<FormState & { inviteUrl?: string }>; changeRoleAction: (membershipId: string, role: "ADMIN" | "FUNCIONARIO") => Promise<FormState>; setActiveAction: (membershipId: string, active: boolean) => Promise<FormState>; revokeInviteAction: (invitationId: string) => Promise<FormState>; linkAction?: (prev: FormState, fd: FormData) => Promise<FormState>; organizationId?: string }`. Os tipos ficam em `TeamManager.types.ts`, sem importar `features/`: as linhas são redeclaradas estruturalmente ou importadas via `type` de `@/generated/prisma/enums` só para `MemberRole`.
- Comportamento:
  - tabela ≥md e cartões <md: nome, e-mail, papel (`ROLE_LABELS` passado já formatado pela page ou mapa local), status (`StatusBadge`), último acesso (`formatDateTime`, ou "Nunca")
  - menu por linha: "Tornar Admin" / "Tornar Funcionário" e "Desativar acesso" / "Reativar acesso", via `ConfirmAction` com `withReason={false}`. A desativação usa `danger` e a descrição "{nome} perde o acesso a esta empresa agora."
  - na própria linha: o selo "Você", e as ações continuam liberadas (a guarda do último Admin vem do servidor)
  - convites pendentes: nome, e-mail, papel, "expira em". Ações: "Gerar novo link" (chama `inviteAction` com os mesmos dados e mostra `InviteLink`) e "Revogar" (`ConfirmAction`)
  - "Convidar pessoa" abre Dialog (desktop) ou Drawer (mobile) com nome, e-mail, telefone (opcional) e papel (`AppSelect`: Admin/Funcionário, padrão Funcionário). Em caso de sucesso, troca o formulário pelo `InviteLink`. A mensagem é sempre "Convite gerado." (sem enumeração).
  - com `linkAction`: botão "Vincular usuário existente" (Dialog/Drawer: e-mail + papel; hidden `organizationId`)
- `/configuracoes/equipe`: `requireTenant()`; sem `member.manage` → `AdminOnlyNotice`; senão, `listTeam(ctx, ctx.organizationId)`.

- [ ] **Step 1:** Invocar as skills; implementar.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes; `... pnpm vitest run tests/platform.test.ts` → verde (testes migrados)
- [ ] **Step 3:** Preview com agent-browser (1280px/390px): Admin convida um Funcionário, copia o link, troca o papel de alguém, tenta rebaixar o último Admin (toast `LAST_ADMIN`). MASTER usa "Vincular usuário existente".
- [ ] **Step 4:** não commitar; propor `feat(equipe): tela de equipe do Admin e pessoas da empresa no painel`

---

### Task 9: Aceite por conta existente, aviso na criação, avisos do login

Antes: invocar `/frontend-design`.

**Files:**
- Modify: `components/organisms/AcceptInviteForm/` (prop `existingUser: boolean`: com `true`, mostra só "Sua senha atual" (`autoComplete="current-password"`) e o botão "Entrar na empresa", sem `confirm`)
- Modify: `app/(auth)/convite/[token]/page.tsx` (subtitle no caso existente: "{empresa} · {email}. Você já tem conta: confirme sua senha para entrar nesta empresa.")
- Modify: `components/organisms/OrganizationForm/` (prop opcional `lookupEmail?: (email: string) => Promise<{ name: string } | null>`; no blur de `admin.email` com e-mail válido, mostra a dica `text-warning` "Usuário já cadastrado ({nome}): será vinculado como Admin, sem convite.")
- Modify: `app/(plataforma)/plataforma/empresas/nova/page.tsx` (passa `findUserByEmailAction`)
- Modify: `app/(auth)/login/page.tsx` + `components/organisms/LoginForm` (`convite=vinculado` → "Acesso liberado. Entre com seu e-mail e senha.")

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes; `pnpm vitest run components/organisms/OrganizationForm` → verde
- [ ] **Step 3:** não commitar; propor `feat(convites): aceite por conta existente e aviso de vínculo na criação`

---

### Task 10: Telas de usuários da plataforma

Antes: invocar `/frontend-design` e `/ui-ux-pro-max`.

**Files:**
- Create: `components/organisms/UserList/` (tabela ≥md e cartões <md; busca por nome/e-mail e select de empresa escrevendo na URL `?q=&empresa=&pagina=` com debounce de 300ms na busca; paginação; selos "MASTER" e "Bloqueado"; empresas como chips "Empresa · Papel", inativo riscado/atenuado; linha leva a `/plataforma/usuarios/[id]`)
- Create: `components/organisms/UserMemberships/` (vínculos do usuário com trocar papel/desativar/reativar por `ConfirmAction` + "Vincular a uma empresa": Dialog/Drawer com select de empresa (orgs ACTIVE e SUSPENDED, sem as já vinculadas ativas) + papel; usa `linkUserAction` com o e-mail do usuário em hidden)
- Create: `app/(plataforma)/plataforma/usuarios/page.tsx` + `loading.tsx`, `app/(plataforma)/plataforma/usuarios/[id]/page.tsx` + `loading.tsx`

**Interfaces:**
- Consumes: `listUsers`, `getUser`, `usersFiltersSchema`, `USERS_PAGE_SIZE` (Task 5); `listOrganizations` (empresas do filtro e do vínculo); `changeMemberRoleAction`/`setMemberActiveAction` vinculados ao `organizationId` de cada vínculo; `linkUserAction`
- Páginas chamam `requireMaster()`; `[id]` inexistente → `notFound()`. Lista vazia → `EmptyState` "Nenhum usuário encontrado.".

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes
- [ ] **Step 3:** não commitar; propor `feat(plataforma): telas de usuários e vínculos`

---

### Task 11: Validação ponta a ponta + mapa do código

- [ ] **Step 1:** `source ~/.nvm/nvm.sh && nvm use 22.16.0 >/dev/null && set -a && source .env && set +a && TEST_DATABASE_URL="$DATABASE_URL" TEST_DIRECT_URL="$DIRECT_URL" pnpm vitest run` → tudo verde
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes
- [ ] **Step 3: senha conhecida no dev.** Script **descartável no scratchpad** (não versionar), rodado com `pnpm tsx --env-file=.env <script>`: cliente Prisma com `DIRECT_URL` + `hashPassword` atualiza `admin.demo@beedock.local` (empresa `prime-studio-demo`) e o MASTER do `.env` com senhas de teste conhecidas, além de zerar `failedLoginCount`/`lockedUntil`. Registrar no relatório quais contas foram alteradas.
- [ ] **Step 4:** `pnpm dev` (http://localhost:3004) + `pnpm dlx agent-browser@0.39.1` em 1280px e 390px, screenshots em `docs/screenshots/usuarios-*`:
  1. Admin demo → Empresa ▸ Equipe → convida Funcionário com e-mail novo → copia o link → aba anônima: cria a senha → login → `/inicio` como Funcionário (sem Equipe no menu; `/configuracoes/equipe` mostra o aviso)
  2. Admin convida o e-mail do Funcionário em **outra** empresa (pelo MASTER) → link pede a senha atual → senha errada mostra "Senha incorreta." → senha certa → login → seletor "Trocar empresa" com 2 empresas → troca → logout/login cai na última usada
  3. Admin tenta rebaixar a si mesmo sendo o único Admin → toast `LAST_ADMIN`; desativa o Funcionário → a aba do Funcionário cai no login na próxima navegação
  4. MASTER → `/plataforma/usuarios` (busca, filtro por empresa, detalhe) → vincula usuário existente → empresa ▸ "Entrar na empresa" → faixa "Você está como MASTER…" → cria um lançamento → "Voltar à plataforma"; tentar entrar em empresa suspensa → botão desabilitado
  5. Criar empresa com e-mail de Admin já cadastrado → dica no blur → salvar → aviso "vinculado como Admin"
- [ ] **Step 5:** Auditoria: via dono, conferir que o lançamento do passo 4 tem `userRole = 'MASTER'` e que há `platform.org_enter`/`platform.org_leave`/`auth.switch_org`; `pnpm audit:verify` → só os 5 eventos legados conhecidos falham.
- [ ] **Step 6:** Atualizar `docs/CODEBASE_MAP.md` nas seções afetadas:
  - Directory Structure (`features/members/`, rotas `/configuracoes/equipe` e `/plataforma/usuarios`)
  - Module Guide (`lib/session.ts` com `loadSession`/`toTenantContext`/`actingAsMaster`; `lib/audit.ts` com `auditRole`; `features/members/*`; `features/platform/users.ts`; organisms novos `OrgSwitcher`, `MasterBanner`, `TeamManager`, `UserList`, `UserMemberships`; molecule `InviteLink`; `InviteCard` removido)
  - Data Flow (login na última empresa; troca de empresa)
  - Gotchas: remover "Login usa a membership mais antiga", "MASTER … não entra em (app)" e "Convite só emite ADMIN"; adicionar a guarda do último Admin com `FOR UPDATE` e "MASTER sem vínculo = ADMIN efetivo + auditoria MASTER"
  - `last_mapped`
- [ ] **Step 7:** Code review com code-reviewer-agent (opus) da demanda inteira, com foco nas Tasks 1–4 e 6; corrigir os críticos.
- [ ] **Step 8:** não commitar; propor a mensagem final de commit (ou uma por task, se o usuário preferir commits separados).

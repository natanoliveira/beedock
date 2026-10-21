# Fase 2a — Seed MASTER + módulo de empresas · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/plataforma` no painel de empresas do MASTER (criar, editar, listar, convidar Admin, suspender/reativar) com convite por link e seed do MASTER pelo `.env`.

**Architecture:** Regras em `features/platform/` (schemas Zod → service com ator explícito e `assertMaster` → Server Actions finas). Toda escrita em `withScope` com auditoria na mesma transação. Páginas App Router no route group `(plataforma)` + página pública `/convite/[token]`.

**Tech Stack:** Next 16.4 (App Router, Server Actions), Prisma 7.10 + adapter Neon, Auth.js v5, Zod 4, Vitest 5, Tailwind 4 + shadcn (radix-nova) + Kibo UI Dropzone, `@vercel/blob`.

**Spec:** `docs/superpowers/specs/2026-10-21-plataforma-empresas-design.md` — ler junto; o plano não repete o que a spec já fixa (campos, mensagens, eventos de auditoria).

## Global Constraints

- Node 22: `source ~/.nvm/nvm.sh && nvm use 22.16.0` antes de qualquer `pnpm`.
- Next 16.4: ler `node_modules/next/dist/docs/` antes de usar API de rotas/params/actions; `cacheComponents` segue desligado.
- RLS: app usa `DATABASE_URL` (papel `beedock_app`); toda leitura/escrita de `Invitation`/`OrganizationSettings` dentro de `withScope`. Busca sem empresa conhecida → `withScope({ platform: true })`.
- Toda escrita audita na mesma transação (`appendAudit` dentro do `withScope`). Nenhum token, hash ou senha em `after`/`before`/logs.
- Senha: mínimo 10 caracteres (mesma regra de `scripts/cli.ts#askPassword`), hash com `hashPassword` (`features/auth/service.ts`).
- Convite: token = `randomBytes(32).toString("base64url")`; banco guarda `sha256(token)` hex; validade 48h.
- Textos em pt-BR. Mobile-first: `<md` cards/Drawer, `≥md` tabela/Dialog. Design system "Colmeia & Doca".
- **Git:** nenhum agente executa `git add/commit/push/branch`. No fim de cada task, apenas propor a mensagem (conventional commits, sem menção a IA). O usuário commita.
- Testes de integração seguem o padrão de `tests/isolation.test.ts` (`describe.skipIf(!TEST_DATABASE_URL || !TEST_DIRECT_URL)`, cliente dono para preparo/limpeza, imports dinâmicos após setar env).

## Review Focus

1. **Duplo clique / submit concorrente na criação** — slug ou e-mail repetido por corrida deve virar erro de campo, não 500. Teste: Task 3, `createOrganization` com slug já usado → `SlugTakenError` também quando a checagem prévia passa e o unique estoura (P2002).
2. **Aceite do mesmo convite em duas abas** — só um vence; o segundo vê "convite inválido". Teste: Task 4, dois `acceptInvitation` em `Promise.all` → exatamente um ok.
3. **Convite de empresa suspensa** — aceitar deve falhar com mensagem genérica. Teste: Task 5.
4. **E-mail com maiúsculas/espaços** — `" Ana@X.com "` e `ana@x.com` são o mesmo usuário. Teste: Task 1 (schema normaliza) + Task 4 (aceite recusa e-mail já existente com caixa diferente).
5. **CPF/CNPJ com máscara e dígitos repetidos** — `123.456.789-09` válido salvo como dígitos; `111.111.111-11` inválido. Teste: Task 1.

---

### Task 1: Validadores e schemas

**Files:**
- Create: `lib/document.ts`, `lib/document.test.ts`
- Create: `features/platform/schemas.ts`, `features/platform/schemas.test.ts`

**Interfaces:**
- Produces:
  - `onlyDigits(v: string): string`
  - `isValidCpf(v: string): boolean`, `isValidCnpj(v: string): boolean`, `isValidDocument(v: string): boolean` (11 dígitos → CPF, 14 → CNPJ, outro → false)
  - `slugify(name: string): string` — minúsculas, sem acento (`normalize("NFD")`), não-alfanumérico → `-`, sem hífen duplo/nas pontas, corta em 40
  - `organizationSchema` (z.object) → tipo `OrganizationInput`: `{ name, legalName?, document?, slug, phone?, email?, zipCode?, street?, number?, complement?, district?, city?, state?, pixKey?, primaryColor, settings: { monthStartDay, timezone, sessionIdleMinutes, customerRetentionMonths, dpoName?, dpoEmail?, dpoPhone? } }`. Strings vazias viram `undefined`; `document`, `phone`, `zipCode`, `dpoPhone` saem só com dígitos.
  - `adminInviteSchema` → `AdminInviteInput`: `{ name, email, phone? }`, e-mail `trim().toLowerCase()`
  - `acceptInviteSchema` → `{ token: string; password: string; confirm: string }`, senha ≥ 10, `confirm === password` (erro em `confirm`: "As senhas não conferem.")
  - `formDataToObject(fd: FormData): Record<string, unknown>` — aceita chaves `settings.x` aninhando em `settings`

- [ ] **Step 1: Testes que falham** — `lib/document.test.ts`:
  - `isValidCpf("123.456.789-09")` true; `isValidCpf("111.111.111-11")` false; `isValidCpf("123.456.789-00")` false
  - `isValidCnpj("11.222.333/0001-81")` true; `isValidCnpj("00.000.000/0000-00")` false; `isValidCnpj("11.222.333/0001-80")` false
  - `isValidDocument("1234")` false
  - `slugify("Prime Studio - Uniformes")` = `"prime-studio-uniformes"`; `slugify("Café & Cia")` = `"cafe-cia"`

  `features/platform/schemas.test.ts`:
  - slug `"ab"` e `"Prime"` rejeitados; `"prime-studio"` aceito
  - `primaryColor` `"#F5A400"` aceito, `"amarelo"` rejeitado
  - `document: "111.111.111-11"` rejeitado com mensagem "CPF ou CNPJ inválido."; `"123.456.789-09"` → `"12345678909"`
  - `phone: "(86) 99999-0000"` → `"86999990000"`; `"123"` rejeitado
  - `zipCode: "64000-000"` → `"64000000"`
  - `settings.monthStartDay` 0 e 29 rejeitados, 28 aceito
  - `adminInviteSchema` `email: " Ana@X.com "` → `"ana@x.com"`
  - `acceptInviteSchema` senha de 9 chars rejeitada; confirm diferente rejeitado
- [ ] **Step 2:** `pnpm vitest run lib/document.test.ts features/platform/schemas.test.ts` → FAIL (módulos inexistentes)
- [ ] **Step 3:** Implementar. CPF/CNPJ: algoritmo padrão de dígitos verificadores (mód. 11), rejeitar todos os dígitos iguais. Defaults de `settings` iguais aos do `schema.prisma` (1, `"America/Fortaleza"`, 60, 24).
- [ ] **Step 4:** Mesmo comando → PASS
- [ ] **Step 5:** Propor commit `feat(platform): validadores de documento e schemas de empresa`

---

### Task 2: Env opcional do Blob + seed do MASTER

**Files:**
- Modify: `lib/env.ts` (BLOB_READ_WRITE_TOKEN → `.optional()`), `.env.example`
- Create: `features/platform/seed-master.ts`, `features/platform/seed-master.test.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces:
  - `readMasterSeed(env: Record<string, string | undefined>): { name: string; email: string; password: string } | null` — `null` se as três variáveis `SEED_MASTER_NAME/EMAIL/PASSWORD` estiverem vazias; lança se só parte delas existir; em `env.NODE_ENV === "production"` lança `"SEED_MASTER_PASSWORD precisa ter 10+ caracteres"` se < 10; em dev retorna e faz `console.warn` se < 10. E-mail em minúsculas.
  - `seedMaster(tx: Tx, input): Promise<"created" | "promoted" | "unchanged">` — existe com MASTER → `unchanged`; existe sem MASTER → atualiza só `platformRole` → `promoted`; não existe → cria com `hashPassword` → `created`. Em `created`/`promoted` audita `platform.master_seed` via `appendAudit(tx, scriptActor("seed"), …)` com `after: { name, email, platformRole: "MASTER" }`.

- [ ] **Step 1: Testes que falham** (`seed-master.test.ts`, unit, só `readMasterSeed`):
  - todas vazias → `null`
  - só e-mail definido → throws
  - produção + senha `"admin123"` → throws com a mensagem acima
  - dev + `"admin123"` → retorna objeto, `console.warn` chamado (spy)
  - `"Admin@X.com"` → `"admin@x.com"`
- [ ] **Step 2:** `pnpm vitest run features/platform/seed-master.test.ts` → FAIL
- [ ] **Step 3:** Implementar ambos; em `prisma/seed.ts`, antes do loop de empresas: `const master = readMasterSeed(process.env)`; se null, `console.log("- MASTER: SEED_MASTER_* ausentes, pulando")`; senão `db.$transaction(tx => seedMaster(tx, master))` com o cliente dono e log do resultado. `.env.example` ganha as 3 chaves vazias com comentário; comentário do BLOB diz "opcional: sem ele o upload de logo fica indisponível".
- [ ] **Step 4:** Teste → PASS; `pnpm db:seed` duas vezes → 1ª `created` (ou `promoted`/`unchanged`), 2ª `unchanged`; `pnpm audit:verify` sem quebra nova (só os 5 legados conhecidos).
- [ ] **Step 5:** Propor commit `feat(platform): seed do MASTER pelo .env`

---

### Task 3: Service de empresas (criar, editar, listar) + assertMaster

**Files:**
- Modify: `features/organizations/defaults.ts` (3º parâmetro)
- Create: `features/platform/service.ts`, `features/platform/errors.ts`
- Create: `tests/platform.test.ts`

**Interfaces:**
- Consumes: `OrganizationInput`, `AdminInviteInput` (Task 1); `appendAudit`, `recordAudit`, `Actor` (`lib/audit.ts`); `withScope` (`lib/db.ts`); `ForbiddenError` (`lib/permissions.ts`)
- Produces:
  - `seedOrganizationDefaults(tx, organizationId, settings?: Partial<OrganizationSettingsData>)`
  - `type PlatformActor = Actor & { userId: string; userName: string; isMaster: boolean }`
  - `assertMaster(actor: PlatformActor, action: string): Promise<void>` — não-MASTER → `recordAudit(actor, { action, result: "DENIED" })` + `throw new ForbiddenError()`
  - `errors.ts`: `class FieldError extends Error { field: string }`; mensagens: slug → "Este endereço já está em uso."; e-mail → "Este e-mail já tem conta na plataforma."
  - `createOrganization(actor, org: OrganizationInput, admin: AdminInviteInput): Promise<{ organizationId: string; inviteUrl: string }>`
  - `updateOrganization(actor, id: string, org: OrganizationInput): Promise<void>` — audita `platform.organization_update` com `diff(before, after)`
  - `listOrganizations(actor): Promise<OrganizationRow[]>` com `OrganizationRow = { id, name, slug, status, activeUsers: number, lastSeenAt: Date | null, pendingInvite: { expiresAt: Date } | null, admin: { name: string; email: string } | null }`
  - `getOrganization(actor, id): Promise<(OrganizationInput & { id, status, logoUrl }) | null>`
  - `issueInvite(tx: Tx, actor, organizationId, admin): Promise<string>` (interno, reusado na Task 4) — revoga pendentes ADMIN da org, cria `Invitation`, audita `invitation.create` com `after: { name, email, role }`, retorna URL `${env.AUTH_URL}/convite/${token}`

Ator da auditoria na cadeia da empresa: `{ ...actor, organizationId: novoId }`. `createOrganization` pré-gera o id com `crypto.randomUUID()` (coluna é `String`; sem dependência nova).

- [ ] **Step 1: Testes de integração que falham** (`tests/platform.test.ts`; preparo cria via cliente dono um usuário MASTER e um USER; limpeza remove orgs/usuários/convites criados pelo `suffix`):
  - `createOrganization` cria org + settings com `monthStartDay` informado + categorias/métodos/tipos padrão + 1 `Invitation` pendente; auditoria da org tem `platform.organization_create` e `invitation.create`; nenhum `AuditLog.after` contém o token (busca pelo token em `JSON.stringify(after)`)
  - `inviteUrl` termina com token cujo `sha256` é o `tokenHash` gravado
  - slug repetido → `FieldError` com `field === "slug"`; slug novo mas concorrente: dois `createOrganization` com mesmo slug em `Promise.all` → um ok, outro `FieldError("slug")` (Review Focus 1)
  - e-mail de Admin que já é `User` → `FieldError("email")`
  - falha no meio (ex.: e-mail duplicado detectado dentro da tx) não deixa org órfã: `owner.organization.count({ where: { slug } }) === 0`
  - ator USER chamando `createOrganization` → `ForbiddenError` + `AuditLog` com `result: "DENIED"` e `userId` do USER
  - `updateOrganization` muda `name` e audita `platform.organization_update` com `before.name`/`after.name`
  - `listOrganizations` retorna `activeUsers`, `pendingInvite` e `lastSeenAt` coerentes com dados preparados
- [ ] **Step 2:** `pnpm vitest run tests/platform.test.ts` (com `TEST_*` setados) → FAIL
- [ ] **Step 3:** Implementar. Criação: tudo num único `withScope({ organizationId: novoId })`. Unicidade: checar antes e também mapear `PrismaClientKnownRequestError` código `P2002` no alvo `slug` → `FieldError("slug")`. Lista: uma consulta por agregado (`membership.groupBy`, `session.groupBy` com `_max.lastSeenAt`, convites pendentes em `withScope({ platform: true })`), sem N+1.
- [ ] **Step 4:** Mesmo comando → PASS; `pnpm vitest run` (suíte toda) → PASS
- [ ] **Step 5:** Propor commit `feat(platform): service de empresas com auditoria e assertMaster`

---

### Task 4: Convites (reenviar, buscar, aceitar, rate limit)

**Files:**
- Create: `features/platform/invitations.ts`
- Modify: `tests/platform.test.ts`

**Interfaces:**
- Consumes: `issueInvite`, `assertMaster`, `PlatformActor`, `FieldError` (Task 3); `hashPassword`
- Produces:
  - `hashToken(token: string): string` (sha256 hex)
  - `resendInvitation(actor, organizationId, admin: AdminInviteInput): Promise<{ inviteUrl: string }>` — recusa com `FieldError("email", "Esta empresa já tem um Admin ativo.")` se houver Membership ADMIN ativa; e-mail já `User` → `FieldError("email")`
  - `findInvitation(token: string, meta: RequestMeta): Promise<{ organizationName: string; name: string; email: string } | null>` — `null` para inexistente/expirado/revogado/aceito/empresa não-ACTIVE/IP bloqueado; nos casos inválidos (exceto IP bloqueado) audita `invitation.invalid` FAILED na cadeia da plataforma com `meta.ip`
  - `acceptInvitation(input: { token; password }, meta): Promise<{ ok: true; email: string } | { ok: false }>` — na mesma transação: marca `acceptedAt` com `updateMany({ where: { id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } })` e só segue se `count === 1` (Review Focus 2); cria `User` + `Membership` ADMIN; audita `invitation.accept` e `member.create` na cadeia da empresa
  - Rate limit: `INVITE_IP_WINDOW_MINUTES = 15`, `INVITE_IP_MAX_FAILURES = 20`, contando `invitation.invalid` por IP como `ipBlocked` em `features/auth/service.ts`

- [ ] **Step 1: Testes que falham** (em `tests/platform.test.ts`):
  - `resendInvitation` revoga o convite anterior (`revokedAt` preenchido) e cria novo com o e-mail corrigido
  - `findInvitation` com token válido → dados; com token expirado (ajustado via dono), revogado, aceito e inexistente → `null`, e cada um gera `invitation.invalid` FAILED
  - `acceptInvitation` cria `User` sem `platformRole` MASTER, `Membership` ADMIN ativa e marca `acceptedAt`; segunda chamada → `{ ok: false }`
  - aceite concorrente: dois `acceptInvitation` em `Promise.all` → exatamente um `ok: true`; só 1 `User` com o e-mail
  - após aceite, `resendInvitation` → `FieldError` "Esta empresa já tem um Admin ativo."
  - e-mail do convite criado como `User` (com caixa diferente) depois do convite → `acceptInvitation` → `{ ok: false }` (Review Focus 4)
  - com 20 `invitation.invalid` do mesmo IP preparados, `findInvitation(tokenValido)` → `null` e não grava novo evento
- [ ] **Step 2:** `pnpm vitest run tests/platform.test.ts` → FAIL nos novos
- [ ] **Step 3:** Implementar. Busca por `tokenHash` em `withScope({ platform: true })`; escrita do aceite em `withScope({ organizationId })` do convite encontrado.
- [ ] **Step 4:** → PASS
- [ ] **Step 5:** Propor commit `feat(platform): convite do Admin com aceite e rate limit`

---

### Task 5: Suspender / reativar

**Files:**
- Modify: `features/platform/service.ts`, `tests/platform.test.ts`

**Interfaces:**
- Produces: `setOrganizationStatus(actor, id: string, status: "ACTIVE" | "SUSPENDED", reason?: string): Promise<void>` — SUSPENDED: atualiza status e `session.updateMany({ where: { organizationId: id, revokedAt: null }, data: { revokedAt: now } })` na mesma tx; audita `platform.organization_suspend` / `platform.organization_reactivate` com `reason`

- [ ] **Step 1: Testes que falham:**
  - suspender revoga todas as sessões abertas da org (preparar 2 `Session` via dono) e audita com `reason`
  - após suspender, `findInvitation(token pendente)` → `null` (Review Focus 3)
  - após suspender, `verifyCredentials` do Admin da org → `{ ok: false, reason: "inactive" }` (ou o motivo que o código atual devolve para usuário sem membership ativa — verificar e fixar no teste)
  - reativar → `status === "ACTIVE"`, sessões continuam revogadas, evento `_reactivate`
  - USER chamando → `ForbiddenError` + DENIED
- [ ] **Step 2:** → FAIL
- [ ] **Step 3:** Implementar
- [ ] **Step 4:** → PASS
- [ ] **Step 5:** Propor commit `feat(platform): suspensão e reativação de empresa`

---

### Task 6: Server Actions + upload de logo

**Files:**
- Create: `features/platform/actions.ts`, `features/platform/logo.ts`
- Modify: `package.json` (`pnpm add @vercel/blob`)

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 5
- Produces (todas `"use server"`, estado para `useActionState`):
  - `type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; inviteUrl?: string; values?: Record<string, unknown> }`
  - `createOrganizationAction(prev: FormState, fd: FormData): Promise<FormState>` — o link do convite **não** pode ir na URL (histórico/logs). No sucesso, grava o link num cookie httpOnly de curta duração (`invite-flash`, 5 min, `path=/plataforma/empresas/${id}`) e faz `redirect(\`/plataforma/empresas/${id}\`)`; a página lê e apaga o cookie.
  - `updateOrganizationAction(id: string, prev, fd)`
  - `resendInvitationAction(organizationId: string, prev, fd)` → `{ ok, inviteUrl }`
  - `setOrganizationStatusAction(id: string, status, reason?: string)` + `revalidatePath`
  - `acceptInvitationAction(prev, fd)` → sucesso `redirect("/login?convite=aceito&email=" + encodeURIComponent(email))`; falha → `{ error: "Convite inválido ou expirado. Peça um novo ao suporte." }`
  - `logo.ts`: `logoUploadEnabled(): boolean` (`!!env.BLOB_READ_WRITE_TOKEN`); `uploadLogoAction(organizationId: string, fd: FormData): Promise<{ url?: string; error?: string }>` — `assertMaster`; MIME ∈ `image/png|image/jpeg|image/webp`, tamanho ≤ 1_048_576; `put(\`org/${id}/logo-${Date.now()}.webp\`, file, { access: "public" })`; atualiza `logoUrl` com auditoria `platform.organization_update` (`before/after.logoUrl`)
  - Ator: helper `platformActor(): Promise<PlatformActor>` em `actions.ts` a partir de `getCurrentSession()` + `requestMeta(await headers())`; sem sessão → `redirect("/login")`

Mapeamento de erros: `ZodError` → `fieldErrors` (primeira mensagem por caminho); `FieldError` → `fieldErrors[field]`; `ForbiddenError` → `error`; demais re-lança.

- [ ] **Step 1:** `pnpm add @vercel/blob`; implementar actions e logo.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → sem erros
- [ ] **Step 3:** Propor commit `feat(platform): server actions do painel e upload de logo`

(Sem teste dedicado: a lógica está no service, coberta nas Tasks 3–5; as actions são finas e validadas na Task 9.)

---

### Task 7: UI do painel (/plataforma, nova, editar)

Antes: invocar `/frontend-design` e `/ui-ux-pro-max` (página nova complexa).

**Files:**
- Create: `app/(plataforma)/layout.tsx` (header MASTER: nome + Sair; `requireMaster()`)
- Modify: `app/(plataforma)/plataforma/page.tsx` (lista)
- Create: `app/(plataforma)/plataforma/empresas/nova/page.tsx`, `app/(plataforma)/plataforma/empresas/[id]/page.tsx`
- Create: `components/organisms/OrganizationForm/` (seções da spec; prop `mode: "create" | "edit"`; slug automático do nome até o usuário editar o slug; ViaCEP no blur do CEP com `fetch("https://viacep.com.br/ws/${cep}/json/")`, falha silenciosa)
- Create: `components/organisms/InviteCard/` (estados: link recém-gerado com Copiar + WhatsApp `https://wa.me/55${phone}?text=…`; pendente com "expira em"; Admin ativo; botão Reenviar abre mini-formulário pré-preenchido)
- Create: `components/organisms/OrganizationList/` (cards `<md`, tabela `≥md`)
- Create: `components/molecules/ConfirmAction/` (Dialog `≥md` / Drawer `<md`, textarea de motivo opcional)
- Create: `components/molecules/LogoDropzone/` (Kibo Dropzone via `pnpm dlx shadcn@4.22.1 add` do registry Kibo; recorte quadrado central + `canvas.toBlob(…, "image/webp", 0.9)`, reduz qualidade até ≤ 1MB; desabilitado com texto "Upload de logo indisponível neste ambiente" quando `logoUploadEnabled()` é false; na criação fica desabilitado com "Disponível após salvar")
- Modify: `components/atoms/StatusBadge` — aceitar também `OrganizationStatus` (ou criar `OrgStatusBadge`; decisão do implementador)

- [ ] **Step 1:** Implementar páginas e componentes consumindo as actions da Task 6. Página `[id]` lê e apaga o cookie `invite-flash` para mostrar o link uma vez.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → sem erros
- [ ] **Step 3:** Propor commit `feat(platform): telas de empresas e convite no painel`

---

### Task 8: Página de aceite + aviso no login

**Files:**
- Create: `app/(auth)/convite/[token]/page.tsx` (usa `AuthTemplate`; chama `findInvitation`; `null` → mensagem genérica sem formulário)
- Create: `components/organisms/AcceptInviteForm/` (senha + confirmação, hidden `token`, `useActionState(acceptInvitationAction)`)
- Modify: `app/(auth)/login/page.tsx` + `components/organisms/LoginForm` — ler `searchParams.convite === "aceito"` e `email`; exibir aviso "Conta criada. Entre com seu e-mail e senha." e preencher o e-mail (prop `defaultEmail`)
- Verificar `middleware`/proxy de auth: `/convite/*` precisa ser público

- [ ] **Step 1:** Implementar
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → sem erros
- [ ] **Step 3:** Propor commit `feat(platform): aceite de convite e aviso no login`

---

### Task 9: Validação ponta a ponta

- [ ] **Step 1:** `pnpm vitest run` → tudo PASS (integração com `TEST_*`)
- [ ] **Step 2:** `pnpm build` → sem erros
- [ ] **Step 3:** `pnpm dev` (http://localhost:3004) + `pnpm dlx agent-browser@0.39.1` em 390px e 1280px: login MASTER → lista → criar empresa (slug automático, CEP preenchendo) → card com link → abrir link em sessão anônima → criar senha → login com aviso e e-mail preenchido → `/inicio` com cor da empresa → voltar MASTER → Admin ativo no card → suspender com motivo → login do Admin recusado → reativar. Screenshots em `docs/screenshots/`.
- [ ] **Step 4:** `pnpm audit:verify` → só os 5 eventos legados conhecidos falham
- [ ] **Step 5:** code-review com code-reviewer-agent (opus); corrigir críticos
- [ ] **Step 6:** Propor mensagem de commit final; atualizar `README.md` (seed MASTER, painel, convite) e `.env.example` se faltou algo

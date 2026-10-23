# Fase 2 (restante): Configurações da empresa e aceite de termos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Admin edita dados, logo, cor e preferências da empresa em `/configuracoes/empresa`. O MASTER publica versões imutáveis dos Termos de Uso e da Política de Privacidade, e todo usuário de empresa precisa aceitar a versão vigente (na tela `/aceite` ou no convite) antes de usar o app.

**Architecture:** As configurações reaproveitam `OrganizationForm` (novo `mode="tenant"`), `orgData`/`settingsData`/leitura da plataforma e o upload de logo extraído para `features/organizations/`. Os termos ficam num módulo novo, `features/legal/`: a regra de pendência é uma função pura, e o service trabalha com variantes `*Tx(tx, …)` para os testes rodarem dentro de transação revertida. O bloqueio fica em `loadSession` (`pendingTerms`) e num único guard (`requireAcceptedSession`), usado por `requireTenant`, `platformActor` e pelas actions de troca de empresa. Sem migration.

**Tech Stack:** Next 16.4 (App Router, Server Actions), Prisma 7.10 + adapter Neon (RLS), Auth.js v5, Zod 4, Vitest 5, Tailwind 4 + shadcn, `@vercel/blob`.

**Spec:** `docs/superpowers/specs/2026-10-22-fase2-configuracoes-termos-design.md`. Ler junto, porque o plano não repete o que a spec fixa (objetivos, anti-objetivos, tabela de permissões e eventos de auditoria). Ler também `docs/CODEBASE_MAP.md` e `AGENTS.md`.

## Decisões (perguntas da spec respondidas por padrão: o usuário pulou as perguntas)

1. **MASTER não aceita termos.** Isento sempre, inclusive dentro de uma empresa (com vínculo próprio ou `actingAsMaster`).
2. **Fuso = lista fechada dos fusos do Brasil** (os 16 da spec) num `AppSelect`, nos dois formulários (Admin e MASTER). O schema continua validando qualquer IANA. Se o valor atual não estiver na lista (definido antes pelo MASTER), ele entra como opção extra, para não mudar sozinho ao salvar.
3. **Nenhum texto jurídico v1 escrito por nós.** O aceite fica desligado enquanto o MASTER não publicar nada. O Dialog de publicação vem pré-preenchido com um **modelo curto de rascunho** que contém marcadores `[PREENCHER: …]`, e o schema recusa publicar enquanto houver algum marcador. Nada é publicado automaticamente: nem seed, nem migration, nem script.

## Decisões do plano (revisar junto)

- **ViaCEP já existe** no `OrganizationForm` (CSP já libera `https://viacep.com.br`). O modo tenant herda esse comportamento. A spec dizia "fora", mas manter é o caminho com menos código; remover seria uma mudança à parte.
- **Cadeia da plataforma dentro de tx de empresa:** `appendAudit` com `organizationId: null` dentro de `withScope({ organizationId })` lê o `prevHash` sob RLS (`audit_read` não enxerga linhas `null`), e isso **quebraria a cadeia**. Por isso entra `appendPlatformAudit(tx, actor, event)`, que liga `app.platform` na tx antes de anexar. Ele é usado no aceite de termos dentro do convite.
- **Concorrência de publicação:** o advisory lock serializa as publicações, e o P2002 vira "Outra publicação aconteceu agora. Recarregue." como rede de segurança. **Sem teste de integração** para isso: com rollback não dá para provocar o conflito, e publicar de verdade no banco do dev é proibido. Fica para a revisão opus.
- **Selo "MASTER isento"** e o redirect do guard não têm teste de integração, porque `loadSession` usa o `db` global e não vê uma tx revertida. A cobertura vem do teste de unidade com mocks (Task 5) e da validação no navegador (Task 9).
- **Logo:** o service apaga o blob anterior depois do commit sempre que a URL muda (troca ou remoção) no caminho do tenant. Falha só gera log. O caminho do MASTER fica inalterado.
- **Links legais:** rodapé fixo no `AuthTemplate` e no `AppShellTemplate` (o `OrgAccount` não tem menu; um rodapé dá menos código).
- **Checkbox no convite** aparece sempre que existe documento publicado, inclusive para conta existente. `createMany` com `skipDuplicates` absorve um aceite repetido.

## Global Constraints

- Node: `source ~/.nvm/nvm.sh && nvm use 22.16.0 >/dev/null &&` antes de qualquer `pnpm` (vale para **toda** task).
- Integração: `set -a && source .env && set +a && TEST_DATABASE_URL="$DATABASE_URL" TEST_DIRECT_URL="$DIRECT_URL" pnpm vitest run <arquivo>`. Seguir o padrão de `tests/session.test.ts`: `describe.skipIf(!APP_URL || !OWNER_URL)`, cliente dono para preparo e limpeza, imports dinâmicos depois de setar `process.env.DATABASE_URL`, `suffix = Date.now().toString(36)` e `vi.mock("server-only")`/`vi.mock("@/lib/auth")` quando importar `lib/session.ts`.
- **Os testes rodam no MESMO banco do dev.** Ids escalares usados na limpeza começam como `""`, nunca `undefined`: `where: { x: undefined }` no Prisma remove o filtro e apaga a tabela inteira (incidente de 2026-10-22).
- **Nunca publicar um `LegalDocument` em teste sem reverter.** Uma versão publicada deixa **todos** os usuários do dev bloqueados em `/aceite`. Todo teste que cria `LegalDocument`/`LegalAcceptance` roda dentro de `withScope({ platform: true }, async (tx) => { …; throw ROLLBACK })` com `await expect(...).rejects.toBe(ROLLBACK)`, usando as variantes `*Tx` do service. No `afterAll`, conferir pelo dono que nenhum documento com o `suffix` do teste ficou para trás.
- Logins conhecidos do dev: MASTER = e-mail de `SEED_MASTER_EMAIL` no `.env`; Admin = `admin.demo@beedock.local` (empresa `prime-studio-demo`). **As senhas ficam com o orquestrador/usuário e nunca entram em arquivo do repo** (plano, teste, script, screenshot, CODEBASE_MAP). Se precisar redefinir, usar script descartável no scratchpad.
- Next 16.4: ler `node_modules/next/dist/docs/` antes de usar params/searchParams assíncronos, Server Actions, `redirect`, `revalidatePath` e renderização dinâmica. Páginas públicas que leem o banco precisam ser dinâmicas (`await connection()` ou equivalente da doc), senão o build tenta pré-renderizar com acesso ao banco.
- RLS: `OrganizationSettings` só dentro de `withScope`/`withAudit`. `Organization`, `Session`, `User`, `LegalDocument` e `LegalAcceptance` são globais (sem RLS), mas a escrita vai pelo `tx` da mesma transação da auditoria.
- Auditoria: evento de plataforma (`organizationId: null`) dentro de tx de empresa **só** via `appendPlatformAudit` (Task 4). Em `before`/`after` nada de texto completo dos termos, token ou senha; logo = nome do arquivo, não a URL.
- Toda escrita: `authorize`/`assertMaster` → escrita + auditoria na mesma tx. Sem chave nova em `lib/permissions.ts` (`settings.manage` cobre a empresa).
- Proteção de rota só por guard (não há middleware). `/aceite` e `logoutAction` **não** passam pelo guard de termos.
- UI: invocar `/frontend-design` antes de cada task de tela. Boundaries do eslint: organisms recebem actions/dados por props e nunca importam `features/`; molecules/organisms usam atoms `App*`, não `components/ui`. Dialog no desktop, Drawer no mobile (`useMediaQuery("(min-width: 768px)")`). Tokens Colmeia & Doca, alvos ≥44px, `motion-reduce`, copy pt-BR, desktop-first utilizável em 390px. Rota nova com leitura ganha `loading.tsx` com `AppSkeleton`.
- **Git:** nenhum agente roda `git add/commit/push/branch/checkout`. Cada task termina com "não commitar" e só propõe a mensagem (conventional commits em pt-BR, sem menção a IA).

## Review Focus

1. **Admin com termo pendente chamando uma action que não usa `requireTenant`**, por exemplo `inviteMemberAction(orgId)` via `platformActor`, ou `switchOrganizationAction`. Precisa redirecionar para `/aceite` sem escrever nada. Teste: Task 5 (`platformActor` com sessão pendente → `NEXT_REDIRECT` para `/aceite`).
2. **Fuso fora da lista do Brasil** (ex.: `America/New_York`, gravado antes pelo MASTER) com o Admin salvando sem tocar no campo: o valor tem de se manter. Teste: Task 3 (`timezoneOptions("America/New_York")` contém a opção) e Task 1 (`updateCompanySettings` com esse fuso grava sem erro).
3. **Versão nova publicada com a tela de aceite aberta:** o envio do id antigo é recusado e nada é gravado. Teste: Task 4.
4. **Clique duplo / duas abas aceitando:** sem linha duplicada e sem erro. Teste: Task 4.
5. **Modelo de rascunho publicado sem editar** (texto com `[PREENCHER`): recusado com erro de campo. Teste: Task 4 (schema).

---

### Task 1: Service de configurações da empresa ⚠️ RISCO leve (escrita do tenant em tabela global + sessões; revisão opus)

**Files:**
- Create: `features/organizations/schemas.ts`, `features/organizations/service.ts`
- Modify: `features/platform/service.ts` (exportar `orgData` **sem slug** e `settingsData`; extrair `readOrganization(tx, id)` do corpo de `getOrganization`; `createOrganization`/`updateOrganization` passam `slug: org.slug` à parte, e o `diff` continua incluindo o slug)
- Test: `tests/company-settings.test.ts` (novo)

**Interfaces:**
- Produces:
  - `companySettingsSchema = organizationSchema.omit({ slug: true })` (Zod descarta chaves extras, então `slug`/`status`/`plan` forjados somem) → `CompanySettingsInput`
  - `orgData(o: CompanySettingsInput)`, `settingsData(s: CompanySettingsInput["settings"])` exportados de `features/platform/service.ts`
  - `readOrganization(tx: Tx, id: string)` → o mesmo objeto que `getOrganization` devolve hoje (ou `null`); `getOrganization` vira `assertMaster` + `withScope` + `readOrganization`
  - `getCompanySettings(ctx: TenantContext)` → `readOrganization` em `withScope({ organizationId: ctx.organizationId })` (a page checa `can` antes)
  - `updateCompanySettings(ctx: TenantContext, input: CompanySettingsInput): Promise<void>`: `authorize(ctx, "settings.manage")` → `withAudit` com `organization.update`, `entityType: "Organization"`, `entityId: ctx.organizationId`, `before`/`after` = `diff` (mesma montagem `pickKeys` de `updateOrganization`). Grava `Organization` + `OrganizationSettings` (`updatedById: ctx.userId`). Se `sessionIdleMinutes` mudou: `tx.session.updateMany({ where: { organizationId: ctx.organizationId, revokedAt: null }, data: { idleMinutes } })` na mesma tx. O orgId vem **sempre** do `ctx`.

- [ ] **Step 1: Testes que falham** em `tests/company-settings.test.ts`. Preparo pelo dono: orgs A e B (ACTIVE + settings com `sessionIdleMinutes` 60), usuários Admin e Funcionário em A, Admin em B, MASTER sem vínculo, e uma `Session` ativa por usuário (o Admin de B com sessão em B). Ctx montado à mão (`TenantContext`; para o MASTER, `role: "ADMIN"` e `auditRole: "MASTER"`):
  - Admin de A salva `{ ...atual, name: "A2", primaryColor: "#123456", settings: { ...s, monthStartDay: 10, timezone: "America/Manaus" } }` → org e settings gravados; `AuditLog` de A com `organization.update`, `after.primaryColor === "#123456"`, `after.settings.monthStartDay === 10`
  - `companySettingsSchema.parse({ ...válido, slug: "x", status: "SUSPENDED" })` não tem `slug` nem `status`; depois de salvar, o `slug`/`status` de A estão inalterados
  - Funcionário → `ForbiddenError` + DENIED `settings.manage`; `name` de A inalterado
  - Admin de B salva → só B muda (A intacta)
  - `sessionIdleMinutes: 15` em A → sessões ativas de A com `idleMinutes === 15` e a sessão de B com 60
  - MASTER (ctx com `auditRole: "MASTER"`) salva → `userRole === "MASTER"` no evento
  - `timezone: "America/New_York"` → grava sem erro (Review Focus 2)
- [ ] **Step 2:** `... pnpm vitest run tests/company-settings.test.ts` → FAIL (módulo inexistente)
- [ ] **Step 3:** Implementar conforme Interfaces.
- [ ] **Step 4:** Mesmo comando → PASS; `... pnpm vitest run tests/platform.test.ts` → verde (refactor de `orgData`); `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(empresa): service de configurações da empresa pelo Admin`

---

### Task 2: Logo pelo Admin (upload e remoção)

**Files:**
- Create: `features/organizations/logo.ts`, `features/organizations/actions.ts`
- Modify: `features/platform/logo-actions.ts` (passa a usar `storeLogo`; evento e comportamento inalterados)
- Modify: `features/organizations/service.ts` (`setCompanyLogo`)
- Test: `tests/company-settings.test.ts`

**Interfaces:**
- Consumes: `blobToken`, `logger`, `authorize`, `withAudit`
- Produces:
  - `storeLogo(organizationId: string, fd: FormData): Promise<{ url: string } | { error: string }>`: o miolo atual (campo `logo`, tipos PNG/JPEG/WebP, ≤1 MB, `put` público em `org/${id}/logo-${Date.now()}.webp`). Mensagens idênticas às de hoje.
  - `deleteLogoBlob(url: string): Promise<void>`: `del` com o token; erro → `logger.error("logo.delete_failed", …)` sem relançar.
  - `setCompanyLogo(ctx: TenantContext, url: string | null): Promise<{ previous: string | null }>`: `authorize(ctx, "settings.manage")`. URL igual → no-op. Senão grava em `withAudit` com `organization.update`, `before`/`after: { logoUrl: <basename ou null> }`.
  - `features/organizations/actions.ts` (`"use server"`, comentário de contrato no topo):
    - `updateCompanySettingsAction(prev: FormState, fd: FormData): Promise<FormState>`: `requireTenant` → `companySettingsSchema.parse(formDataToObject(fd))` → service → `revalidatePath("/", "layout")` → `{ ok: true, values }`. Erros via `toFormState`.
    - `uploadCompanyLogoAction(fd: FormData): Promise<{ url?: string; error?: string }>`: `requireTenant` → `authorize(ctx, "settings.manage")` **antes** do `storeLogo` (um Funcionário não sobe blob) → `setCompanyLogo` → depois do commit, `deleteLogoBlob(previous)` se houver → `revalidatePath("/", "layout")`.
    - `removeCompanyLogoAction(): Promise<{ error?: string }>`: `setCompanyLogo(ctx, null)` → `deleteLogoBlob(previous)` depois do commit.

- [ ] **Step 1: Testes que falham** (sem blob real; testam o service):
  - `setCompanyLogo(ctxAdminA, "https://x.public.blob.vercel-storage.com/org/A/logo-1.webp")` → `logoUrl` gravado; evento com `after.logoUrl === "logo-1.webp"`; `previous === null`
  - `setCompanyLogo(ctxAdminA, null)` → `logoUrl === null`; `previous` = URL anterior; `before.logoUrl === "logo-1.webp"`
  - mesma URL duas vezes → um único evento
  - Funcionário → `ForbiddenError` + DENIED; `logoUrl` inalterado
- [ ] **Step 2:** `... pnpm vitest run tests/company-settings.test.ts` → FAIL nos novos
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS; `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(empresa): logo da empresa pelo Admin com remoção`

---

### Task 3: Tela `/configuracoes/empresa`

Antes: invocar `/frontend-design`.

**Files:**
- Create: `lib/timezones.ts` (+ `lib/timezones.test.ts`)
- Create: `app/(app)/configuracoes/empresa/page.tsx` + `loading.tsx`
- Modify: `components/organisms/OrganizationForm/index.tsx` (`mode: "create" | "edit" | "tenant"`; select de fuso; avisos)
- Modify: `components/molecules/LogoDropzone/index.tsx` (prop opcional `removeAction`)
- Modify: `app/(app)/configuracoes/page.tsx` (primeiro item de `LINKS`: `{ href: "/configuracoes/empresa", title: "Empresa", text: "Dados, logo, cor e preferências." }`)

**Interfaces:**
- Consumes: `getCompanySettings`, actions da Task 2, `toFormValues`, `blobUploadEnabled`
- Produces:
  - `BR_TIMEZONES: { value: string; label: string }[]` com os 16 fusos da spec e o rótulo "Cidade (UTC−N)": Noronha −2; Belem, Fortaleza, Recife, Araguaina, Maceio, Bahia, Sao_Paulo, Santarem −3; Campo_Grande, Cuiaba, Porto_Velho, Boa_Vista, Manaus −4; Eirunepe, Rio_Branco −5
  - `timezoneOptions(current?: string): { value; label }[]` = `BR_TIMEZONES` + `{ value: current, label: current }` quando `current` não está na lista
  - `LogoDropzone` ganha `removeAction?: () => Promise<{ error?: string }>`: botão "Remover logo" visível quando há logo; `ConfirmAction` não é necessário (é reversível por novo upload). Sucesso → `url = null` + toast "Logo removida."
- `OrganizationForm`:
  - `mode="tenant"`: sem o campo slug, sem a seção do Admin; botão "Salvar alterações"; toast "Dados salvos."
  - Fuso: `AppSelect` com `timezoneOptions(val("settings.timezone"))` em **todos** os modos (a `datalist` sai)
  - Aviso `text-muted-foreground text-sm` abaixo de "Dia de início do mês" e de "Fuso horário": "Muda como os meses são calculados em Início, Lançamentos e Relatórios, inclusive meses passados."
- Page: `requireTenant()`; sem `can(role, "settings.manage")` → `AdminOnlyNotice`; senão `getCompanySettings(ctx)` → `OrganizationForm mode="tenant"` com `logo={<LogoDropzone uploadAction={uploadCompanyLogoAction} removeAction={removeCompanyLogoAction} … />}`.

- [ ] **Step 1: Teste que falha** `lib/timezones.test.ts`: `BR_TIMEZONES.length === 16`; todo `value` é aceito por `Intl.DateTimeFormat`; `timezoneOptions("America/New_York")` termina com essa opção; `timezoneOptions("America/Manaus")` tem 16 itens.
- [ ] **Step 2:** `pnpm vitest run lib/timezones.test.ts` → FAIL
- [ ] **Step 3:** Invocar `/frontend-design`; implementar.
- [ ] **Step 4:** `pnpm vitest run lib/timezones.test.ts components/organisms/OrganizationForm` → PASS; `pnpm typecheck && pnpm lint && pnpm build` → verdes.
- [ ] **Step 5:** Preview rápido com agent-browser (1280px/390px): Admin troca a cor → o shell muda depois de salvar; Funcionário vê `AdminOnlyNotice`; o painel do MASTER continua funcionando com o select de fuso.
- [ ] **Step 6:** não commitar; propor `feat(empresa): tela de configurações da empresa`

---

### Task 4: Termos: regra pura, service e auditoria na cadeia da plataforma ⚠️ RISCO (auditoria/cadeia HMAC + bloqueio global; revisão opus)

**Files:**
- Create: `features/legal/rules.ts` (+ `features/legal/rules.test.ts`), `features/legal/schemas.ts` (+ `schemas.test.ts`), `features/legal/service.ts`, `features/legal/templates.ts`
- Modify: `lib/audit.ts` (`appendPlatformAudit`)
- Test: `tests/legal.test.ts` (novo, **tudo em tx revertida**)

**Interfaces:**
- Consumes: `assertMaster`, `PlatformActor`, `isUnique` (`features/platform/service.ts`), `FieldError`, `Tx`, `db`, `withScope`, `appendAudit`
- Produces:
  - `lib/audit.ts`: `appendPlatformAudit(tx: Tx, actor: Actor, event: AuditEvent): Promise<void>` = `SELECT set_config('app.platform', 'on', true)` + `appendAudit(tx, { ...actor, organizationId: null }, event)`. Comentário: liga a visão de plataforma para o resto da tx (chamar por último).
  - `rules.ts`: `type LegalDocRef = { id: string; type: LegalDocumentType; version: number }`; `pendingDocuments<T extends LegalDocRef>(current: T[], acceptedIds: ReadonlySet<string>): T[]`
  - `schemas.ts`: `LEGAL_PLACEHOLDER = "[PREENCHER"`; `publishLegalSchema = z.object({ type: z.enum(["TERMS", "PRIVACY"]), content: z.string().trim().min(10, "Mínimo de 10 caracteres.").max(100_000, "Máximo de 100.000 caracteres.").refine((c) => !c.includes(LEGAL_PLACEHOLDER), "Substitua os trechos [PREENCHER …] antes de publicar.") })`; `acceptTermsSchema = z.array(z.string().min(1)).min(1).max(2)`
  - `templates.ts`: `LEGAL_TEMPLATES: Record<LegalDocumentType, string>`. Rascunho curto (≤ 25 linhas cada) com seções-título e marcadores `[PREENCHER: razão social da plataforma]`, `[PREENCHER: contato do encarregado]`, `[PREENCHER: região dos dados]` etc. **Não** é texto jurídico; o cabeçalho diz "Modelo de rascunho, revisar com assessoria jurídica".
  - `service.ts` (`type Client = Tx | typeof db`; `type LegalDoc = LegalDocRef & { content: string; publishedAt: Date }`):
    - `currentLegalDocuments(client: Client): Promise<LegalDoc[]>`: maior `version` por tipo (0 a 2 itens; `findMany` ordenado + primeiro de cada tipo, ou `distinct: ["type"]` com `orderBy: [{ type }, { version: "desc" }]`)
    - `pendingLegalDocumentsFor(client: Client, userId: string): Promise<(LegalDoc & { updated: boolean })[]>`: vigentes + aceites do usuário; `updated` = já aceitou alguma versão anterior do mesmo tipo; filtra com `pendingDocuments`
    - `hasPendingLegalDocuments(userId: string): Promise<boolean>` → `pendingLegalDocumentsFor(db, userId)` não vazio
    - `acceptLegalDocumentsTx(tx: Tx, actor: Actor & { userId: string }, documentIds: string[]): Promise<void>`: cada id precisa estar em `currentLegalDocuments(tx)`; senão `FieldError("documents", "Os termos foram atualizados. Leia a nova versão.")` antes de gravar. `legalAcceptance.createMany({ data, skipDuplicates: true })` com `ip`/`userAgent` de `actor.meta`; se `count > 0`, `appendPlatformAudit(tx, actor, { action: "auth.terms_accept", entityType: "User", entityId: userId, after: { documents: [{ type, version }] } })`
    - `acceptLegalDocuments(actor, documentIds)` = `withScope({ platform: true }, (tx) => acceptLegalDocumentsTx(tx, actor, documentIds))`
    - `publishLegalDocumentTx(tx: Tx, actor: PlatformActor, input: PublishLegalInput): Promise<{ id: string; version: number }>`: `assertMaster(actor, "platform.legal_publish")` → `pg_advisory_xact_lock(hashtext('legal:' || type))` → `version = max + 1` → `create` → `appendAudit(tx, { ...actor, organizationId: null }, { action: "platform.legal_publish", entityType: "LegalDocument", entityId: id, after: { type, version, length: content.length } })`
    - `publishLegalDocument(actor, input)` = `withScope({ platform: true }, …Tx)`; `isUnique(e)` → `FieldError("content", "Outra publicação aconteceu agora. Recarregue.")`
    - `legalOverview(actor: PlatformActor): Promise<Record<LegalDocumentType, { current: LegalDoc | null; acceptedCount: number; history: { version: number; publishedAt: Date }[] }> & { activeUsers: number }>`: `assertMaster(actor, "platform.legal_view")`; `activeUsers` = usuários não anonimizados, `platformRole USER`, com ≥1 vínculo ativo em empresa ACTIVE (`withScope({ platform: true })`)

- [ ] **Step 1: Testes que falham.**
  - `rules.test.ts`: sem vigentes → `[]`; vigentes T1 e P1 sem aceites → os dois; T1 aceito → só P1; vigente T2 com T1 aceito → `[T2]`
  - `schemas.test.ts`: texto com `[PREENCHER: x]` → erro com a mensagem acima (Review Focus 5); `"   "` → erro de mínimo; `LEGAL_TEMPLATES.TERMS` falha no parse (o modelo nunca passa sem edição)
  - `tests/legal.test.ts`: preparo pelo dono com MASTER, um USER e org com vínculo ativo; `ROLLBACK = new Error("rollback")`. Cada caso abre `withScope({ platform: true }, async (tx) => { …; throw ROLLBACK })`; `base` = versão vigente atual de TERMS (0 se nenhuma):
    - publica TERMS → `version === base + 1`; `pendingLegalDocumentsFor(tx, user)` contém o documento; `platform.legal_publish` sem `content` no `after`; o `prevHash` do evento é igual ao `hash` do evento de plataforma anterior lido no mesmo tx
    - aceita → pendência vazia; uma `LegalAcceptance` com `ip === "127.0.0.1"`; `auth.terms_accept` com `organizationId === null`
    - aceita de novo o mesmo id → continua uma linha, sem segundo evento (Review Focus 4)
    - publica v+2 → pendente de novo com `updated === true`; aceitar o id da versão anterior → `FieldError` "Os termos foram atualizados…" e 0 linhas novas (Review Focus 3)
    - USER como ator de `publishLegalDocumentTx` → `ForbiddenError`
    - **cadeia dentro de tx de empresa:** numa `withScope({ organizationId: org })` revertida, chamar `appendPlatformAudit(tx, actor, { action: "test.chain" })` e, no mesmo tx, conferir que o `prevHash` da linha nova é igual ao `hash` da linha anterior com `organizationId: null` (`orderBy: { seq: "desc" }, skip: 1`) e que esse `prevHash` não é `null`
    - `afterAll`: `owner.legalDocument.count({ where: { content: { contains: suffix } } }) === 0` (conteúdo dos testes inclui o `suffix`)
- [ ] **Step 2:** `pnpm vitest run features/legal` e `... pnpm vitest run tests/legal.test.ts` → FAIL
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS; `pnpm typecheck && pnpm lint` → limpos; `pnpm audit:verify` → só os 5 eventos legados conhecidos falham (prova que os testes não sujaram a cadeia).
- [ ] **Step 5:** não commitar; propor `feat(termos): versões imutáveis, aceite e auditoria na cadeia da plataforma`

---

### Task 5: Guard de termos pendentes ⚠️ RISCO (sessão/guard; revisão opus)

**Files:**
- Modify: `lib/session.ts`, `features/platform/actor.ts`, `features/members/actions.ts` (switch/leave)
- Test: `lib/session.test.ts` (novo, unidade com mocks)

**Interfaces:**
- Consumes: `hasPendingLegalDocuments` (Task 4)
- Produces:
  - `CurrentSession.pendingTerms: boolean`, calculado em `loadSession` como `!isMaster && await hasPendingLegalDocuments(row.userId)` (depois das validações; MASTER nunca consulta)
  - `requireAcceptedSession(): Promise<CurrentSession>`: sem sessão → `redirect("/login")`; `pendingTerms` → `redirect("/aceite")`
  - `requireTenant` passa a começar por `requireAcceptedSession()` (os demais redirects iguais)
  - `platformActor()` e as actions de troca/saída de empresa (`features/members/actions.ts`, hoje com `getCurrentSession`) usam `requireAcceptedSession()`
  - `getCurrentSession` continua sem o guard (usado por `/aceite`, `/login` e `logoutAction`)

- [ ] **Step 1: Testes que falham** em `lib/session.test.ts`. Mocks: `server-only`; `@/lib/auth` → `{ auth: async () => ({ sid: "s1" }) }`; `next/headers` → `headers: async () => new Headers()`; `@/lib/db` → `db.session.findUnique` devolvendo uma linha válida (USER, org ACTIVE, `lastSeenAt` agora) e `withScope` devolvendo um vínculo ativo FUNCIONARIO; `@/features/legal/service` → `hasPendingLegalDocuments: vi.fn()`:
  - pendente `true` → `requireTenant()` rejeita com erro cujo `digest` contém `/aceite`
  - pendente `false` → `requireTenant()` devolve ctx com `role === "FUNCIONARIO"`
  - linha com `platformRole: "MASTER"` → `hasPendingLegalDocuments` **não** é chamado e `pendingTerms === false`
  - `platformActor()` com pendente `true` → redirect `/aceite` (Review Focus 1)
  - `getCurrentSession()` com pendente `true` → devolve a sessão (sem redirect)
- [ ] **Step 2:** `pnpm vitest run lib/session.test.ts` → FAIL
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS; `... pnpm vitest run tests/session.test.ts tests/switch.test.ts` → verdes; `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(termos): bloqueio do app com termos pendentes`

---

### Task 6: Aceite de termos no convite ⚠️ RISCO (tx do convite + cadeia da plataforma; revisão opus junto com Task 4)

**Files:**
- Modify: `features/platform/invitations.ts` (`findInvitation`, `acceptInvitation`)
- Modify: `features/platform/actions.ts` (`acceptInvitationAction`)
- Modify: `components/organisms/AcceptInviteForm/` (prop `requireTerms: boolean`)
- Modify: `app/(auth)/convite/[token]/page.tsx`
- Test: `tests/platform.test.ts`

**Interfaces:**
- Consumes: `currentLegalDocuments`, `acceptLegalDocumentsTx` (Task 4)
- Produces:
  - `findInvitation(...)` ganha `requireTerms: boolean` (`currentLegalDocuments(db).length > 0`)
  - `acceptInvitation({ token, password, acceptTerms }: { token: string; password: string; acceptTerms: boolean }, meta)`: o resultado ganha `reason: "terms"`. Dentro da tx do convite, **depois** do vínculo: `docs = await currentLegalDocuments(tx)`; com `docs.length > 0`: `!acceptTerms` → lança e reverte (convite não consumido) → `{ ok: false, reason: "terms" }`; senão `acceptLegalDocumentsTx(tx, actorDoUsuário, docs.map((d) => d.id))` (usa `appendPlatformAudit`, que fica por último na tx)
  - `acceptInvitationAction`: `acceptTerms = fd.get("terms") === "on"`; `reason: "terms"` → `fieldErrors.terms = "Aceite os Termos de Uso e a Política de Privacidade."`
  - `AcceptInviteForm` com `requireTerms`: checkbox `name="terms"` com "Li e aceito os [Termos de Uso] e a [Política de Privacidade]" (links `target="_blank"` para `/termos` e `/privacidade`) e erro de campo `terms`

- [ ] **Step 1: Testes que falham / regressão** em `tests/platform.test.ts` (sem publicar documento):
  - os testes de aceite existentes passam `acceptTerms: false` e continuam verdes (sem documento publicado nada é exigido)
  - `findInvitation` → `requireTerms === false` quando não há documento (`if ((await owner.legalDocument.count()) > 0)` → `skip`, com comentário)
  - O caminho "com documento" é coberto pela Task 4 (`acceptLegalDocumentsTx` + `appendPlatformAudit` dentro de tx de empresa) e pela Task 9 no navegador.
- [ ] **Step 2:** `... pnpm vitest run tests/platform.test.ts` → FAIL (assinatura)
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS; `pnpm typecheck && pnpm lint` → limpos.
- [ ] **Step 5:** não commitar; propor `feat(convites): aceite de termos junto com o convite`

---

### Task 7: Tela `/aceite`, páginas públicas e links legais

Antes: invocar `/frontend-design`.

**Files:**
- Create: `features/legal/actions.ts` (`acceptTermsAction`)
- Create: `components/organisms/LegalDocumentView/` (`index.tsx`, `.types.ts`)
- Create: `components/organisms/TermsAcceptForm/` (`index.tsx`, `.types.ts`)
- Create: `app/(auth)/aceite/page.tsx`, `app/(public)/termos/page.tsx`, `app/(public)/privacidade/page.tsx`
- Modify: `components/templates/AuthTemplate/index.tsx` e `components/templates/AppShellTemplate/index.tsx` (rodapé com os links "Termos de Uso" · "Privacidade")

**Interfaces:**
- Consumes: `pendingLegalDocumentsFor`, `currentLegalDocuments`, `acceptLegalDocuments`, `acceptTermsSchema` (Task 4); `getCurrentSession`; `LogoutButton`, `logoutAction`
- Produces:
  - `acceptTermsAction(prev: FormState, fd: FormData): Promise<FormState>`: `getCurrentSession()` (sem sessão → `/login`; MASTER → `/plataforma`); `ids = acceptTermsSchema.parse(fd.getAll("documentId"))`; `fd.get("agree") !== "on"` → `fieldErrors.agree = "Marque que leu e aceita para continuar."`; `acceptLegalDocuments({ userId, userName, role: session.role, organizationId: null, meta }, ids)`; `FieldError("documents")` → `{ error }` + `revalidatePath("/aceite")`; sucesso → `redirect("/inicio")` (com `startNavigationProgress` no client)
  - `LegalDocumentViewProps = { title: string; version: number; publishedAt: Date; content: string; updated?: boolean; scroll?: boolean }`: "Versão N · publicada em dd/mm/aaaa" (`format-date`), selo "Atualizado" quando `updated`, texto `whitespace-pre-line`, `max-h-[50vh] overflow-y-auto` + `tabIndex={0}` quando `scroll`
  - `TermsAcceptFormProps = { documents: (LegalDocumentViewProps & { id: string })[]; action; logoutAction }`: um `LegalDocumentView scroll` por documento, hidden `documentId` para cada um, checkbox `agree` "Li e aceito", botão "Aceitar e continuar", `LogoutButton` "Sair"
- `/aceite`: `AuthTemplate` + `getCurrentSession()`; sem sessão → `/login`; MASTER → `/plataforma`; nada pendente → `/inicio`
- `/termos` e `/privacidade`: sem sessão, render dinâmico (ver Global Constraints), `LegalDocumentView` sem `scroll` numa coluna `max-w-prose` com o `HexMark` e link "Voltar" para `/login`. Sem documento: "Documento ainda não publicado.". `metadata.title` "Termos de Uso" / "Política de Privacidade".

- [ ] **Step 1:** Invocar `/frontend-design`; implementar.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes (o build não pode tentar ler o banco nas páginas públicas)
- [ ] **Step 3:** Preview com agent-browser: `/termos` e `/privacidade` sem login mostram "Documento ainda não publicado."; `/aceite` logado e sem pendência redireciona para `/inicio`. A tela com pendência é validada na Task 9.
- [ ] **Step 4:** não commitar; propor `feat(termos): tela de aceite e páginas públicas`

---

### Task 8: `/plataforma/termos` (publicação pelo MASTER)

Antes: invocar `/frontend-design`.

**Files:**
- Create: `components/organisms/LegalPublisher/` (`index.tsx`, `.types.ts`)
- Create: `app/(plataforma)/plataforma/termos/page.tsx` + `loading.tsx`
- Modify: `features/legal/actions.ts` (`publishLegalDocumentAction`)
- Modify: `components/organisms/PlatformNav/index.tsx` (item "Termos" `/plataforma/termos`)

**Interfaces:**
- Consumes: `legalOverview`, `publishLegalDocument`, `publishLegalSchema`, `LEGAL_TEMPLATES` (Task 4); `platformActor`
- Produces:
  - `publishLegalDocumentAction(prev: FormState, fd: FormData): Promise<FormState>`: campos `type`, `content`; `platformActor()` → parse → service → `revalidatePath("/plataforma/termos")` → `{ ok: true }`; erros via `toFormState`
  - `LegalPublisherProps = { type: "TERMS" | "PRIVACY"; title: string; current: { version: number; publishedAt: Date } | null; acceptedCount: number; activeUsers: number; history: { version: number; publishedAt: Date }[]; initialContent: string; publishAction }`. Seção com vigente ("Versão N · desde dd/mm/aaaa" ou "Nada publicado: o aceite está desligado."), "X de Y usuários aceitaram", histórico somente leitura e o botão "Publicar nova versão" (Dialog/Drawer) com textarea (`initialContent` = texto vigente, ou `LEGAL_TEMPLATES[type]` quando não há versão), contador de caracteres e confirmação "Todos os usuários de empresas precisarão aceitar de novo no próximo acesso." antes do envio. Sucesso → toast "Versão N publicada." e fecha.
- Page: `requireMaster()` + `legalOverview(await platformActor())`; duas `LegalPublisher` (Termos de Uso, Política de Privacidade).

- [ ] **Step 1:** Invocar `/frontend-design`; implementar.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes
- [ ] **Step 3:** Preview com agent-browser **sem publicar**: abrir o Dialog, conferir o modelo pré-preenchido e tentar publicar com os `[PREENCHER` → erro de campo; cancelar.
- [ ] **Step 4:** não commitar; propor `feat(plataforma): publicação de termos e política`

---

### Task 9: Validação ponta a ponta + mapa do código

- [ ] **Step 1:** `source ~/.nvm/nvm.sh && nvm use 22.16.0 >/dev/null && set -a && source .env && set +a && TEST_DATABASE_URL="$DATABASE_URL" TEST_DIRECT_URL="$DIRECT_URL" pnpm vitest run` → tudo verde
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes
- [ ] **Step 3:** Pelo dono, confirmar `LegalDocument` vazio no dev (`count === 0`). Se não estiver vazio, **parar e perguntar ao usuário** antes do Step 4.
- [ ] **Step 4:** `pnpm dev` (http://localhost:3004) + `pnpm dlx agent-browser@0.39.1` em 1280px e 390px, screenshots em `docs/screenshots/termos-*` e `empresa-*` (sem senha visível):
  1. Admin demo → Configurações ▸ Empresa → troca cor e dia de início → "Dados salvos." → o shell muda na hora; o aviso de recálculo aparece; sobe e remove o logo (ou vê "indisponível" sem token)
  2. Funcionário → `/configuracoes/empresa` → `AdminOnlyNotice`
  3. `/termos` sem login → "Documento ainda não publicado."
  4. MASTER → `/plataforma/termos` → publica Termos v1 com texto de teste (sem marcadores, contendo "QA E2E") → Admin navega → `/aceite` → tenta sem marcar (erro) → aceita → `/inicio`; MASTER continua navegando sem `/aceite`; `/termos` mostra a v1
  5. Convite novo com documento publicado: sem marcar a caixa → erro `terms`; marcando → conta criada e aceite gravado
- [ ] **Step 5: Reverter a publicação do Step 4** com script descartável no scratchpad (`DIRECT_URL`, owner): apagar as `LegalAcceptance` dos documentos com "QA E2E" no conteúdo e depois esses `LegalDocument`. Conferir `count === 0`. Os eventos de auditoria ficam (append-only). Registrar no relatório os ids apagados.
- [ ] **Step 6:** Auditoria pelo dono: `organization.update` com `userRole` correto, `platform.legal_publish` e `auth.terms_accept` na cadeia da plataforma; `pnpm audit:verify` → só os 5 eventos legados conhecidos falham.
- [ ] **Step 7:** Atualizar `docs/CODEBASE_MAP.md`: Directory Structure (`features/legal/`, `features/organizations/` com service/logo/actions, rotas `/configuracoes/empresa`, `/aceite`, `/(public)/termos|privacidade`, `/plataforma/termos`); Module Guide (`lib/session.ts`: `pendingTerms` e `requireAcceptedSession`; `lib/audit.ts`: `appendPlatformAudit`; `lib/timezones.ts`; organisms `LegalDocumentView`, `TermsAcceptForm`, `LegalPublisher`; `OrganizationForm mode="tenant"`; `LogoDropzone.removeAction`); Data Flow (aceite de termos); Gotchas (evento de plataforma em tx de empresa só via `appendPlatformAudit`; nunca publicar `LegalDocument` em teste sem rollback; páginas públicas dinâmicas); `last_mapped`.
- [ ] **Step 8:** Code review da demanda inteira com code-reviewer-agent (opus), com foco nas Tasks 1, 4, 5 e 6; corrigir os críticos.
- [ ] **Step 9:** não commitar; propor a mensagem final (ou uma por task, se o usuário preferir).

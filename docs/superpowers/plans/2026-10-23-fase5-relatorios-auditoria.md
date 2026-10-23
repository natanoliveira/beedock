# Fase 5 — Relatórios, auditoria, histórico e exportação LGPD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, uma task por vez; parar e reportar entre tasks, aguardar "segue"). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Transformar o que já está no banco em telas e arquivos: relatório mensal (PDF/CSV), auditoria legível e verificável (empresa e plataforma), histórico por registro e exportação de dados (LGPD).

**Architecture:** Sem migration. Leitura de `AuditLog` sempre em `withScope` (empresa ou `{ platform: true }`); verificação de cadeia extraída do script para `lib/audit-verify.ts` e usada por script e telas. Relatório reusa `financialMonthRange`/`sumByType` (uma fonte de totais). Exportações são route handlers que auditam antes de entregar o corpo.

**Tech Stack:** Next 16 App Router, Prisma 7 (`withScope`, `appendAudit`), pdf-lib (`features/transactions/pdf-kit.ts`), Vitest (banco dev Neon), Tailwind/shadcn (Atomic Design imposto por lint).

**Spec:** `docs/superpowers/specs/2026-10-22-fase5-relatorios-auditoria-design.md` (decisões do usuário: eventos legados SHA-256 ficam; Histórico só Admin/MASTER; export de empresa só JSON, sem arquivos de comprovante).

## Global Constraints

- Funcionário nunca recebe relatório, lucro, auditoria ou histórico (page, action, route handler): `authorize(ctx, "<perm>")` no service; negação gera DENIED.
- Toda exportação grava evento de auditoria ANTES de enviar o corpo; falha na auditoria = nada entregue.
- CSV: UTF-8 com BOM, separador `;`, decimal `1234,56`, saída negativa `-1234,56`, data `dd/mm/aaaa`; sem `payerName`/`payerDocument`.
- Detalhe de evento mostra só o gravado em `before/after` (já mascarado); nunca rebuscar valor atual.
- Relatório e Início/Lançamentos usam a mesma soma e o mesmo período para o mesmo mês.
- Auditoria CSV: máximo 50.000 linhas; acima disso recusar pedindo período menor. Histórico por registro: máximo 200 eventos.
- Eventos novos: `report.export`, `audit.export`, `platform.audit_export`, `customer.export`, `member.export`, `organization.export`, `platform.organization_export`.
- Sem Recharts: barras em CSS. Sem comentários óbvios. Erros de regra sem campo = `RuleError`; com campo = `FieldError`.
- Testes no banco dev: ids escalares de limpeza iniciam com `""`; auditoria é append-only (usar empresas de teste próprias e filtrar por elas); não matar vitest no meio.
- Rodar testes: `set -a; . ./.env; set +a; export TEST_DATABASE_URL=$DATABASE_URL TEST_DIRECT_URL=$DIRECT_URL; npx vitest run <arquivo>`. Só os arquivos tocados por task; suíte completa 1x na Task 10.
- UI: invocar `/frontend-design` (+ `/ui-ux-pro-max` nas Tasks 5 e 6) antes de implementar; usuário valida a UI no navegador.
- Nunca executar `git add/commit/push`; só sugerir mensagem de commit no fim de cada task.

## Review Focus

- Mês sem lançamentos: relatório sem divisão por zero, percentuais 0, barras vazias.
- Descrição de lançamento com `;`, aspas, quebra de linha ou iniciando em `= + - @` (injeção de fórmula no Excel): CSV escapa e neutraliza.
- Filtros de auditoria com data inválida, cursor inválido ou `entityId` de outra empresa: resposta vazia/erro de campo, nunca vazamento.
- `describeEvent` com `before/after` nulos, campos ausentes e `action` desconhecida: frase genérica, sem exceção.
- Exportar cliente anonimizado e empresa sem pedidos: JSON válido, sem PII, listas vazias.
- Estorno de pedido cancelado e lançamentos excluídos (`deletedAt`): não somam errado no relatório; excluídos ficam fora do CSV.
- Verificação de cadeia com 0 eventos: "íntegra (0 eventos)".

---

## File Structure

- `lib/permissions.ts` (mod): `"company.export"`.
- `lib/csv.ts` (new): escrita de CSV pt-BR.
- `lib/audit-verify.ts` (new) + `scripts/audit-verify.ts` (mod): verificação de cadeia compartilhada.
- `features/audit/describe.ts` (new): `describeEvent`, grupos de ação.
- `features/audit/queries.ts` (new): listagem, detalhe, histórico, verificação por escopo.
- `features/audit/actions.ts` (new): `verifyChainAction`.
- `features/reports/service.ts` (new), `features/reports/pdf.ts` (new), `features/reports/csv.ts` (new).
- `features/exports/service.ts` (new): JSON de cliente, membro, empresa.
- `features/transactions/service.ts` (mod): exportar `sumByType`.
- `components/organisms/AuditTimeline.tsx`, `AuditFilters.tsx`, `AuditDetail.tsx` (new); `components/organisms/ReportView.tsx` (new); `components/molecules/BarList.tsx` (new). Seguir a camada atomic exigida pelo lint (ver `eslint.config.mjs`).
- `app/(app)/relatorios/page.tsx` (mod) + `relatorios/[mes]/relatorio.pdf/route.ts`, `lancamentos.csv/route.ts` (new).
- `app/(app)/configuracoes/auditoria/page.tsx` (mod) + `auditoria.csv/route.ts` (new).
- `app/(plataforma)/plataforma/auditoria/page.tsx` + `auditoria.csv/route.ts` (new); `PlatformNav` (mod).
- Rotas JSON: `app/(app)/clientes/[id]/dados.json/route.ts`, `app/(app)/configuracoes/equipe/[userId]/dados.json/route.ts`, `app/(app)/configuracoes/exportar/empresa.json/route.ts`, `app/(plataforma)/plataforma/empresas/[id]/empresa.json/route.ts` (new).
- Páginas `pedidos/[id]`, `clientes/[id]`, edição de lançamento (mod): seção Histórico.

---

### Task 1: Fundação — permissão, CSV, verificação de cadeia

**Files:**
- Modify: `lib/permissions.ts`, `lib/permissions.test.ts`, `scripts/audit-verify.ts`
- Create: `lib/csv.ts`, `lib/csv.test.ts`, `lib/audit-verify.ts`, `lib/audit-verify.test.ts`

**Interfaces:**
- Produces:
  - `"company.export": ADMIN` em `PERMISSIONS`.
  - `lib/csv.ts`: `toCsv(header: string[], rows: (string | number | null)[][]): string` (BOM + `;` + CRLF; texto iniciando em `= + - @` recebe `'` na frente; aspas/`;`/quebra → campo entre aspas com aspas duplicadas); `csvMoney(cents: number): string` (`-1234,56`); `csvDate(iso: string): string` (`dd/mm/aaaa`).
  - `lib/audit-verify.ts`: `type ChainRow` = campos de `AuditLog` usados em `HashedFields` + `seq: bigint | number`, `prevHash`, `hash`; `verifyRows(rows: ChainRow[], state?: Map<string | null, string | null>): { checked: number; broken: { seq: string; action: string; chain: string | null }[] }` (o `state` guarda o último hash por cadeia para permitir lotes sucessivos).

- [ ] **Step 1: Testes que falham.** `permissions.test.ts`: Funcionário `can(..., "company.export") === false`, Admin true. `csv.test.ts`: `toCsv(["a"], [["x;y"]])` começa com `﻿`, contém `"x;y"`; `["=1+1"]` vira `'=1+1`; `["a\"b"]` vira `"a""b"`; `csvMoney(123456) === "1234,56"`, `csvMoney(-5) === "-0,05"`; `csvDate("2026-10-05") === "05/10/2026"`. `audit-verify.test.ts`: constrói cadeia de 3 linhas com `computeHash` (chave fixa passada via `env` de teste ou helper que chama `computeHash(prev, fields, "k")` — `verifyRows` recebe `key?: string` opcional como 3º parâmetro): íntegra → `broken = []`; `prevHash` errado na 2ª → 1 quebrado; hash adulterado na 3ª → 1 quebrado; evento do meio removido → o seguinte quebra; lista vazia → `checked 0`.
- [ ] **Step 2: Rodar e ver falhar** (`npx vitest run lib/csv.test.ts lib/audit-verify.test.ts lib/permissions.test.ts`) — Expected: FAIL, módulos/permissão inexistentes.
- [ ] **Step 3: Implementar** os três arquivos e a permissão; `scripts/audit-verify.ts` passa a chamar `verifyRows` (mantendo as mensagens e o `process.exit(1)` quando quebrado).
- [ ] **Step 4: Rodar** os mesmos testes — Expected: PASS. Rodar `npx tsx scripts/audit-verify.ts` não é necessário (dev tem 5 legados).
- [ ] **Step 5:** sugerir commit `feat(fase5): permissão company.export, csv pt-BR e verificação de cadeia compartilhada`.

---

### Task 2: `describeEvent` (frases humanas)

**Files:**
- Create: `features/audit/describe.ts`, `features/audit/describe.test.ts`

**Interfaces:**
- Consumes: formato de `AuditLog` (`userName`, `userRole`, `action`, `entityType`, `result`, `before`, `after`, `reason`).
- Produces:
  - `type DescribableEvent = { action: string; userName: string | null; userRole: string | null; result: "SUCCESS" | "DENIED" | "FAILURE"; entityType: string | null; before: unknown; after: unknown }` (ajustar `result` aos valores reais de `AuditResult` em `prisma/schema.prisma`).
  - `describeEvent(e: DescribableEvent): { text: string; tone: "normal" | "alert" }`.
  - `ACTION_GROUPS: Record<"lancamentos" | "pedidos" | "clientes" | "equipe" | "configuracoes" | "acesso" | "exportacoes" | "negados", { label: string; prefixes: string[] }>` e `groupWhere(group: keyof typeof ACTION_GROUPS): object` (cláusula Prisma por prefixo de `action`; `negados` = `result: "DENIED"`).

- [ ] **Step 1: Testes.** Um caso por action existente (levantar a lista com `grep -rhn "action: \"" features lib app | sort -u` e cobrir todas as das Fases 1–5); `transaction.update` com `amountCents` 8000→9500 contém `R$ 80,00` e `R$ 95,00`; `DENIED` → `tone: "alert"` e texto começa com "Acesso negado"; `userRole === "MASTER"` → sufixo `(MASTER)`; ação desconhecida → `"Maria executou foo.bar"`; `before: null, after: null` não lança; `userName: null` → "Sistema".
- [ ] **Step 2: Rodar** `npx vitest run features/audit/describe.test.ts` — FAIL.
- [ ] **Step 3: Implementar** com mapa `action → (e) => string`; moeda via `brl` de `features/transactions/pdf-kit.ts`; campos lidos defensivamente (`typeof === "number"`).
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5:** commit `feat(fase5): frases humanas para eventos de auditoria`.

---

### Task 3: Consultas de auditoria (lista, detalhe, histórico, verificação)

**Files:**
- Create: `features/audit/queries.ts`, `features/audit/actions.ts`, `tests/audit-queries.test.ts`

**Interfaces:**
- Consumes: `withScope`, `authorize`, `verifyRows`, `groupWhere`, `describeEvent`; `assertMaster`/`PlatformActor` de `features/platform/service.ts`.
- Produces:
  - `type AuditFilters = { from?: string; to?: string; userId?: string | "master" | "system"; group?: keyof typeof ACTION_GROUPS; result?: "SUCCESS" | "DENIED"; entityType?: string; entityId?: string; organizationId?: string | "platform" }` e `type AuditCursor = string` (seq).
  - `type AuditEventRow = { id: string; seq: string; occurredAt: Date; userName: string | null; userRole: string | null; action: string; entityType: string | null; entityId: string | null; result: string; reason: string | null; ip: string | null; device: string | null; userAgent: string | null; requestId: string | null; before: unknown; after: unknown; hash: string; text: string; tone: "normal" | "alert" }`.
  - `listAuditEvents(ctx: TenantContext, f: AuditFilters, cursor?: AuditCursor): Promise<{ rows: AuditEventRow[]; next: AuditCursor | null }>` (`authorize "audit.view"`, 50 por página, `occurredAt desc, seq desc`, escopo da empresa).
  - `listAuditEventsPlatform(actor: PlatformActor, f: AuditFilters, cursor?: AuditCursor)` (mesma forma; `assertMaster`; `withScope({ platform: true })`).
  - `exportAuditRows(scope, f): Promise<AuditEventRow[]>` (recusa com `RuleError` se > 50.000).
  - `recordHistory(ctx, ref: { type: "Transaction" | "Order" | "Customer"; id: string }): Promise<AuditEventRow[]>` (cronológico asc, máx. 200; regras de pedido/cliente da spec; `authorize "audit.view"`).
  - `verifyOrgChain(ctx): Promise<{ checked: number; broken: { seq: string; action: string }[] }>` e `verifyPlatformChains(actor, target: "all" | "platform" | string)`: leitura por `seq asc` em lotes de 1.000, `verifyRows` com `state` compartilhado entre lotes; não auditam.
  - `actions.ts`: `verifyChainAction` (retorna o resultado serializável para a UI; Server Action via `toFormState`/padrão do repo).

- [ ] **Step 1: Testes de integração** (`tests/audit-queries.test.ts`, empresas de teste A e B criadas no `beforeAll` com eventos por `appendAudit`): Admin A lista só eventos de A (nenhum de B nem da plataforma); Funcionário → `ForbiddenError` + evento DENIED; filtro por `userId`, `group`, período e `entityId`; paginação por cursor sem repetir nem pular (criar 120 eventos); `entityId` de B consultado por A → vazio; `exportAuditRows` com limite reduzido por parâmetro de teste recusa; `recordHistory` de pedido inclui eventos `Order`, `OrderPayment` e `Transaction` com `orderId`; de cliente inclui `order.create` dos pedidos dele; empresa sem eventos → `verifyOrgChain` = `{ checked: 0, broken: [] }`; cadeia criada pelos testes → íntegra; MASTER lista tudo e filtra `organizationId: "platform"`; não-MASTER recusado.
- [ ] **Step 2: Rodar** `npx vitest run tests/audit-queries.test.ts` — FAIL.
- [ ] **Step 3: Implementar** as funções; filtros inválidos (data fora do formato, cursor não numérico) viram `FieldError` no campo; `userId: "master"` filtra `userRole = 'MASTER'`, `"system"` filtra `userId null`.
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5:** commit `feat(fase5): consultas de auditoria, histórico por registro e verificação de cadeia`.

---

### Task 4: Serviço do relatório mensal

**Files:**
- Modify: `features/transactions/service.ts` (exportar `sumByType`)
- Create: `features/reports/service.ts`, `tests/reports.test.ts`

**Interfaces:**
- Consumes: `getFinancialSettings`, `financialMonthRange`, `shiftMonth`, `amountToReceive`, `toDate`.
- Produces: `monthlyReport(ctx: TenantContext, ym: YearMonth): Promise<MonthlyReport>` com `authorize "report.view"` e
  `MonthlyReport = { month: YearMonth; range: { from: string; to: string }; incomeCents: number; expenseCents: number; profitCents: number; incomeByCategory: CategoryTotal[]; expenseByCategory: CategoryTotal[]; last6: { month: YearMonth; incomeCents: number; expenseCents: number; profitCents: number }[]; toReceiveCents: number; orders: { created: { count: number; totalCents: number }; delivered: { count: number; totalCents: number }; canceled: { count: number; refundedCents: number } } }`, `CategoryTotal = { name: string; totalCents: number; pct: number }` (pct inteiro 0–100, 0 quando total 0; ordenado por valor desc).

- [ ] **Step 1: Testes** (`tests/reports.test.ts`, empresa de teste com `monthStartDay = 5`): totais iguais a `monthSummary`/`listTransactions.totals` para o mesmo mês; soma por categoria = total do tipo; estorno (categoria sistema `ORDER_REFUND`) aparece em `expenseByCategory`; lançamento com `deletedAt` não conta; `last6` tem 6 itens consecutivos terminando no mês pedido, inclusive virada de ano; mês vazio → totais 0 e `pct` 0; pedido criado/entregue/cancelado no mês conta nos blocos certos (`canceledAt` no fuso da empresa); Funcionário → `ForbiddenError` + DENIED.
- [ ] **Step 2: Rodar** `npx vitest run tests/reports.test.ts` — FAIL.
- [ ] **Step 3: Implementar** `monthlyReport` numa única `withScope`; faixas dos 6 meses via `financialMonthRange(shiftMonth(ym, -i), startDay)`; categorias por `groupBy categoryId` + nome; pedidos por consultas `count/sum` por `createdAt`/`deliveredOn`/`canceledAt` (checar nomes reais no `schema.prisma`).
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5:** commit `feat(fase5): serviço do relatório mensal`.

---

### Task 5: UI do relatório + PDF + CSV

**Files:**
- Create: `features/reports/pdf.ts`, `features/reports/csv.ts`, `features/reports/pdf.test.ts`, `features/reports/csv.test.ts`, `components/molecules/BarList.tsx`, `components/organisms/ReportView.tsx`, `app/(app)/relatorios/[mes]/relatorio.pdf/route.ts`, `app/(app)/relatorios/[mes]/lancamentos.csv/route.ts`
- Modify: `app/(app)/relatorios/page.tsx`

**Interfaces:**
- Consumes: `monthlyReport`, `toCsv/csvMoney/csvDate`, `beginDocument`/`brl`/`ReceiptOrg` do `pdf-kit`, `loadOrderReceiptData` como modelo de carregar `ReceiptOrg` + logo (`features/orders/receipt.ts`).
- Produces:
  - `buildReportPdf(org: ReceiptOrg, r: MonthlyReport, generatedBy: string, generatedAt: Date): Promise<Uint8Array>`.
  - `transactionsCsv(ctx: TenantContext, ym: YearMonth): Promise<string>` (`authorize "report.export"`; colunas `Data;Tipo;Categoria;Forma de pagamento;Descrição;Pedido;Valor`; não excluídos; ordenado por data).
  - Rotas GET: `403` Funcionário, `404` mês inválido (`parseYearMonth`); gravam `report.export` (`after: { month, format }`) via `withAudit` antes de responder; `Content-Disposition: attachment`.
  - Página `/relatorios?mes=YYYY-MM`: `AdminOnlyNotice` para quem não tem `report.view` (padrão das outras telas), seletor de mês da Fase 3, KPIs, `BarList` de entradas e saídas, tabela dos 6 meses, bloco de pedidos, "A receber hoje".

- [ ] **Step 1: Testes.** `csv.test.ts` (integração, mesma empresa de teste): cabeçalho exato, BOM, linha de saída com valor negativo, descrição com `;` e `=` escapada, excluído ausente, sem payer. `pdf.test.ts`: `buildReportPdf` devolve bytes iniciando com `%PDF` e não lança com mês vazio e com logo `null`.
- [ ] **Step 2: Rodar** `npx vitest run features/reports` — FAIL.
- [ ] **Step 3: Invocar `/frontend-design` e `/ui-ux-pro-max`; implementar** módulos, rotas e página (desktop duas colunas, celular empilha; barras CSS com valor ao lado; rótulo "posição de hoje" em A receber).
- [ ] **Step 4: Rodar** testes — PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** usuário valida no navegador (1280px e 390px; abrir o CSV no Excel/Numbers e conferir acentos). Commit `feat(fase5): tela de relatórios com PDF e CSV`.

---

### Task 6: Auditoria da empresa (tela, detalhe, verificar, CSV)

**Files:**
- Create: `components/organisms/AuditTimeline.tsx`, `AuditFilters.tsx`, `AuditDetail.tsx`, `app/(app)/configuracoes/auditoria/auditoria.csv/route.ts`
- Modify: `app/(app)/configuracoes/auditoria/page.tsx`

**Interfaces:**
- Consumes: `listAuditEvents`, `exportAuditRows`, `verifyChainAction`, `toCsv`, `AuditEventRow`, `AuditFilters`.
- Produces:
  - `AuditTimeline({ rows, next, showCompany?: boolean })` (linha = frase + quando no fuso da empresa + dispositivo; "Carregar mais" por cursor via querystring `cursor`), `AuditFilters` (período, pessoa, grupo, resultado, registro; estado na URL), `AuditDetail` (Sheet no desktop / Drawer no celular; tabela campo | antes | depois, motivo, IP, user agent, `requestId`, resultado, `seq`, hash curto; botão "Verificar integridade" mostra "Cadeia íntegra (N eventos)" ou "N eventos com problema" + primeiros `seq`).
  - Rota `auditoria.csv` com os filtros da querystring: grava `audit.export` (`after: filtros`), colunas data/hora, pessoa, papel, ação, frase, registro, resultado, motivo, IP.
  - Página usa `AdminOnlyNotice` para Funcionário (hoje redireciona).

- [ ] **Step 1: Teste** do CSV de auditoria em `tests/audit-queries.test.ts` (acrescentar): cabeçalho, linha escapada, evento `audit.export` gravado, Funcionário 403.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Invocar `/frontend-design` e `/ui-ux-pro-max`; implementar** organisms, página e rota.
- [ ] **Step 4: Rodar** teste — PASS; `npx tsc --noEmit` e `npx eslint` nos arquivos tocados.
- [ ] **Step 5:** usuário valida (filtros, detalhe, verificar; os 5 legados SHA-256 do dev aparecem quebrados — esperado). Commit `feat(fase5): auditoria da empresa com filtros, detalhe, verificação e CSV`.

---

### Task 7: Auditoria global da plataforma

**Files:**
- Create: `app/(plataforma)/plataforma/auditoria/page.tsx`, `app/(plataforma)/plataforma/auditoria/auditoria.csv/route.ts`
- Modify: `PlatformNav` (localizar com `grep -rn PlatformNav components`), `features/audit/actions.ts` (ação de verificar plataforma)

**Interfaces:**
- Consumes: `listAuditEventsPlatform`, `verifyPlatformChains`, os organisms da Task 6 (`showCompany`), `requireMaster`, `platformActor`.
- Produces: página com filtro extra Empresa (todas | "Plataforma" | empresa), verificar da empresa filtrada/plataforma/todas; CSV grava `platform.audit_export` na cadeia da plataforma (via `recordAudit(actor, ...)` antes do corpo); link "Auditoria" no nav.

- [ ] **Step 1: Teste** (em `tests/audit-queries.test.ts`): rota/serviço de CSV global recusa não-MASTER; evento `platform.audit_export` aparece com `organizationId null`.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar** reusando os organisms; nenhum componente novo além do filtro de empresa.
- [ ] **Step 4: Rodar** — PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** usuário valida como MASTER. Commit `feat(fase5): auditoria global da plataforma`.

---

### Task 8: Histórico por registro

**Files:**
- Modify: `app/(app)/pedidos/[id]/page.tsx`, `app/(app)/clientes/[id]/page.tsx`, a tela/modal de edição de lançamento (localizar o componente que renderiza `lancamentos/[id]`)
- Create: `components/organisms/RecordHistory.tsx`

**Interfaces:**
- Consumes: `recordHistory`, `AuditTimeline`/`AuditDetail`, `can(role, "audit.view")`.
- Produces: `RecordHistory({ rows, auditHref })` — linha do tempo cronológica com "Ver tudo na auditoria" → `/configuracoes/auditoria?entityType=…&entityId=…`; seção só renderizada e só consultada quando `can(role, "audit.view")`.

- [ ] **Step 1: Teste** (acrescentar em `tests/audit-queries.test.ts`): `recordHistory` de lançamento de outra empresa → vazio; Funcionário não chama a consulta (a página não busca — cobrir com teste do helper `canSeeHistory(role)` se criado, senão pelo `authorize` já testado na Task 3).
- [ ] **Step 2: Rodar** — FAIL/PASS conforme o que for novo.
- [ ] **Step 3: Invocar `/frontend-design`; implementar** seção nas três telas.
- [ ] **Step 4: Rodar** `npx tsc --noEmit` e testes tocados.
- [ ] **Step 5:** usuário valida com um pedido que tem recebimentos e com um cliente. Commit `feat(fase5): histórico por pedido, cliente e lançamento`.

---

### Task 9: Exportação LGPD (cliente, membro, empresa)

**Files:**
- Create: `features/exports/service.ts`, `tests/exports.test.ts`, as 4 rotas `.json` listadas na File Structure
- Modify: botões em `app/(app)/clientes/[id]/page.tsx`, `app/(app)/configuracoes/equipe` (linha do membro), `app/(app)/configuracoes/page.tsx` (card com aviso "Contém dados pessoais de clientes e equipe. Guarde com cuidado."), `app/(plataforma)/plataforma/empresas/[id]`

**Interfaces:**
- Consumes: `withAudit`, `recordAudit`, padrão de MASTER na empresa de `features/platform/service.ts` (`auditRole: "MASTER"`), `OrganizationSettings.dpo*`.
- Produces:
  - `exportCustomerData(ctx: TenantContext, id: string): Promise<object | null>` (`authorize "customer.export"`; dados sem máscara, pedidos, recebimentos, controladora e DPO, `exportedAt`; evento `customer.export` `after: { format: "json" }` na mesma tx).
  - `exportMemberData(ctx: TenantContext, userId: string): Promise<object | null>` (`authorize "member.manage"`; nome, e-mail, telefone, papel, ativo, datas do vínculo, último acesso, aceites; evento `member.export`).
  - `exportOrganizationData(ctx: TenantContext): Promise<object>` (`authorize "company.export"`; `schemaVersion: 1`, `organization`, `settings`, `categories`, `paymentMethods`, `productTypes`, `customers`, `orders`, `orderPayments`, `transactions` com `hasReceipt` sem arquivos, `members` (nome, e-mail, papel, ativo), `exportedAt`; sem `passwordHash`, tokens, hashes de convite, sessões, auditoria; uma `withScope` única; evento `organization.export`).
  - `exportOrganizationDataAsMaster(actor: PlatformActor, organizationId: string): Promise<object>` (`assertMaster`; mesmo conteúdo; evento `platform.organization_export` na cadeia da empresa com papel MASTER).
  - Rotas: `Content-Disposition: attachment; filename="cliente-{id}.json"` / `membro-{id}.json` / `empresa-{slug}.json`; 403 sem permissão, 404 inexistente; `Cache-Control: private, no-store`.

- [ ] **Step 1: Testes** (`tests/exports.test.ts`): cliente exportado traz documento/telefone sem máscara e só os pedidos dele; cliente anonimizado exporta sem PII; Funcionário negado + DENIED nas três; export da empresa não contém as chaves `passwordHash`, `tokenHash` (varrer o JSON serializado por regex `/passwordHash|tokenHash|sessionToken/`), contagens iguais às do banco, empresa vazia → listas vazias; membro de outra empresa → `null`; MASTER gera `platform.organization_export` com `userRole = 'MASTER'` na cadeia da empresa; cada export deixa exatamente 1 evento.
- [ ] **Step 2: Rodar** `npx vitest run tests/exports.test.ts` — FAIL.
- [ ] **Step 3: Implementar** serviço e rotas (auditar antes de montar a `Response`; se `withAudit` falhar a exceção propaga e nada é entregue).
- [ ] **Step 4: Rodar** — PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** usuário valida os downloads. Commit `feat(fase5): exportação de dados (cliente, membro, empresa) em JSON`.

---

### Task 10: Fechamento — docs, suíte, builds

**Files:**
- Modify: `README.md` (funcionalidades, rotas), `docs/CODEBASE_MAP.md` (features/audit, reports, exports; telas novas), `CLAUDE.md` só se surgir regra nova.

- [ ] **Step 1:** Rodar suíte completa 1x: `set -a; . ./.env; set +a; export TEST_DATABASE_URL=$DATABASE_URL TEST_DIRECT_URL=$DIRECT_URL; npx vitest run` — Expected: tudo PASS.
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint .` limpos; `npx next build` sem erros (frontend; o projeto não tem backend separado).
- [ ] **Step 3:** Atualizar README e `docs/CODEBASE_MAP.md`.
- [ ] **Step 4:** `graphify update .` se `graphify-out/graph.json` existir.
- [ ] **Step 5:** Code review (opus) só se o usuário reativar; senão informar que está pausado. Sugerir mensagem de commit final `docs(fase5): atualizar README e mapa da base de código`.

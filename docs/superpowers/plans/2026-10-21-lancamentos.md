# Fase 3 — Lançamentos + Início · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar entradas e saídas (com comprovante privado e recibo em PDF), listar com filtros por mês financeiro, ligar o Início aos totais reais e permitir ao Admin gerenciar categorias e formas de pagamento.

**Architecture:** `features/transactions/` (domínio puro → schemas → service com `TenantContext` + `authorize` + `withAudit` → actions finas) e `features/catalog/` (categorias e formas de pagamento). Comprovante em Vercel Blob privado, servido por route handler autenticado. Recibo em PDF gerado no servidor (pdf-lib). Telas desktop-first.

**Tech Stack:** Next 16.4, Prisma 7 + Neon (RLS), Auth.js v5, Zod 4, Vitest 5, Tailwind 4 + shadcn, `@vercel/blob` 2.8.2 (`access: "private"`), `pdf-lib`, `sharp` (logo WebP → PNG para o PDF).

**Spec:** `docs/superpowers/specs/2026-10-21-lancamentos-design.md` — ler junto; o plano não repete mensagens, regras de tela e eventos que a spec fixa.

## Global Constraints

- Node 22.16.0 (`.nvmrc` = 22; o hook do zsh troca sozinho). Prefixo seguro em subagentes: `source ~/.nvm/nvm.sh && nvm use 22.16.0 >/dev/null &&`.
- Next 16.4: ler `node_modules/next/dist/docs/` antes de usar route handlers, params assíncronos, Server Actions, `revalidatePath`.
- Valores sempre `Int` em centavos; formatar BRL só na interface (`formatCents` de `components/atoms/MoneyText/format.ts`). Máximo 100_000_000 centavos.
- Data do lançamento: `occurredOn` (Date sem hora); nunca futura em relação a "hoje" no fuso da empresa.
- Toda escrita em `withAudit(ctx, event, fn)`; toda checagem de papel em `authorize(ctx, action)` (nega e audita DENIED). Permissões existentes: `transaction.view/create/update/delete`, `profit.view`, `settings.manage`. Sem permissões novas.
- Funcionário nunca recebe `profitCents`: o service omite o campo (não só a UI).
- RLS: `Transaction`, `Category`, `PaymentMethod`, `OrganizationSettings` só dentro de `withScope`/`withAudit`. Organização (dados do recibo) não está sob RLS.
- Comprovante: `put(path, file, { access: "private" })`; `receiptUrl` guarda o **pathname**; nunca expor URL do Blob ao cliente. Tipos `image/jpeg|png|webp`, `application/pdf`; máx. 3_145_728 bytes. `serverActions.bodySizeLimit` = `"4mb"`.
- `payerName`/`payerDocument` só em entradas; `payerDocument` só dígitos, CPF/CNPJ válido (`isValidDocument` de `lib/document.ts`); mascarado na auditoria (`maskPii` de `lib/logger.ts` ou máscara equivalente: manter 3 primeiros e 2 últimos dígitos).
- eslint boundaries: molecules/organisms não importam `features/` nem `components/ui` (usar atoms wrappers; actions como props). Desktop-first; utilizável em 390px.
- Textos em pt-BR. **Git:** nenhum agente executa `git add/commit/push/branch`; cada task só propõe a mensagem.
- Integração: `set -a && source .env && set +a && TEST_DATABASE_URL="$DATABASE_URL" TEST_DIRECT_URL="$DIRECT_URL" pnpm vitest run <arquivo>` (dev DB por design; limpar o que criar; padrão de `tests/platform.test.ts`). O Blob é **mockado** nos testes (`vi.mock("@/features/transactions/storage")`) — nenhum teste sobe arquivo de verdade.

## Review Focus

1. **Fuso perto da meia-noite** — 23:30 de 31/10 em Fortaleza já é 01/11 em UTC; "hoje", o mês atual e a recusa de data futura devem usar o fuso da empresa. Teste: Task 1 (`todayIn("America/Fortaleza", 2026-11-01T02:30Z)` → 2026-10-31).
2. **Valor digitado com formatos variados** — "1.234,56", "1234,5", "R$ 10", "0,00", "-5" → centavos certos ou erro claro. Teste: Task 1 (`parseBrl`).
3. **Funcionário burlando a UI** — chamar a action de excluir, de categoria ou ler totais: negado/omitido no service. Teste: Task 3 e Task 4.
4. **Arquivo órfão / vazado** — falha na transação apaga o upload novo; comprovante de outra empresa ou de lançamento excluído nunca é servido. Teste: Task 3 (storage mock recebe `del`) e Task 5.
5. **Lançamento com categoria desativada editado** — manter a categoria antiga deve funcionar; trocar para outra desativada não. Teste: Task 3.

---

### Task 1: Domínio puro — mês financeiro, dinheiro e schemas

**Files:**
- Create: `features/transactions/period.ts`, `features/transactions/period.test.ts`
- Create: `features/transactions/money.ts`, `features/transactions/money.test.ts`
- Create: `features/transactions/schemas.ts`, `features/transactions/schemas.test.ts`
- Create: `features/catalog/schemas.ts`, `features/catalog/schemas.test.ts`

**Interfaces (Produces):**
- `type YearMonth = { year: number; month: number }` (month 1–12)
- `todayIn(timezone: string, now?: Date): string` → `"YYYY-MM-DD"`
- `currentFinancialMonth(startDay: number, timezone: string, now?: Date): YearMonth`
- `financialMonthRange(ref: YearMonth, startDay: number): { from: string; to: string }` (datas ISO inclusivas, `to` = dia startDay−1 do mês seguinte; startDay 1 → último dia do mês)
- `parseYearMonth(v: string | undefined): YearMonth | null` (`"2026-10"`), `formatYearMonth(ym): string`, `shiftMonth(ym, delta): YearMonth`
- `monthLabel(ref: YearMonth, startDay: number): { title: string; range: string | null }` → `{ title: "Outubro de 2026", range: "5/10 a 4/11" | null }`
- `parseBrl(input: string): number | null` (centavos; null se inválido, ≤ 0 ou > 100_000_000)
- `valorPorExtenso(cents: number): string`
- `transactionSchema` → `TransactionInput = { type: "INCOME"|"EXPENSE"; amountCents: number; occurredOn: string; categoryId: string; paymentMethodId?: string; description: string; payerName?: string; payerDocument?: string; removeReceipt?: boolean }` — `amount` chega como texto BRL e vira `amountCents` via `parseBrl`; strings vazias → undefined; `payerDocument` só dígitos + `isValidDocument`; se `type === "EXPENSE"` e houver payer → erro em `payerName`. Data futura é checada no service (precisa do fuso).
- `listFiltersSchema` → `{ month?: YearMonth; type?: "INCOME"|"EXPENSE"; categoryId?: string; page: number }` a partir de `?mes=&tipo=entrada|saida&categoria=&pagina=`
- `categorySchema` → `{ name: string; type: "INCOME"|"EXPENSE" }`, `paymentMethodSchema` → `{ name: string }` (nome trim, 2–40)

- [ ] **Step 1: Testes que falham**
  - `todayIn("America/Fortaleza", new Date("2026-11-01T02:30:00Z"))` = `"2026-10-31"`
  - `currentFinancialMonth(5, "America/Fortaleza", new Date("2026-11-03T15:00:00Z"))` = `{ year: 2026, month: 10 }`; `currentFinancialMonth(1, …, 2026-11-03)` = `{ 2026, 11 }`
  - `financialMonthRange({2026,10}, 1)` = `{ from: "2026-10-01", to: "2026-10-31" }`; `({2026,10}, 5)` = `{ "2026-10-05", "2026-11-04" }`; `({2026,12}, 5)` = `{ "2026-12-05", "2027-01-04" }`; `({2027,2}, 1).to` = `"2027-02-28"`
  - `monthLabel({2026,10}, 5)` = `{ title: "Outubro de 2026", range: "5/10 a 4/11" }`; com 1 → `range: null`
  - `parseBrl("1.234,56")` 123456; `"1234,5"` 123450; `"R$ 10"` 1000; `"0,00"` null; `"-5"` null; `"abc"` null; `"1.000.000,01"` null
  - `valorPorExtenso(1)` "um centavo"; `100` "um real"; `2150` "vinte e um reais e cinquenta centavos"; `10000` "cem reais"; `100110` "mil e um reais e dez centavos"; `15000` "cento e cinquenta reais"; `100000000` "um milhão de reais"
  - `transactionSchema`: saída com `payerName` → erro em `payerName`; `payerDocument: "111.111.111-11"` → erro; `amount: "0"` → erro "Informe um valor maior que zero."; descrição de 1 caractere → erro
  - `categorySchema` nome `" a "` → erro; `"Insumos"` ok
- [ ] **Step 2:** `pnpm vitest run features/transactions features/catalog` → FAIL
- [ ] **Step 3:** Implementar (datas com `Intl.DateTimeFormat(..., { timeZone })`, sem libs novas)
- [ ] **Step 4:** → PASS
- [ ] **Step 5:** Propor commit `feat(lancamentos): domínio de mês financeiro, valores e schemas`

---

### Task 2: Migration, storage do comprovante e config

**Files:**
- Modify: `prisma/schema.prisma` (Transaction: `payerName String?`, `payerDocument String?`)
- Create: `prisma/migrations/20261021000300_transaction_payer/migration.sql` (colunas + `ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amountCents_positive" CHECK ("amountCents" > 0)`)
- Create: `features/transactions/storage.ts` (server-only)
- Modify: `next.config.ts` (`bodySizeLimit: "4mb"`; comentário atualizado)
- Modify: `package.json` (`pnpm add pdf-lib sharp`)

**Interfaces (Produces):**
- `receiptUploadEnabled(): boolean`
- `uploadReceipt(organizationId: string, transactionId: string, file: File): Promise<string>` → pathname `org/{org}/receipts/{tx}-{Date.now()}.{ext}` (ext por MIME), `access: "private"`, valida MIME/tamanho (lança `FieldError("receipt", …)`)
- `deleteReceipt(pathname: string): Promise<void>` (ignora erro de "não encontrado"; loga outros com `logger`)
- `readReceipt(pathname: string): Promise<{ stream: ReadableStream; contentType: string } | null>`

- [ ] **Step 1:** Escrever migration e schema; aplicar com `pnpm db:migrate` (usa DIRECT_URL; permitido — dev DB) e `pnpm prisma generate`
- [ ] **Step 2:** Verificar: `psql`-free — script tsx temporário via `ownerClient()` tenta inserir `amountCents = 0` e confirma erro de CHECK; remover o script
- [ ] **Step 3:** Implementar `storage.ts` e config; `pnpm add pdf-lib sharp`
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm vitest run` (com TEST_*) → verdes; RLS/FKs intactas (suite de isolamento passa)
- [ ] **Step 5:** Propor commit `feat(lancamentos): pagador no lançamento, check de valor e storage privado`

---

### Task 3: Service de lançamentos

**Files:**
- Create: `features/transactions/service.ts`, `tests/transactions.test.ts`

**Interfaces:**
- Consumes: Task 1 (schemas, period), Task 2 (storage), `withAudit`, `withScope`, `authorize`, `can`, `diff`, `TenantContext`
- Produces:
  - `getFinancialSettings(ctx): Promise<{ startDay: number; timezone: string }>`
  - `type TransactionRow = { id; type; amountCents; occurredOn: string; description; category: { id; name; active }; paymentMethod: { id; name; active } | null; payerName: string | null; hasReceipt: boolean }`
  - `listTransactions(ctx, filters): Promise<{ rows: TransactionRow[]; page: number; pageCount: number; totals: { incomeCents: number; expenseCents: number; profitCents?: number }; month: YearMonth; range: { from; to } }>` — 50 por página, ordem `occurredOn desc, createdAt desc`, ignora excluídos; totais do filtro (mês + tipo + categoria); `profitCents` só se `can(role, "profit.view")`
  - `monthSummary(ctx): Promise<{ month: YearMonth; incomeCents; expenseCents; profitCents? }>` (mês financeiro atual)
  - `createTransaction(ctx, input: TransactionInput, file?: File): Promise<{ id: string }>`
  - `updateTransaction(ctx, id, input: TransactionInput, file?: File): Promise<void>`
  - `deleteTransaction(ctx, id): Promise<void>` (soft delete; `authorize(ctx, "transaction.delete")`)
  - `getTransaction(ctx, id): Promise<TransactionRow | null>`
  - `formOptions(ctx, current?: { categoryId?: string; paymentMethodId?: string }): Promise<{ categories: {id,name,type,active}[]; paymentMethods: {id,name,active}[] }>` (ativas + as atuais desativadas)
- Regras: categoria precisa existir na empresa, ser do mesmo `type` e estar ativa — exceto se for a categoria atual do lançamento em edição (idem forma de pagamento); data ≤ `todayIn(timezone)` → senão `FieldError("occurredOn", "A data não pode ser futura.")`; upload antes da transação com id pré-gerado (`crypto.randomUUID()`), `deleteReceipt(novo)` se a transação lançar; troca/remoção apaga o antigo **após** o commit; auditoria `transaction.create/update/delete` com `payerDocument` mascarado e `hasReceipt` em vez do pathname.

- [ ] **Step 1: Testes de integração que falham** (`vi.mock("@/features/transactions/storage")` com `uploadReceipt` retornando pathname fake e `deleteReceipt` espiado; prepara org com `monthStartDay` 5, um Admin e um Funcionário via owner client):
  - Admin cria entrada com pagador; auditoria `transaction.create` com `payerDocument` mascarado; `listTransactions` traz o lançamento e totais corretos
  - saída com `payerName` → `ZodError`/`FieldError` em `payerName`
  - categoria de saída numa entrada → `FieldError("categoryId")`; categoria de outra empresa → `FieldError("categoryId")`
  - data de amanhã (no fuso) → `FieldError("occurredOn")`
  - Funcionário cria e edita; `deleteTransaction` como Funcionário → `ForbiddenError` + DENIED `transaction.delete`; Funcionário em `listTransactions`/`monthSummary` não tem `profitCents` (`"profitCents" in totals === false`)
  - excluído some da lista e dos totais; `getTransaction` retorna null
  - totais respeitam o mês financeiro (lançamento em 04/11 conta em outubro com startDay 5)
  - editar lançamento com categoria agora desativada mantendo-a → ok; trocar para outra desativada → erro
  - falha na transação após upload (forçar com categoria inválida detectada dentro da tx ou mock) → `deleteReceipt` chamado com o pathname novo
  - trocar comprovante → `deleteReceipt` chamado com o antigo **depois** do update; `removeReceipt` → `receiptUrl` null
  - empresa B não lê nem edita lançamento da empresa A
- [ ] **Step 2:** → FAIL
- [ ] **Step 3:** Implementar
- [ ] **Step 4:** → PASS; suíte completa verde
- [ ] **Step 5:** Propor commit `feat(lancamentos): service com permissões, mês financeiro e auditoria`

---

### Task 4: Service de categorias e formas de pagamento

**Files:**
- Create: `features/catalog/service.ts`, `tests/catalog.test.ts`

**Interfaces (Produces):**
- `listCategories(ctx): Promise<{ id; name; type; active; usage: number }[]>`, `listPaymentMethods(ctx)` análogo
- `createCategory(ctx, input)`, `updateCategory(ctx, id, { name?: string; active?: boolean })` (tipo imutável)
- `createPaymentMethod(ctx, input)`, `updatePaymentMethod(ctx, id, { name?; active? })`
- Todas começam com `authorize(ctx, "settings.manage")`; unicidade sem diferenciar maiúsculas contando desativados → `FieldError("name", "Já existe 'X'.")` ou, se desativado, a mensagem da spec; P2002 mapeado para o mesmo erro; auditoria `category.create/update`, `payment_method.create/update`

- [ ] **Step 1: Testes que falham:** criar/renomear/desativar com auditoria; `"insumos"` quando existe `"Insumos"` → erro; nome igual a desativado → mensagem de reativar; Funcionário → `ForbiddenError` + DENIED `settings.manage`; `usage` conta só lançamentos não excluídos; desativada some de `formOptions` (Task 3) para lançamento novo
- [ ] **Step 2:** → FAIL · **Step 3:** Implementar · **Step 4:** → PASS
- [ ] **Step 5:** Propor commit `feat(configuracoes): categorias e formas de pagamento`

---

### Task 5: Rotas de comprovante e recibo (PDF)

**Files:**
- Create: `app/(app)/lancamentos/[id]/comprovante/route.ts`
- Create: `app/(app)/lancamentos/[id]/recibo.pdf/route.ts` (se o segmento com ponto não for suportado no Next 16.4, usar `recibo/route.ts` e ajustar o nome do download pelo `Content-Disposition`)
- Create: `features/transactions/receipt.ts` (server-only), `features/transactions/receipt.test.ts`
- Modify: `tests/transactions.test.ts`

**Interfaces (Produces):**
- `receiptNumber(tx: { id: string; occurredOn: string }): string` → `R-YYYY-MM-XXXXXX` (6 primeiros hex/alfanum. do id, maiúsculos)
- `receiptLines(data: ReceiptData): { heading: string[]; title: string; number: string; amount: string; amountWords: string; body: string; place: string; signature: string; footer: string }` (texto puro, testável)
- `buildReceiptPdf(data: ReceiptData): Promise<Uint8Array>` (pdf-lib, A4, fonte padrão Helvetica com WinAnsi — acentos pt-BR suportados; logo via `fetch(logoUrl)` → `sharp(...).png()` quando houver; falha no logo não impede o PDF)
- `loadReceiptData(ctx, id): Promise<ReceiptData | null>` (null se não for entrada da empresa ou estiver excluída; audita `transaction.receipt_issue` na mesma chamada via `withAudit`)
- `loadReceiptFile(ctx, id): Promise<{ stream; contentType } | null>` (lançamento da empresa, não excluído, com `receiptUrl`)
- Rotas: `requireTenant()` (sem sessão → redirect /login); 404 quando null; headers `Cache-Control: private, no-store`, `Content-Disposition: inline; filename="recibo-R-....pdf"` / nome do comprovante

- [ ] **Step 1: Testes que falham**
  - unit: `receiptNumber({ id: "cmvi77b4h…", occurredOn: "2026-10-15" })` = `"R-2026-10-CMVI77"`; `receiptLines` com pagador → body contém "Recebi(emos) de Ana Souza, CPF 123.456.789-09, a importância de R$ 150,00 (cento e cinquenta reais), referente a 20 camisas, pago via Pix."; sem pagador → body com "Recebi(emos) de ____________________"; sem forma → sem " pago via"; `place` = "Teresina, 15 de outubro de 2026"
  - unit: `buildReceiptPdf` retorna bytes que começam com `%PDF` e `PDFDocument.load(bytes).getPageCount() === 1`
  - integração: `loadReceiptData` para saída → null; outra empresa → null; excluído → null; entrada válida → dados + evento `transaction.receipt_issue`; `loadReceiptFile` sem `receiptUrl` → null; de outra empresa → null (storage mock)
- [ ] **Step 2:** → FAIL · **Step 3:** Implementar · **Step 4:** → PASS
- [ ] **Step 5:** Propor commit `feat(lancamentos): recibo em PDF e comprovante privado`

---

### Task 6: Server Actions

**Files:**
- Create: `features/transactions/actions.ts`, `features/catalog/actions.ts`

**Interfaces (Produces)** (`"use server"`; estado `FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string,string>; values?: Record<string, unknown> }`):
- `saveTransactionAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState>` — campos: `type`, `amount`, `occurredOn`, `categoryId`, `paymentMethodId`, `description`, `payerName`, `payerDocument`, `receipt` (File), `removeReceipt` ("on"); sucesso → `{ ok: true }` + `revalidatePath("/lancamentos")` e `revalidatePath("/inicio")`
- `deleteTransactionAction(id: string): Promise<FormState>`
- `saveCategoryAction(id: string | null, prev, fd)`, `setCategoryActiveAction(id, active: boolean)`, `savePaymentMethodAction(id | null, prev, fd)`, `setPaymentMethodActiveAction(id, active)` (validar `active` em runtime com `z.boolean()`)
- Contexto via `requireTenant()`; mapear `ZodError`/`FieldError`/`ForbiddenError` como em `features/platform/actions.ts`; documentar o contrato de campos no topo de cada arquivo

- [ ] **Step 1:** Implementar · **Step 2:** `pnpm typecheck && pnpm lint && pnpm vitest run` → verdes
- [ ] **Step 3:** Propor commit `feat(lancamentos): server actions de lançamentos e cadastros`

---

### Task 7: Tela de lançamentos (lista, formulário, recibo, exclusão)

Antes: invocar `/frontend-design` e `/ui-ux-pro-max`.

**Files:**
- Modify: `app/(app)/lancamentos/page.tsx` (server: lê `searchParams`, chama `listTransactions`, `formOptions`, `receiptUploadEnabled`)
- Create: `components/organisms/TransactionList/` (tabela ≥md, cartões <md, faixa de totais, filtros que escrevem na URL, seletor de mês, paginação)
- Create: `components/organisms/TransactionForm/` (Dialog via `AppDialog`; tela cheia <md; máscara BRL no valor; `type` troca categorias; seção "Recebido de" só em entrada; comprovante com preview/nome e "Remover"; "Salvar" e "Salvar e lançar outro"; Enter/Esc)
- Create: `components/molecules/ReceiptActions/` (Imprimir → `window.open(url)`; Baixar → `<a download>`; Compartilhar → `fetch(url)` → `File` → `navigator.canShare({ files })` ? `navigator.share` : download + dica)
- Create: `components/molecules/MoneyInput/` (máscara BRL, `inputMode="decimal"`)
- Reusar `ConfirmAction` (ou variante sem motivo) para excluir

- [ ] **Step 1:** Implementar consumindo Task 6 (actions como props)
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes
- [ ] **Step 3:** Propor commit `feat(lancamentos): tela de lançamentos com filtros, recibo e comprovante`

---

### Task 8: Início com totais reais + telas de cadastros

Antes: invocar `/frontend-design`.

**Files:**
- Modify: `app/(app)/inicio/page.tsx` (`monthSummary`, `monthLabel` no fuso da empresa; remove "A receber"; "+ Entrada"/"+ Saída" abrem `TransactionForm` no próprio Início; "+ Pedido" mantém link)
- Create: `app/(app)/configuracoes/categorias/page.tsx`, `app/(app)/configuracoes/formas-de-pagamento/page.tsx`
- Create: `components/organisms/CatalogTable/` (lista com uso, criar/renomear em Dialog, ativar/desativar)
- Create: `components/molecules/AdminOnlyNotice/` ("Só o Admin da empresa acessa esta área.")
- Modify: `app/(app)/configuracoes/page.tsx` (links para as duas telas; Funcionário vê o aviso em vez de redirect)

- [ ] **Step 1:** Implementar · **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → verdes
- [ ] **Step 3:** Propor commit `feat(inicio): totais reais do mês e cadastros de categorias e formas`

---

### Task 9: Validação ponta a ponta

- [ ] **Step 1:** Suíte completa (com TEST_*) → verde
- [ ] **Step 2:** `pnpm build` → verde; `pnpm audit:verify` → só os 5 eventos legados falham
- [ ] **Step 3:** `pnpm dev` (3004) + agent-browser, 1280px e 390px: Admin de empresa QA lança saída pelo Início (card atualiza) → entrada com pagador → filtrar por mês/tipo/categoria → editar → anexar comprovante (PNG) e abrir pela rota → gerar recibo (abrir PDF) → excluir; Funcionário: sem "Sobrou", sem excluir, aviso em categorias; Admin cria/desativa categoria. Screenshots `docs/screenshots/fase3-*`.
- [ ] **Step 4:** Code review opus da fase inteira; corrigir críticos
- [ ] **Step 5:** Propor mensagem de commit final; atualizar README (lançamentos, recibo, comprovante privado)

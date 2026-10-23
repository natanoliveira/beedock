# Fase 4 — Clientes e pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar clientes e pedidos, ligar cada recebimento a um lançamento de entrada na mesma transação e mostrar "A receber" e "Próximas entregas" no Início.

**Architecture:** Duas features novas (`features/customers`, `features/orders`) no padrão schema → service (`authorize` + `withAudit`) → action fina → organism. Sem tabela nova: uma migration adiciona `systemKey`, `Order.number`, `Order.deliveredOn`, `Transaction.orderId` e CHECKs. Recebimento e lançamento sempre mudam juntos sob `SELECT … FOR UPDATE` do pedido.

**Tech Stack:** Next.js 16, Prisma 7 (adapter Neon), Postgres RLS, zod, pdf-lib, Vitest (integração no banco dev).

**Spec:** `docs/superpowers/specs/2026-10-22-fase4-clientes-pedidos-design.md` (as 3 perguntas abertas foram resolvidas: pedido com 1 item; estorno de R$ 0,01 até o recebido; sem fechamento de mês). Contexto: `docs/CODEBASE_MAP.md`.

## Global Constraints

- Dinheiro em centavos inteiros, nunca float; total do pedido > 0 e ≤ R$ 1.000.000,00 (`parseBrlDetailed` de `features/transactions/money.ts`).
- Datas `@db.Date` UTC meia-noite; "hoje" no fuso da empresa (`todayIn`); data de recebimento/estorno não futura.
- Toda escrita: `authorize(ctx, action)` → `withAudit`; negação auditada pelo `authorize`. Leitura de model tenant só dentro de `withScope`. Soft delete (`deletedAt`).
- Sem chave nova em `lib/permissions.ts`: usar `order.*`, `customer.*`, `settings.manage`. Funcionário nunca exclui nem anonimiza.
- Lançamento com `orderId != null` não é editável nem excluível por `updateTransaction`/`deleteTransaction`: "Este lançamento é de um pedido. Altere pelo pedido."
- `Σ recebimentos não excluídos ≤ totalCents`; saldo calculado, nunca armazenado.
- Auditoria nunca guarda PII do cliente anonimizado (`before` da anonimização só `{ anonymizedAt: null }`).
- Atomic Design: organisms recebem server actions por prop e nunca importam `features/`. Copy pt-BR.
- Testes de integração rodam no banco dev: ids escalares de limpeza iniciam com `""`, nunca `undefined`; não matar o vitest no meio.
- Ninguém roda `git add/commit/push`; a mensagem de commit é gerada no chat ao fim.
- Next.js 16 tem breaking changes: ler o guia relevante em `node_modules/next/dist/docs/` antes de escrever page/route novos.

## Review Focus

- Dois recebimentos concorrentes que juntos passam do total: exatamente um falha (lock do pedido).
- Editar a data de um recebimento para outro mês financeiro (`monthStartDay = 5`): o valor muda de mês nos dois `monthSummary`.
- Cancelar com estorno maior que o recebido, ou pedido já Entregue: recusado, nada gravado.
- Cliente com WhatsApp/documento inválido ou duplicado (duplicado é permitido); nome só com espaços.
- Empresa B referenciando cliente, tipo, forma de pagamento ou pedido da empresa A: recusado (FK composta/RLS).

---

### Task 1: Migration e schema

**Files:**
- Modify: `prisma/schema.prisma` (Category, Order, Transaction)
- Create: `prisma/migrations/20261022000200_orders_customers/migration.sql`
- Modify: `features/organizations/defaults.ts`, `lib/tenant.ts` (só se faltar model)
- Test: `tests/orders-migration.test.ts`

**Interfaces:**
- Produces: `Category.systemKey: "ORDER_PAYMENT" | "ORDER_REFUND" | null`; `Order.number: Int`, `Order.deliveredOn: Date?`; `Transaction.orderId: string?` (+ relação `order`); constantes `SYSTEM_CATEGORY = { ORDER_PAYMENT: "ORDER_PAYMENT", ORDER_REFUND: "ORDER_REFUND" }` exportada de `features/organizations/defaults.ts`.

- [x] **Step 1: Escrever `tests/orders-migration.test.ts`** (pula sem `TEST_DATABASE_URL`, como os demais): `seedOrganizationDefaults` cria `Pedidos` INCOME com `systemKey ORDER_PAYMENT` e `Estorno` EXPENSE com `ORDER_REFUND`; segundo `systemKey` igual na mesma empresa viola o unique; `totalCents = 0` em `Order` e `amountCents = 0` em `OrderPayment` violam CHECK; `systemKey = 'X'` viola CHECK.
- [x] **Step 2: Rodar e ver falhar:** `pnpm vitest run tests/orders-migration.test.ts` → FAIL (coluna inexistente).
- [x] **Step 3: Editar `schema.prisma` e escrever o SQL** conforme a tabela "Mudanças de dados" da spec: `systemKey` + CHECK + unique parcial `(organizationId, systemKey)`; `Order.number` com backfill por `createdAt` e `@@unique([organizationId, number])`; `Order.deliveredOn`; `Transaction.orderId` + FK composta `(organizationId, orderId) → Order(organizationId, id)` + índice; CHECKs de `> 0`. Backfill idempotente: marcar `Pedidos` INCOME e `Estorno` EXPENSE existentes, inserir `Estorno` onde faltar. Aplicar com `pnpm prisma migrate dev` no dev e regenerar o client.
- [x] **Step 4: Atualizar `seedOrganizationDefaults`** para criar `Pedidos`/`Estorno` com `systemKey` (adicionar `Estorno` a `DEFAULT_CATEGORIES.EXPENSE`); `Category.type+name` continua único.
- [x] **Step 5: Rodar o teste e `pnpm vitest run tests/catalog.test.ts tests/isolation.test.ts`** → PASS.

### Task 2: Regras puras e schemas

**Files:**
- Create: `features/orders/rules.ts`, `features/orders/schemas.ts`, `features/customers/schemas.ts`, `features/customers/rules.ts`
- Test: `features/orders/rules.test.ts`, `features/orders/schemas.test.ts`, `features/customers/schemas.test.ts`, `features/customers/rules.test.ts`

**Interfaces:**
- Produces (`features/orders/rules.ts`): `type OrderStatus`; `canTransition(from: OrderStatus, to: OrderStatus): boolean`; `balanceCents(totalCents: number, paidCents: number): number`; `isOverdue(dueDate: string, today: string): boolean`; `dueLabel(dueDate: string, today: string): "hoje" | "amanhã" | string` (dd/mm).
- Produces (`features/customers/rules.ts`): `anonymizedName(id: string): string` = `"Cliente removido #" + 4 primeiros hex de sha256(id)`.
- Produces (`schemas.ts`): `customerSchema` → `{ name, phone (só dígitos), email?, document? (só dígitos), address?, note? }`; `orderSchema` → `{ customerId?, newCustomer?: {name, phone}, productTypeId, description, totalCents, dueDate, deposit?: { amountCents, paymentMethodId, paidAt } }` (exatamente um de `customerId`/`newCustomer`); `paymentSchema` → `{ amountCents, paymentMethodId, paidAt }`; `cancelSchema` → `{ reason?, refund?: { amountCents, paymentMethodId, paidAt } }`; `anonymizeSchema` → `{ reason (10–500) }`; `orderFiltersSchema` (`status`, `q`, `tipo`, `pagina`) e `customerFiltersSchema` (`q`, `pagina`, `aba`).

- [x] **Step 1: Testes.** `canTransition`: OPEN⇄READY⇄DELIVERED true (inclusive OPEN→DELIVERED), qualquer→CANCELED só de OPEN/READY, CANCELED→qualquer false, DELIVERED→CANCELED false, igual→igual false. `balanceCents(600_00, 200_00) === 400_00`. `isOverdue("2026-10-21","2026-10-22") === true`, mesma data false. `anonymizedName("abc")` determinístico e igual em duas chamadas. Schemas: nome `"  "` e 1 letra rejeitados; telefone `"(85) 98888-7777"` → `"85988887777"`, 9 dígitos rejeitado; CPF inválido rejeitado; total `"0"` e `"1.000.000,01"` rejeitados; `orderSchema` sem cliente e com os dois rejeitado; `anonymizeSchema` com motivo de 9 caracteres rejeitado; `cancelSchema.refund.amountCents = 0` rejeitado.
- [x] **Step 2: Rodar** `pnpm vitest run features/orders features/customers` → FAIL.
- [x] **Step 3: Implementar** reaproveitando `emptyToUndefined`/`optional`/`isRealDate` (extrair de `features/transactions/schemas.ts` para `features/shared/zod.ts` e importar nos dois lados) e `isValidDocument`/`onlyDigits` de `lib/document`.
- [x] **Step 4: Rodar** os mesmos testes → PASS.

### Task 3: Tipos de produto (cadastro)

**Files:**
- Modify: `features/catalog/service.ts`, `features/catalog/actions.ts`, `features/catalog/schemas.ts`, `app/(app)/configuracoes/page.tsx`
- Create: `app/(app)/configuracoes/tipos-de-produto/page.tsx`, `loading.tsx`
- Test: `tests/catalog.test.ts` (estender)

**Interfaces:**
- Produces: `listProductTypes(ctx): Promise<ProductTypeRow[]>`, `createProductType(ctx, {name})`, `updateProductType(ctx, id, {name?, active?})`, `ProductTypeRow = { id, name, active, usage }` (usage = pedidos não excluídos). Actions equivalentes às de formas de pagamento. Eventos `product_type.create` / `product_type.update`.

- [x] **Step 1: Estender `tests/catalog.test.ts`:** Admin cria "Avental"; duplicado case-insensitive (inclusive desativado) → `FieldError` `name`; Funcionário negado + `DENIED`; renomear/desativar auditado; categoria com `systemKey` não pode ser desativada (`updateCategory` com `active:false` em `ORDER_PAYMENT`/`ORDER_REFUND` → `FieldError`), renomear ok.
- [x] **Step 2: Rodar** `pnpm vitest run tests/catalog.test.ts` → FAIL.
- [x] **Step 3: Implementar** espelhando `createPaymentMethod`/`updatePaymentMethod` (mesmas regras, nome 2–40) e a trava de categoria de sistema em `updateCategory`.
- [x] **Step 4: Página** `tipos-de-produto` reusando `CatalogTable` como `formas-de-pagamento`; card novo em `/configuracoes`.
- [x] **Step 5: Rodar** os testes → PASS.

### Task 4: Clientes — service

**Files:**
- Create: `features/customers/service.ts`, `features/customers/actions.ts`
- Test: `tests/customers.test.ts`

**Interfaces:**
- Consumes: `customerSchema`, `anonymizeSchema`, `anonymizedName`, `customerFiltersSchema` (Task 2).
- Produces: `CustomerRow = { id, name, phone, ordersOpen: number, balanceCents: number, lastOrderOn: string | null, anonymized: boolean }`; `listCustomers(ctx, filters): Promise<{ rows: CustomerRow[]; page; pageCount }>` (busca por nome `ILIKE` ou dígitos do telefone; 50/página); `getCustomer(ctx, id)` (dados + pedidos + saldo); `createCustomer(ctx, input): Promise<{ id }>`; `updateCustomer(ctx, id, input)`; `deleteCustomer(ctx, id)` (Admin; recusa se há pedido não excluído: "Este cliente tem pedidos. Use Anonimizar."); `anonymizeCustomer(ctx, id, {reason})`; `listCustomersForReview(ctx): Promise<CustomerRow[]>` (Admin; lê `customerRetentionMonths` de `OrganizationSettings`); `customerOptions(ctx): Promise<{ id, name, phoneTail }[]>`. Actions: `saveCustomerAction(id|null, prev, fd)`, `deleteCustomerAction(id)`, `anonymizeCustomerAction(id, prev, fd)`.

- [x] **Step 1: Escrever `tests/customers.test.ts`** com os casos da spec: criar/editar auditado (`customer.create`/`update` com diff e telefone mascarado); Funcionário cria e edita mas `delete`/`anonymize`/revisão são negados + `DENIED`; excluir com pedido recusado e sem pedido ok; anonimizar recusado com pedido OPEN/READY; ok sem: nome `anonymizedName`, `phone ""`, demais campos null, `anonymizedAt` preenchido, `payerName`/`payerDocument` dos lançamentos com `orderId` do cliente limpos (criar pedido com recebimento via Prisma direto), auditoria com `reason` e `before` sem PII; editar cliente anonimizado recusado; revisão por retenção (última movimentação antiga entra, recente não); empresa B não lê cliente de A.
- [x] **Step 2: Rodar** `pnpm vitest run tests/customers.test.ts` → FAIL.
- [x] **Step 3: Implementar** o service seguindo o padrão de `features/transactions/service.ts`; anonimização numa única `withAudit` (trava o cliente `FOR UPDATE`); retenção em uma query agregada (`GREATEST` de `Customer.createdAt`, `Order.createdAt`, `OrderPayment.paidAt`).
- [x] **Step 4: Actions** finas com `requireTenant` + `toFormState`; `revalidatePath("/clientes")`.
- [x] **Step 5: Rodar** o teste → PASS.

### Task 5: Pedidos — criar, editar, status, excluir

**Files:**
- Create: `features/orders/service.ts`, `features/orders/payments.ts` (usado na Task 6; nesta task só o helper interno `createLinkedPayment(tx, ctx, order, input)` que o sinal usa), `features/orders/actions.ts`
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: Task 2 (schemas/rules), Task 4 (`createCustomer` interno para cliente inline), `getFinancialSettings`/`todayIn` (transactions).
- Produces: `OrderRow = { id, number, customer: { id, name }, productType: { id, name }, description, dueDate: string, status, totalCents, paidCents, balanceCents, overdue: boolean }`; `createOrder(ctx, input): Promise<{ id: string; number: number }>`; `updateOrder(ctx, id, input)` (sem `deposit`/`newCustomer`); `changeOrderStatus(ctx, id, to)`; `deleteOrder(ctx, id)`. Actions: `saveOrderAction(id|null, prev, fd)`, `changeOrderStatusAction(id, to)`, `deleteOrderAction(id)`.

- [x] **Step 1: Testes em `tests/orders.test.ts`:** criar sem sinal → `Order.number` 1, depois 2; outra empresa começa em 1; criação concorrente (`Promise.all` de 5) gera números distintos e sequenciais (lock `pg_advisory_xact_lock(hashtext('order:'||org))`); cliente inline cria `Customer` na mesma tx com `customer.create`; cliente anonimizado/excluído/de outra empresa recusado; tipo de produto desativado recusado na criação e aceito na edição se já era o do pedido; editar total abaixo do recebido recusado ("Já foram recebidos R$ X."); `changeOrderStatus`: OPEN→READY→DELIVERED grava `deliveredOn = hoje (fuso)` e sair de DELIVERED limpa; transição inválida recusada; cancelado não edita nem muda status; `deleteOrder` Admin ok sem dinheiro, recusado com recebimento ("Exclua os recebimentos ou cancele o pedido."), Funcionário negado + `DENIED`; eventos `order.create`/`update`/`status_change`/`delete` presentes.
- [x] **Step 2: Rodar** `pnpm vitest run tests/orders.test.ts` → FAIL.
- [x] **Step 3: Implementar** `createOrder`: `authorize "order.create"`, valida referências, número = `max(number)+1` sob advisory lock, cria pedido e (se `deposit`) chama `createLinkedPayment` na mesma `withAudit`. `updateOrder`/`changeOrderStatus`/`deleteOrder` travam o pedido com `FOR UPDATE` e usam `authorize "order.update"`/`"order.delete"`.
- [x] **Step 4: Rodar** → PASS.

### Task 6: Recebimentos sincronizados com lançamento

**Files:**
- Modify: `features/orders/payments.ts`, `features/orders/actions.ts`
- Test: `tests/order-payments.test.ts`

**Interfaces:**
- Consumes: `createLinkedPayment` (Task 5), `SYSTEM_CATEGORY` (Task 1).
- Produces: `registerPayment(ctx, orderId, input: PaymentInput): Promise<{ id: string }>`; `updatePayment(ctx, paymentId, input)`; `deletePayment(ctx, paymentId)`; actions `savePaymentAction(orderId, paymentId|null, prev, fd)`, `deletePaymentAction(paymentId)`.

- [x] **Step 1: Testes em `tests/order-payments.test.ts`:** registrar cria `OrderPayment` + `Transaction` INCOME categoria `ORDER_PAYMENT` com `orderId`, mesmo valor/data/forma, `description` `"Recebimento pedido #N — …"`, `payerName` = cliente; `monthSummary` sobe o valor; eventos `order_payment.create` + `transaction.create` (com `after.orderId`); editar valor/data/forma move o lançamento junto; data para outro mês com `monthStartDay = 5` move o valor entre os dois `monthSummary`; excluir (Admin) soft-deleta ambos, Funcionário negado + `DENIED`; Σ > total recusada; dois `registerPayment` concorrentes que juntos passam do total → um falha; pedido cancelado/excluído recusa; data futura recusada; forma de pagamento de outra empresa recusada; forma obrigatória.
- [x] **Step 2: Rodar** → FAIL.
- [x] **Step 3: Implementar** com `SELECT … FROM "Order" WHERE id = … FOR UPDATE`, soma dos recebimentos não excluídos dentro da tx, categoria pela `systemKey` (nunca pelo nome), eventos extras via `appendAudit` na mesma tx.
- [x] **Step 4: Rodar** → PASS.

### Task 7: Cancelamento com estorno e guarda dos lançamentos de pedido

**Files:**
- Modify: `features/orders/service.ts`, `features/orders/actions.ts`, `features/transactions/service.ts` (`updateTransaction`, `deleteTransaction`)
- Test: `tests/order-cancel.test.ts`, `tests/transactions.test.ts` (estender)

**Interfaces:**
- Produces: `cancelOrder(ctx, id, input: CancelInput): Promise<{ refundTransactionId: string | null }>`; `cancelOrderAction(id, prev, fd)`.

- [x] **Step 1: Testes:** cancelar sem recebimentos → `CANCELED`, `canceledAt`, evento `order.cancel` com `reason`; com recebimentos e `refund` → `Transaction` EXPENSE categoria `ORDER_REFUND`, `orderId`, `description "Estorno pedido #N"`, valor informado, recebimentos intactos, eventos `order.cancel` (`after.refundCents`) + `transaction.create`; com recebimentos e sem `refund` recusado; estorno 0 ou > recebido recusado; Entregue não cancela; cancelado não aceita recebimento nem edição; em `tests/transactions.test.ts`: `updateTransaction` e `deleteTransaction` num lançamento com `orderId` (recebimento e estorno) lançam "Este lançamento é de um pedido. Altere pelo pedido.".
- [x] **Step 2: Rodar** → FAIL.
- [x] **Step 3: Implementar** `cancelOrder` (lock do pedido, `authorize "order.update"`) e a checagem `orderId != null` no começo da tx de `updateTransaction`/`deleteTransaction`.
- [x] **Step 4: Rodar** `pnpm vitest run tests/order-cancel.test.ts tests/transactions.test.ts` → PASS.

### Task 8: Consultas — lista, detalhe, "A receber", próximas entregas

**Files:**
- Create: `features/orders/queries.ts`
- Test: `tests/order-queries.test.ts`

**Interfaces:**
- Produces: `listOrders(ctx, filters): Promise<{ rows: OrderRow[]; page; pageCount }>` (status `em-andamento` padrão | `entregues` | `cancelados` | `a-receber` | `todos`; busca por #número, descrição, nome do cliente; tipo; em andamento por `dueDate asc`, demais `createdAt desc`; 50/página); `getOrder(ctx, id): Promise<OrderDetail | null>` (`OrderRow` + `payments: { id, paidAt, amountCents, method: {id,name,active}, transactionId }[]` + `refund: { amountCents, occurredOn } | null` + `customer.phone`); `amountToReceive(ctx): Promise<number>`; `upcomingDeliveries(ctx, limit = 8): Promise<OrderRow[]>`; `orderFormOptions(ctx, current?)` → `{ customers, productTypes, paymentMethods }`.

- [x] **Step 1: Testes:** `amountToReceive` ignora cancelado, pedido excluído e recebimento excluído, inclui Entregue com saldo e soma `max(0, saldo)`; `upcomingDeliveries` só OPEN/READY ordenado por entrega, atrasado marcado `overdue` (fuso da empresa); filtros `a-receber` (saldo > 0 e não cancelado), busca por `#12`, por trecho de descrição e por nome; paginação; Funcionário e Admin leem; empresa B não vê pedidos de A.
- [x] **Step 2: Rodar** → FAIL.
- [x] **Step 3: Implementar** com uma query agregada (`LEFT JOIN`/`groupBy` em `OrderPayment`), sem N+1.
- [x] **Step 4: Rodar** → PASS.

### Task 9: UI de clientes

**Files:**
- Create: `app/(app)/clientes/page.tsx` (reescreve o placeholder), `loading.tsx`, `app/(app)/clientes/[id]/page.tsx`, `components/organisms/CustomerForm/`, `components/organisms/CustomerList/`, `components/organisms/CustomerActions/` (excluir/anonimizar via `ConfirmAction`)
- Modify: `components/atoms/StatusBadge` (só se faltar tom)

**Interfaces:**
- Consumes: `listCustomers`, `getCustomer`, `listCustomersForReview`, `saveCustomerAction`, `deleteCustomerAction`, `anonymizeCustomerAction`.

- [x] **Step 1: Invocar `/frontend-design`** antes de codar; ler o guia de `page`/`searchParams` em `node_modules/next/dist/docs/`.
- [x] **Step 2: Implementar** `/clientes` (busca na URL, tabela desktop/cartões mobile, aba "Para revisar" só Admin, "+ Cliente" em Dialog/Drawer, anonimizados como "Cliente removido #xxxx" sem ações) e `/clientes/[id]` (dados, "Chamar no WhatsApp" `https://wa.me/55{digits}` em nova aba, saldo devedor, pedidos do cliente, Editar; Excluir/Anonimizar só Admin).
- [x] **Step 3: Validar** com agent-browser em 1280px e 390px (porta 3004): criar, buscar, editar, excluir bloqueado, anonimizar; Funcionário não vê Excluir/Anonimizar. Reportar o resultado.

### Task 10: UI de pedidos — lista, formulário, Início

**Files:**
- Create: `app/(app)/pedidos/page.tsx` (reescreve o placeholder), `loading.tsx`, `components/organisms/OrderForm/`, `components/organisms/OrderList/`
- Modify: `components/organisms/QuickActions/index.tsx` (botão "+ Pedido"), `app/(app)/inicio/page.tsx` (KPI "A receber (hoje)" → `/pedidos?status=a-receber`, "Próximas entregas" real com atrasados primeiro e `StatusBadge` "Atrasado", `EmptyState` quando vazio)

**Interfaces:**
- Consumes: `listOrders`, `amountToReceive`, `upcomingDeliveries`, `orderFormOptions`, `saveOrderAction`.

- [x] **Step 1: Invocar `/frontend-design`** (e `/ui-ux-pro-max` para o `OrderForm`).
- [x] **Step 2: Implementar** `OrderForm` (cliente por busca local ou "+ Novo cliente" com nome+WhatsApp, tipo, descrição, total com `MoneyInput`, entrega, bloco recolhível "Sinal recebido"), `/pedidos` com filtros na URL (cartões no celular), Início com KPI e entregas, `QuickActions` abrindo o `OrderForm` no próprio Início.
- [x] **Step 3: Validar** o fluxo do "Sucesso" da spec em 1280px e 390px: "+ Pedido" de R$ 600,00 com sinal de R$ 200,00 → "Entrou" +R$ 200,00, "A receber" R$ 400,00, pedido em "Próximas entregas". Reportar.

### Task 11: UI do pedido — detalhe, recebimentos, cancelamento

**Files:**
- Create: `app/(app)/pedidos/[id]/page.tsx`, `components/organisms/OrderDetail/`, `components/organisms/PaymentForm/`, `components/organisms/CancelOrderDialog/`
- Modify: `components/organisms/TransactionList` (+RowActions): selo "Pedido #N" com link para o pedido e sem Editar/Excluir quando houver `orderId`; `features/transactions/service.ts` (`TransactionRow.order: { id, number } | null`)

**Interfaces:**
- Consumes: `getOrder`, `savePaymentAction`, `deletePaymentAction`, `changeOrderStatusAction`, `cancelOrderAction`, `deleteOrderAction`, `saveOrderAction`.

- [x] **Step 1: Invocar `/frontend-design` e `/ui-ux-pro-max`** (tela nova complexa).
- [x] **Step 2: Implementar** cabeçalho (#N, status, cliente com link e WhatsApp, entrega, tipo), valores (total/recebido/saldo), botões de status, Editar, Cancelar (com campos de estorno quando há recebido: valor padrão = recebido, data, forma), Excluir (Admin), tabela de recebimentos (Recibo → `/lancamentos/[transactionId]/recibo.pdf`, Editar, Excluir-Admin), "Registrar recebimento" e "Receber saldo". Cancelado sem ações; saldo zero esconde "Registrar recebimento".
- [x] **Step 3: Validar** no navegador (1280px e 390px): sinal, receber saldo, mudar status, cancelar com estorno, lançamento ligado aparece em `/lancamentos` com selo e sem botões de edição; Funcionário sem Excluir. Reportar.

### Task 12: Recibo do pedido (PDF)

**Files:**
- Create: `features/orders/receipt.ts`, `app/(app)/pedidos/[id]/recibo.pdf/route.ts`
- Modify: `features/transactions/receipt-pdf.ts` (extrair cabeçalho/rodapé comuns para helpers exportados, sem duplicar), `components/organisms/OrderDetail/` (botão "Recibo do pedido" via `ReceiptActions`)
- Test: `features/orders/receipt.test.ts`, `tests/order-receipt.test.ts`

**Interfaces:**
- Produces: `loadOrderReceiptData(ctx, id): Promise<OrderReceiptData | null>` (audita `order.receipt_issue`, `authorize "order.view"`); `buildOrderReceiptPdf(data): Promise<Uint8Array>`; `orderReceiptLines(data): string[]` (pura, testável).

- [x] **Step 1: Testes:** `orderReceiptLines` contém "PEDIDO #N", cliente, descrição, cada recebimento, total/recebido/saldo, "QUITADO" só com saldo 0, "CANCELADO" e o estorno quando cancelado; integração: pedido de outra empresa ou excluído → `null`; `order.receipt_issue` gravado; PDF começa com `%PDF`.
- [x] **Step 2: Rodar** → FAIL.
- [x] **Step 3: Implementar** extraindo helpers de `receipt-pdf.ts` e a rota no padrão de `lancamentos/[id]/recibo.pdf` (`requireTenant`, `Cache-Control: private, no-store`).
- [x] **Step 4: Rodar** `pnpm vitest run features/orders tests/order-receipt.test.ts features/transactions` → PASS.

### Task 13: Fechamento

**Files:**
- Modify: `docs/CODEBASE_MAP.md`, `README.md` (funcionalidades), `components/organisms/AppNavigation` (se Pedidos/Clientes deixarem de ser placeholder), `app/(public)/privacidade` template em `features/legal/templates.ts` (nota LGPD da auditoria que guarda nome e contato mascarado por 5 anos)

- [x] **Step 1:** `pnpm test` (suíte completa, 1x), `pnpm lint`, `pnpm build` sem erros.
- [x] **Step 2:** Rodar `pnpm audit:verify` (cadeia íntegra) e conferir no banco dev que a migration não deixou `Estorno`/`Pedidos` sem `systemKey`.
- [x] **Step 3:** Atualizar `CODEBASE_MAP.md` (features customers/orders, tabela de eventos, gotcha do `orderId`) e README; `graphify update .` se `graphify-out/graph.json` existir.
- [x] **Step 4:** Gerar a mensagem de commit semântica no chat (o usuário executa os comandos git). Code review opus continua pausado até o usuário reativar.

---

## Self-review

- **Cobertura da spec:** dados (T1), clientes incl. anonimizar/revisão (T2, T4, T9), tipos de produto (T3), estados e regras do pedido (T2, T5), sincronia recebimento↔lançamento (T6), cancelamento/estorno e bloqueio de lançamento de pedido (T7), A receber/entregas (T8, T10), telas (T9–T11), recibo (T12), auditoria (em cada service), docs e nota LGPD (T13). Migration contra o dev coberta pelo teste da T1.
- **Consistência de nomes:** `SYSTEM_CATEGORY` (T1) usado em T6/T7; `OrderRow`/`OrderDetail` definidos em T5/T8 e consumidos em T10/T11; `createLinkedPayment` (T5) reutilizado por `registerPayment` (T6).
- **Ponytail:** lista local de clientes no `OrderForm` até ~500 clientes; sem `unaccent` (só `ILIKE`) até haver extensão; sem detecção de duplicados.

# Fase 4 — Clientes e pedidos — design

Data: 2026-10-22 · Status: escrito sem rodada de perguntas (usuário pediu "pule as perguntas"). Segue `prompt-beedock.md` e as decisões já tomadas pelo usuário; escolhas do Claude marcadas **[Claude]**.

Contexto obrigatório: `docs/CODEBASE_MAP.md`, spec da Fase 3 (`2026-10-21-lancamentos-design.md` — lançamentos, mês financeiro, recibo, comprovante).

## Perguntas para o usuário

1. **Itens do pedido**: proposta = um pedido tem **um tipo de produto, uma descrição livre e um valor total** (como na spec base). Precisa de várias linhas (ex.: 20 camisas + 5 bonés com preços diferentes)?
2. **Estorno no cancelamento**: proposta = valor do estorno vem preenchido com o total recebido e pode ser **reduzido** (empresa reteve parte do sinal), mínimo R$ 0,01. Se a empresa às vezes retém o sinal inteiro, o estorno precisa poder ser zero?
3. **Fechamento de mês**: proposta = **não há fechamento**; recebimentos e lançamentos de meses passados podem ser editados (tudo auditado). Quer travar edição de meses anteriores?

## Intenção

A estamparia vive de encomendas: o cliente pede, paga um sinal, a peça fica pronta, é entregue e o resto é pago. Hoje o BeeDock só sabe o que entrou e saiu (Fase 3); não sabe quem deve, quanto, nem o que precisa sair da doca esta semana. A Fase 4 cadastra clientes e pedidos, liga cada recebimento a um lançamento de entrada (o Início e os totais continuam corretos sem lançamento duplicado) e mostra "A receber" e "Próximas entregas".

Sucesso: o funcionário clica "+ Pedido", escolhe (ou cria) o cliente, descreve "20 camisas time Unidos", R$ 600,00, entrega sexta, sinal de R$ 200,00 no Pix; salva. O card "Entrou" sobe R$ 200,00, "A receber" mostra R$ 400,00 e o pedido aparece em "Próximas entregas". Na entrega, registra o restante, marca "Entregue" e manda o recibo pelo WhatsApp.

## Objetivos

1. **Clientes**: criar, listar com busca, ver, editar; excluir (Admin, só sem pedidos); anonimizar (Admin, LGPD); lista de revisão por retenção.
2. **Tipos de produto**: tela de cadastro (Admin), igual a categorias.
3. **Pedidos**: criar (com sinal opcional e cliente novo inline), listar com filtros, ver, editar, mudar status, cancelar (com estorno), excluir (Admin, só sem dinheiro).
4. **Recebimentos**: registrar, editar e excluir; cada um sincronizado com um lançamento de entrada.
5. **Início**: KPI "A receber" e "Próximas entregas"; atalho "+ Pedido" abre o formulário no próprio Início.
6. **Recibo do pedido** em PDF (resumo com pagamentos e saldo); recibo de cada recebimento reaproveita o recibo da Fase 3.
7. Toda escrita auditada; negação auditada.

## Não-objetivos

- Exportar dados do titular e aba "Histórico": Fase 5.
- Itens/linhas de pedido, quantidade, preço unitário, estoque (ver pergunta 1).
- Orçamento/proposta antes do pedido, fotos/arte do pedido, produção por etapas.
- Desfazer cancelamento **[Claude]**: cancelado é final; para retomar, criar pedido novo.
- Lembretes, notificações, mensagem automática no WhatsApp (só o botão `wa.me`).
- Detecção de cliente duplicado **[Claude]**: dois clientes com o mesmo WhatsApp são permitidos (YAGNI; entra se virar problema).
- Fechamento de mês (ver pergunta 3).

## Anti-objetivos (falha mesmo funcionando)

- Recebimento sem lançamento, lançamento de recebimento sem recebimento, ou os dois com valor/data/forma diferentes. Sincronia sempre na **mesma transação**.
- Lançamento de pedido editável ou excluível pela tela de Lançamentos (quebraria a sincronia). Service recusa; UI leva ao pedido.
- Soma dos recebimentos maior que o total do pedido.
- "A receber" contando pedido cancelado, excluído ou recebimento excluído.
- Anonimização que deixa o nome/documento do cliente nos lançamentos ligados aos pedidos dele (`payerName`/`payerDocument`).
- Funcionário excluindo qualquer coisa (pedido, recebimento, cliente) ou anonimizando.
- Valor em ponto flutuante em qualquer camada.
- Pedido/cliente de uma empresa referenciado por outra (FKs compostas + RLS).

## Decisões

### Mudanças de dados (uma migration `orders_customers`)

Nenhuma tabela nova; todas já estão sob RLS `tenant_isolation` e em `TENANT_MODELS`.

| Mudança | Por quê |
|---|---|
| `Category.systemKey String?` + `CHECK (systemKey IN ('ORDER_PAYMENT','ORDER_REFUND'))` + `@@unique([organizationId, systemKey])` | Saber, sem depender do nome, qual categoria recebe os recebimentos ("Pedidos", INCOME) e os estornos ("Estorno", EXPENSE). Admin pode renomear, **não pode desativar** categoria de sistema. |
| Backfill: `Pedidos` INCOME → `ORDER_PAYMENT`; inserir `Estorno` EXPENSE `ORDER_REFUND` em toda empresa que não tiver (se já existir "Estorno" EXPENSE, marcar) | Dev tem empresas antigas; produção começa limpa mas o backfill é idempotente. `seedOrganizationDefaults` passa a criar ambas com `systemKey`. |
| `Order.number Int` + `@@unique([organizationId, number])` | Referência humana "Pedido #12" no recibo, na lista e na descrição do lançamento. **[Claude]** Gerado no service: `pg_advisory_xact_lock(hashtext('order:'||org))` + `max(number)+1` (backfill por `createdAt`). |
| `Order.deliveredOn DateTime? @db.Date` | Relatório da Fase 5 ("entregues no mês") e ordenação. Preenchido ao marcar Entregue; limpo se voltar status. |
| `Transaction.orderId String?` + FK composta `(organizationId, orderId) → Order(organizationId, id)` + índice `(organizationId, orderId)` | Marca lançamentos gerados por pedido (recebimento = INCOME; estorno = EXPENSE). Um único teste no service bloqueia edição manual. |
| `CHECK ("totalCents" > 0)` em `Order`; `CHECK ("amountCents" > 0)` em `OrderPayment` | Igual a `Transaction` (Fase 3). |

Sem mudança em `Customer`, `ProductType`, `OrderPayment` (já tem `transactionId @unique` + FK composta). `Customer.address` continua texto único **[Claude]** (minimização; endereço estruturado não é usado em nada).

### Permissões (matriz existente, sem chave nova)

| Ação | Admin | Funcionário |
|---|---|---|
| Ver/criar/editar cliente | sim | sim |
| Excluir cliente (`customer.delete`) / anonimizar (`customer.anonymize`) / lista de revisão | sim | não |
| Ver/criar/editar pedido, mudar status, cancelar (`order.update`) | sim | sim |
| Registrar/editar recebimento (`order.update`) | sim | sim |
| Excluir recebimento ou pedido (`order.delete`) | sim | não |
| Tipos de produto (`settings.manage`) | sim | não |
| Ver "A receber" e "Próximas entregas" (`order.view`) | sim | sim |

Cancelar com estorno cria uma saída: o Funcionário já pode criar lançamentos, então `order.update` basta **[Claude]**.

### Clientes

- **Campos**: nome (2–120, obrigatório), WhatsApp (10–11 dígitos, obrigatório, `inputmode="tel"`), e-mail, CPF/CNPJ (validado com `lib/document`), endereço (até 200), observação (até 500). Só dígitos no banco para telefone/documento.
- **`/clientes`**: busca única (nome contém, sem acento/maiúsculas via `ILIKE` + `unaccent` se disponível, senão só `ILIKE` **[Claude]**; ou dígitos do WhatsApp), colunas nome, WhatsApp, pedidos em andamento, saldo devedor, último pedido. Ordem nome asc, 50 por página. Botão "+ Cliente" (Dialog desktop / Drawer mobile). Anonimizados aparecem como "Cliente removido #a1b2", sem ações de edição.
- **`/clientes/[id]`**: dados, botão "Chamar no WhatsApp" (`https://wa.me/55{digits}`, nova aba), saldo devedor (soma dos saldos dos pedidos não cancelados), lista de pedidos do cliente, ações Editar / Excluir (Admin) / Anonimizar (Admin).
- **Excluir** (soft): só se o cliente não tem pedido não excluído; senão "Este cliente tem pedidos. Use Anonimizar." 
- **Anonimizar** (`ConfirmAction` com motivo obrigatório, 10–500 caracteres):
  - Recusado se houver pedido `OPEN`/`READY` **[Claude]** ("Conclua ou cancele os pedidos em andamento antes.").
  - `name = "Cliente removido #" + 4 primeiros hex de sha256(id)`, `phone = ""`, `email/document/address/note = null`, `anonymizedAt = now`.
  - Na mesma tx: `Transaction.payerName = name anonimizado`, `payerDocument = null` em todos os lançamentos com `orderId` de pedidos do cliente.
  - Irreversível. Auditoria `customer.anonymize` com `reason`; `before` só com `{ anonymizedAt: null }` (sem copiar o dado pessoal para a auditoria).
  - Nota LGPD: eventos antigos da auditoria guardam nome (não mascarado) e contato **mascarado**; ficam pelos 5 anos de retenção da auditoria (obrigação legal, imutável por desenho). Registrar isso na Política de Privacidade.
- **Revisão por retenção** (Admin): aba "Para revisar" em `/clientes`: clientes não anonimizados cuja **última movimentação** (maior entre `Customer.createdAt`, `Order.createdAt` e `OrderPayment.paidAt` dos pedidos dele) é anterior a `hoje − customerRetentionMonths`. Cada linha com "Anonimizar". Nada automático.
- Auditoria: `customer.create`, `customer.update` (diff), `customer.delete`, `customer.anonymize`. Campos pessoais saem mascarados pelo `sanitize` (chaves `phone`, `email`, `document`, `address`); nome sai inteiro, como na Fase 3.

### Tipos de produto

- `/configuracoes/tipos-de-produto`, reusa `CatalogTable` e as regras de categorias (nome 2–40, único sem diferenciar maiúsculas contando desativados, desativar em vez de excluir, contagem de uso). Card novo em `/configuracoes`.
- Auditoria `product_type.create` / `product_type.update`.

### Pedidos — estados

```
OPEN (Aberto) ⇄ READY (Pronto) ⇄ DELIVERED (Entregue)
   \______________\____________→ CANCELED (Cancelado, final)
```

- Avançar e voltar entre Aberto/Pronto/Entregue é livre (corrigir clique errado), auditado `order.status_change`. Entregar grava `deliveredOn = hoje (fuso da empresa)`; sair de Entregue limpa.
- **Entregue com saldo é permitido** (cliente paga depois); continua em "A receber".
- Cancelar só de Aberto ou Pronto **[Claude]** (Entregue não se cancela; se houve devolução, é um lançamento manual).
- Cancelado: somente leitura (sem editar, sem recebimento, sem mudar status).

### Pedidos — campos e regras

- Cliente (obrigatório; não anonimizado; não excluído), tipo de produto (ativo para novo; desativado mantido na edição), descrição (2–200), valor total (centavos, > 0, ≤ R$ 1.000.000,00), data de entrega (`@db.Date`; pode ser passada — pedido atrasado é real).
- Editar total: recusado se ficar menor que o já recebido ("Já foram recebidos R$ X.").
- Trocar o cliente de um pedido com recebimentos: permitido; `payerName` dos lançamentos ligados **não** muda (é o nome de quem pagou na data) **[Claude]**.
- **Saldo** = `totalCents − Σ recebimentos não excluídos`. Calculado, nunca armazenado.
- **Excluir pedido** (Admin, soft): só se não tem recebimento nem estorno ativos ("Exclua os recebimentos ou cancele o pedido."). Exclusão é para pedido lançado por engano.

### Recebimentos ↔ lançamentos (sincronia)

Toda operação abaixo trava o pedido (`SELECT … FROM "Order" WHERE id = $1 FOR UPDATE`) e roda numa única `withAudit`, com eventos extras via `appendAudit` na mesma tx.

| Operação | Recebimento (`OrderPayment`) | Lançamento ligado (`Transaction`) | Eventos |
|---|---|---|---|
| Registrar (ou sinal na criação) | cria: valor, data, forma | cria INCOME, categoria `ORDER_PAYMENT`, `orderId`, mesmo valor/data/forma, `description = "Recebimento pedido #N — {descrição truncada}"`, `payerName = nome do cliente` | `order_payment.create` + `transaction.create` (`after.orderId`) |
| Editar valor/data/forma | atualiza | atualiza os mesmos três campos | `order_payment.update` + `transaction.update` (diff) |
| Excluir (Admin) | soft delete | soft delete | `order_payment.delete` + `transaction.delete` |

- Validações: pedido não cancelado nem excluído; valor > 0; `Σ recebimentos ≤ total` após a operação; data não futura (mesma regra dos lançamentos, fuso da empresa); forma de pagamento ativa (desativada mantida na edição). A forma é **obrigatória** no recebimento **[Claude]** (recibo e conferência de caixa).
- O lançamento ligado aparece em `/lancamentos` com selo "Pedido #N" (link para o pedido); editar/excluir ali → service recusa (`transaction.update`/`delete` checam `orderId != null` e lançam "Este lançamento é de um pedido. Altere pelo pedido."); UI esconde os botões e mostra o link.
- Recibo do recebimento = recibo da Fase 3 (`/lancamentos/[transactionId]/recibo.pdf`), botão "Recibo" em cada linha de recebimento.
- Mês: cada recebimento entra no mês financeiro da sua data (`occurredOn = paidAt`), respeitando `monthStartDay`. Editar a data move o valor de mês — é o comportamento esperado (sem fechamento; pergunta 3).

### Cancelamento e estorno

- Pedido sem recebimentos: cancelar só pede confirmação + motivo opcional → `status = CANCELED`, `canceledAt`.
- **Pedido com recebimentos** (decisão do usuário: gera saída "Estorno"): o diálogo mostra o total recebido e pede valor do estorno (padrão = total recebido, 1 centavo até o total recebido), data (padrão hoje, não futura) e forma de pagamento. Cria `Transaction` EXPENSE, categoria `ORDER_REFUND`, `orderId`, `description = "Estorno pedido #N"`. Os recebimentos **não** são apagados (o dinheiro entrou e saiu; os dois fatos ficam no mês em que aconteceram).
- Saldo de pedido cancelado não conta em "A receber".
- Eventos: `order.cancel` (`reason`, `after: { refundCents }`) + `transaction.create` do estorno, mesma tx.
- Excluir o lançamento de estorno pela tela de lançamentos: recusado (tem `orderId`). Estorno errado → Admin corrige o valor? **[Claude]** Não nesta fase: estorno é imutável; erro de valor se corrige com lançamento manual de ajuste. Mantém o cancelamento como fato único.

### "A receber" e "Próximas entregas"

- `amountToReceive(ctx)` = Σ max(0, saldo) dos pedidos `status ≠ CANCELED`, não excluídos. Uma query com `LEFT JOIN` agregado (sem N+1). É posição **de hoje**, não do mês; o rótulo diz "A receber (hoje)".
- Início: `KpiCard` "A receber" (ambos os papéis), clicável para `/pedidos?status=a-receber`.
- "Próximas entregas": até 8 pedidos `OPEN`/`READY` por `dueDate asc`; atrasados primeiro com `StatusBadge` "Atrasado" (dueDate < hoje no fuso da empresa); linha: #N, cliente, descrição, entrega ("hoje", "amanhã", dd/mm), status, saldo. Vazio: `EmptyState` atual.
- "+ Pedido" no `QuickActions` abre o `OrderForm` no Início (como "+ Entrada"/"+ Saída").

### Telas de pedido

- **`/pedidos`**: filtros na URL — status (`em-andamento` = OPEN+READY [padrão], `entregues`, `cancelados`, `a-receber` = saldo > 0 e não cancelado, `todos`), busca (#número, descrição, nome do cliente), tipo de produto. Colunas: #, cliente, descrição, tipo, entrega, status, total, recebido, saldo. Ordem: em andamento por `dueDate asc`; demais por `createdAt desc`. 50 por página. No celular vira cartões.
- **`OrderForm`** (Dialog desktop / Drawer mobile): cliente (busca local na lista ou "+ Novo cliente" que abre nome + WhatsApp no próprio formulário **[Claude]**, criado na mesma tx com `customer.create`), tipo, descrição, total, entrega, e bloco recolhível "Sinal recebido" (valor, forma, data). Lista de clientes para o select: carregar ativos não anonimizados (id, nome, telefone final); acima de ~500 clientes, trocar por busca server-side (ponytail: lista local até doer).
- **`/pedidos/[id]`**: cabeçalho (#N, status, cliente com link e WhatsApp, entrega, tipo), valores (total, recebido, saldo), botões de status, Editar, Cancelar, Excluir (Admin), "Recibo do pedido". Seção Recebimentos: tabela (data, forma, valor, Recibo, Editar, Excluir-Admin) + "Registrar recebimento" (botão "Receber saldo" preenche o saldo).
- Bloqueios visuais espelham o service (cancelado sem ações; saldo zero esconde "Registrar recebimento").

### Recibo do pedido (PDF)

- Rota `app/(app)/pedidos/[id]/recibo.pdf/route.ts`, mesmo padrão da Fase 3 (requireTenant, `order.view`, pedido da empresa não excluído, `Cache-Control: private, no-store`), `pdf-lib`, reaproveitando cabeçalho/rodapé de `features/transactions/receipt-pdf.ts` (extrair helpers comuns, não duplicar).
- Conteúdo: dados da empresa; "PEDIDO #N"; cliente (nome e WhatsApp); descrição, tipo, entrega, status; tabela de recebimentos (data, forma, valor); total, recebido, saldo; selo "QUITADO" se saldo 0; se cancelado, "CANCELADO" e o estorno.
- Mesmo painel `ReceiptActions` (imprimir, baixar, compartilhar).
- Auditoria `order.receipt_issue`.

### Auditoria — eventos

| action | quando |
|---|---|
| `customer.create` / `update` / `delete` / `anonymize` | clientes |
| `product_type.create` / `update` | tipos |
| `order.create` | novo pedido (after: número, cliente, tipo, descrição, total, entrega) |
| `order.update` | edição (diff) |
| `order.status_change` | before/after status |
| `order.cancel` | com `reason` e `refundCents` |
| `order.delete` | soft (before) |
| `order.receipt_issue` | PDF do pedido |
| `order_payment.create` / `update` / `delete` | recebimentos |
| `transaction.create` / `update` / `delete` | lançamento ligado, com `orderId` no after/before |
| DENIED com a permissão | tentativa negada |

`entityType` = `Customer`, `Order`, `OrderPayment`, `Transaction`, `ProductType` — a Fase 5 monta a linha do tempo por registro a partir disso (pedido = eventos do `Order` + dos seus `OrderPayment` + dos `Transaction` com `orderId`).

## Testes

- **Unit**: schemas (cliente, pedido, recebimento, cancelamento); `nextStatus` (transições válidas/inválidas); nome anonimizado determinístico; cálculo de saldo/a receber como função pura sobre linhas.
- **Integração (Neon)** — ids escalares de limpeza iniciados com `""`; AuditLog não se apaga (append-only), empresas de teste com sufixo:
  - criar pedido com sinal → `OrderPayment` + `Transaction` INCOME categoria `ORDER_PAYMENT` com `orderId`, mesmo valor/data/forma; `monthSummary` sobe o valor;
  - editar recebimento (valor, data, forma) → lançamento acompanha; mudar a data para outro mês move o valor entre `monthSummary` dos dois meses (com `monthStartDay = 5`);
  - excluir recebimento (Admin) → ambos soft-deleted; Funcionário negado + DENIED;
  - soma dos recebimentos > total recusada; total abaixo do recebido recusado; dois recebimentos concorrentes que juntos passam do total → um falha (lock);
  - `updateTransaction`/`deleteTransaction` em lançamento com `orderId` recusados;
  - cancelar com recebimentos → saída EXPENSE `ORDER_REFUND` com o valor informado; estorno > recebido recusado; cancelado não aceita recebimento/edição; Entregue não cancela;
  - excluir pedido com recebimento recusado; sem recebimento ok (Admin);
  - `amountToReceive` ignora cancelado, excluído e recebimento excluído; inclui Entregue com saldo;
  - próximas entregas: só OPEN/READY, ordem por entrega;
  - numeração `#N` sequencial por empresa e independente entre empresas; criação concorrente não repete número;
  - anonimizar: recusado com pedido em andamento; ok sem → dados trocados, `payerName/payerDocument` dos lançamentos do cliente limpos, auditoria com `reason` e sem PII no before; Funcionário negado;
  - excluir cliente com pedido recusado;
  - revisão por retenção: cliente com última movimentação antiga aparece, recente não;
  - categoria de sistema não pode ser desativada; renomear ok;
  - migration: empresa antiga ganha `Estorno` e `Pedidos` marcado (rodar contra o dev);
  - isolamento: empresa B não lê/edita pedido, cliente ou recebimento de A; recebimento com `paymentMethodId` de B recusado (FK composta).
- **Navegador**: fluxo do "Sucesso" acima em 1280px e conferência em 390px; Funcionário sem botões de excluir/anonimizar.

## Validação UI

`/frontend-design` (e `/ui-ux-pro-max` para `/pedidos/[id]`, tela nova complexa) antes de implementar. Validar com agent-browser no dev (porta 3004) ou previews em `previews/`. Produção começa limpa; no dev, criar dados pela própria UI.

## Deixado para o builder

- Divisão em `features/customers/` e `features/orders/` (sugestão), nomes de actions/services.
- Paginação vs. "carregar mais"; layout fino de tabelas/cartões; ícones; textos exatos.
- `unaccent` na busca se a extensão já estiver disponível no Neon; senão `ILIKE` simples.
- Extração dos helpers de PDF compartilhados.
- Atualizar `docs/CODEBASE_MAP.md` e o README (funcionalidades) ao final.

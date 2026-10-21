# Fase 3 — Lançamentos + Início com totais reais

Data: 2026-10-21 · Status: perguntas do revisor respondidas; aguardando revisão do usuário

## Intenção

O dono da estamparia precisa registrar cada entrada e cada saída de dinheiro e saber, a qualquer momento, quanto **entrou**, quanto **saiu** e quanto **sobrou** no mês. Hoje isso é anotado em qualquer lugar. A Fase 3 cria o registro de lançamentos e liga o Início aos números reais. A ideia é que o Início "ganhe vida" assim que o primeiro lançamento é salvo.

Sucesso: o usuário abre o Início, clica em "+ Saída", preenche valor, categoria e forma de pagamento, salva em poucos segundos, e o card "Saiu" já mostra o novo total. Depois ele encontra o lançamento na lista filtrando pelo mês e pela categoria.

## Objetivos

1. **Lançamentos:** criar, listar, editar e excluir entradas e saídas.
2. **Comprovante:** anexo opcional (imagem ou PDF) no lançamento.
3. **Lista com filtros:** mês financeiro, tipo e categoria, com os totais do filtro.
4. **Início com dados reais:** cards Entrou, Saiu e Sobrou do mês financeiro atual, com atalhos que abrem o formulário.
5. **Recibo de pagamento:** para entradas lançadas pelo usuário, gerar um recibo em PDF que ele imprime ou compartilha com o cliente (pedido do usuário).
6. **Cadastros auxiliares:** Admin cria, edita e desativa categorias e formas de pagamento *(decisão do Claude: entram nesta fase porque só os lançamentos usam; tipos de produto ficam para a Fase 4, com os pedidos)*.
7. Toda escrita e toda negação de permissão auditadas.

## Fora do escopo

- Card "A receber" e "Próximas entregas" no Início: dependem dos pedidos, ficam para a Fase 4. *(Decisão do Claude.)* Nesta fase o card "A receber" sai da tela, e a seção de entregas continua com o estado vazio atual.
- Relatório mensal, gráficos e exportação PDF/CSV: Fase 5.
- Aba "Histórico" (linha do tempo da auditoria) no lançamento: Fase 5.
- Lançamento gerado por recebimento de pedido: Fase 4.
- Câmera, gaveta mobile e PWA: depois.
- MASTER com visibilidade total nas empresas: regra nova do usuário, implementada depois desta fase.
- Lançamentos recorrentes, parcelamento, transferências entre contas, múltiplas moedas.

## Anti-objetivos

- Valor em ponto flutuante em qualquer camada. Sempre inteiro em centavos; BRL só na interface.
- Funcionário vendo o número "Sobrou" em qualquer lugar: Início, totais da lista ou resposta de action. (Ele vê Entrou e Saiu, como manda a spec base; esconder o número basta.)
- Excluir apagando a linha do banco. Exclusão é sempre lógica (`deletedAt`).
- Categoria ou forma de pagamento apagada quando está em uso. Só desativar.
- Lançamento de uma empresa visível ou editável por outra.

## Restrições do projeto (já existentes — seguir)

- Next 16.4 (ler `node_modules/next/dist/docs/` antes de usar APIs), Prisma 7 + Neon com RLS, Auth.js v5, Zod 4, Vitest 5, Tailwind 4 + shadcn.
- Tabelas `Transaction`, `Category` e `PaymentMethod` **já existem** no schema, sob RLS, com `organizationId` preenchido pelo banco, FKs compostas por empresa, `createdById/updatedById/deletedAt`. Defaults semeados na criação da empresa (`features/organizations/defaults.ts`).
- Escrita via `withAudit(ctx, event, fn)` (`lib/audit.ts`), contexto via `requireTenant()` (`lib/session.ts`), permissões via `authorize(ctx, action)` com a matriz de `lib/permissions.ts` (já tem `transaction.view/create/update/delete`, `profit.view`, `settings.manage`).
- Design system "Colmeia & Doca"; atomic design com eslint boundaries (molecules/organisms não importam `features/` nem `components/ui`: usar atoms wrappers e passar actions como props).
- **Desktop-first** (decisão do usuário, 2026-10-21): desenhar para notebook/computador; continuar utilizável no celular.
- Textos em pt-BR, linguagem simples ("Entrou", "Saiu", "Sobrou").
- Usuário faz todos os commits.

## Decisões

### Modelo (já existe)

`Transaction`: `type` (INCOME/EXPENSE), `amountCents` (Int), `occurredOn` (Date, sem hora), `categoryId` (obrigatório), `paymentMethodId` (opcional), `description` (obrigatório), `receiptUrl` (opcional), auditoria de autoria e soft delete. A categoria precisa ser do mesmo tipo do lançamento (categoria de saída só em saída). *(Validação no service; decisão do Claude.)*

Campos novos em `Transaction` para o recibo: `payerName String?` ("Recebido de", até 120) e `payerDocument String?` (CPF/CNPJ do pagador, só dígitos, validado). Só fazem sentido em entradas; em saída ficam nulos (validação no service).

Uma migration pequena com esses dois campos e `CHECK ("amountCents" > 0)` em `Transaction` *(decisão do Claude: hoje só a aplicação garante)*. Índices extras só se a consulta pedir. Qualquer migration mantém RLS e as FKs compostas.

`Category.deletedAt` e `PaymentMethod.deletedAt` ficam sem uso: nesses cadastros o único jeito de "sumir" é `active = false`. *(Decisão do Claude.)*

### Permissões (spec base + matriz existente)

| Ação | Admin | Funcionário |
|---|---|---|
| Ver lista e totais Entrou/Saiu | sim | sim |
| Ver Sobrou (lucro) | sim | **não** |
| Criar e editar lançamento | sim | sim (qualquer lançamento da empresa) |
| Excluir lançamento | sim | **não** |
| Gerenciar categorias e formas de pagamento | sim | não |

Checadas no service com `authorize`; os botões só refletem isso. Negação auditada como DENIED com o nome da permissão (`transaction.delete`, `settings.manage`…) — sem permissões novas na matriz. *(Decisão do Claude.)*

### Mês financeiro

O "mês" respeita `OrganizationSettings.monthStartDay` (1–28) e o `timezone` da empresa.
- Mês de referência **M** com início no dia **d** vai de **d/M** até o dia **d−1** do mês seguinte, inclusive. Com d = 1, é o mês civil.
- O mês atual é o que contém "hoje" no fuso da empresa (ex.: d = 5 e hoje 03/11 → mês de referência outubro, 05/10–04/11).
- Função pura e testada: `financialMonthRange(ref: { year, month }, startDay) → { from: Date, to: Date }` e `currentFinancialMonth(now, startDay, timezone) → { year, month }`.
- O rótulo mostra o mês de referência ("Outubro de 2026") e, quando d ≠ 1, o intervalo ("5/10 a 4/11").

### Lançamentos — telas

**`/lancamentos`** (desktop-first):
- Cabeçalho: título, seletor de mês (anterior/próximo + mês atual), botões "+ Entrada" e "+ Saída".
- Faixa de totais do filtro: Entrou, Saiu e, só para Admin, Sobrou.
- Filtros: tipo (Todos/Entradas/Saídas) e categoria (lista do tipo escolhido, incluindo as desativadas que tenham lançamentos no mês). Estado dos filtros na URL (`?mes=2026-10&tipo=saida&categoria=<id>`), para recarregar e compartilhar.
- Tabela: data, descrição, categoria, forma de pagamento, ícone de comprovante, valor (verde para entrada, vermelho para saída, com sinal), ações (editar; excluir só Admin). Ordem: data desc, depois criação desc.
- Paginação simples (50 por página) ou "carregar mais". *(Escolha do builder.)*
- Estado vazio próprio do mês sem lançamentos, com os dois atalhos.
- No celular: a tabela vira lista de cartões; o formulário vira tela cheia. Sem gaveta nesta fase.

**Formulário** (modal no desktop, Dialog):
- Campos: tipo (já vem do botão; pode trocar), valor (máscara BRL, teclado numérico no celular, > 0, máx. R$ 1.000.000,00), data (padrão hoje no fuso da empresa; **não aceita data futura** — decisão do usuário: lançamento é dinheiro que já entrou ou saiu), categoria (só ativas do tipo), forma de pagamento (ativas; opcional), descrição (obrigatória, 2–120 caracteres), comprovante (opcional).
- Atalhos: Enter salva; Esc fecha; "Salvar e lançar outro" mantém tipo, data e categoria e limpa o resto. *(Decisão do Claude, para lançar várias notas seguidas.)*
- Erros por campo em pt-BR; após salvar, toast e lista/Início atualizados.
- Editar abre o mesmo modal preenchido. Se a categoria ou forma de pagamento do lançamento estiver desativada, ela aparece selecionada com "(desativada)" e pode ser mantida.

**Excluir**: confirmação ("Excluir a saída 'Tinta branca' de R$ 95,00?"), exclusão lógica, auditada com o estado anterior.

### Recibo de pagamento

Pedido do usuário: em **entradas** (pagamentos de clientes registrados pelo usuário), gerar um recibo para imprimir ou compartilhar.

- O formulário de entrada ganha "Recebido de" (nome, opcional) e "CPF/CNPJ" (opcional). Saídas não têm esses campos.
- Na lista e no modal de edição de uma entrada: botão **"Recibo"**.
- O recibo é um **PDF gerado no servidor** pela rota `/lancamentos/[id]/recibo.pdf` *(decisão do Claude: um arquivo de verdade dá para mandar ao cliente pelo WhatsApp ou e-mail; a mesma base serve ao PDF do relatório na Fase 5)*. Biblioteca leve, sem navegador headless (ex.: `pdf-lib` ou `@react-pdf/renderer`; escolha do builder, justificar).
- Acesso: igual ao comprovante. Exige sessão da empresa, o lançamento tem que ser uma entrada da empresa e não pode estar excluído. Admin e Funcionário podem gerar. `Cache-Control: private, no-store`.
- Conteúdo (A4 retrato, também legível em meia folha):
  - Cabeçalho: logo (se houver), nome fantasia, razão social, CPF/CNPJ, endereço e telefone da empresa.
  - "RECIBO" e o número do recibo: código curto e estável derivado do lançamento (ex.: `R-2026-10-7F3A9C`) *(decisão do Claude; numeração sequencial por empresa fica para depois se o usuário pedir)*.
  - Valor em destaque (R$ 150,00) e **por extenso** ("cento e cinquenta reais").
  - Texto: "Recebi(emos) de **{Recebido de}**, CPF/CNPJ {documento}, a importância de **R$ 150,00 (cento e cinquenta reais)**, referente a **{descrição}**, pago via **{forma de pagamento}**." Sem pagador: linha em branco para preencher à mão; sem forma de pagamento, omite o trecho.
  - Local e data: "{cidade da empresa}, {data do lançamento por extenso}".
  - Linha de assinatura com o nome da empresa.
  - Rodapé discreto: "Gerado pelo BeeDock em {data e hora}".
- Na tela, o botão "Recibo" abre um painel com:
  - **Imprimir**: abre o PDF numa nova aba (o usuário imprime ou salva pelo próprio leitor de PDF).
  - **Baixar PDF**.
  - **Compartilhar**: usa o compartilhamento nativo com o arquivo (`navigator.share` com `files`) quando o navegador suporta; senão, baixa o PDF e mostra a dica "Anexe o arquivo no WhatsApp ou e-mail do cliente".
- Valor por extenso: função pura `valorPorExtenso(cents)` em pt-BR (reais e centavos, até R$ 1.000.000,00), com testes.
- Auditoria: `transaction.receipt_issue` a cada geração (o PDF tem dado pessoal do pagador; exportação de dado pessoal é auditada pela spec base). *(Decisão do Claude.)* O documento do pagador entra mascarado no `before/after` dos eventos de lançamento.

### Comprovante

- **Privado** (decisão do usuário): `put(..., { access: "private" })` no Vercel Blob (`@vercel/blob` 2.8.2 já suporta). O arquivo nunca é exposto por URL pública. Quem abre é a rota `/lancamentos/[id]/comprovante` (route handler): exige sessão da empresa (`requireTenant`), confere que o lançamento é da empresa e não foi excluído, e devolve o arquivo com `get(..., { access: "private" })` em stream, com `Cache-Control: private, no-store` e `Content-Disposition: inline`. O "link temporário" é esse: só vale para quem está logado naquele momento. Se o store do Blob do projeto não aceitar `private`, o builder para e reporta.
- Aceita `image/jpeg`, `image/png`, `image/webp` e `application/pdf`, até **3 MB** *(decisão do Claude: cabe no limite de ~4,5 MB do corpo da request na Vercel)*. Imagem grande é reduzida no cliente (lado maior 2000 px, JPEG/WebP) antes de enviar; PDF vai como está. `serverActions.bodySizeLimit` sobe para `"4mb"`.
- **Uma action só**, multipart, para criar/editar com o arquivo junto *(decisão do Claude)*: valida tudo → gera o id do lançamento na aplicação (`crypto.randomUUID()`, como na criação de empresa) → sobe o arquivo em `org/{organizationId}/receipts/{transactionId}-{timestamp}.{ext}` → grava lançamento + auditoria numa transação. Se a transação falhar, apaga o arquivo recém-enviado (`del`).
- Trocar ou remover o comprovante é uma edição auditada (`before/after.receiptUrl`); o arquivo antigo é apagado do Blob **depois** do commit. Na exclusão lógica do lançamento o arquivo é mantido (a exclusão é reversível pelo banco e a rota já bloqueia o acesso a lançamento excluído). *(Decisão do Claude.)*
- `receiptUrl` guarda o pathname do Blob, nunca uma URL pública.
- Sem `BLOB_READ_WRITE_TOKEN`: o campo mostra "Anexo indisponível neste ambiente" e o resto funciona.

### Início

- Cards Entrou, Saiu e Sobrou (só Admin) do mês financeiro atual, com valores reais (soma de `amountCents` de lançamentos não excluídos no intervalo).
- O título mostra o mês de referência (e o intervalo, quando o dia de início ≠ 1), usando o fuso da empresa em vez do fixo atual.
- Atalhos "+ Entrada" e "+ Saída" abrem o mesmo formulário de lançamento no próprio Início (sem ir para outra página). "+ Pedido" continua levando a `/pedidos`.
- Card "A receber" removido até a Fase 4.

### Categorias e formas de pagamento

- Telas em `/configuracoes/categorias` e `/configuracoes/formas-de-pagamento`, só Admin. Funcionário que abrir a URL vê uma tela "Só o Admin da empresa acessa esta área." (sem redirect, sem mecanismo de flash novo); a action nega e audita. *(Decisão do Claude.)*
- Categoria: nome (2–40), tipo (entrada/saída, imutável depois de criada), ativa. Nome único por empresa e tipo, **sem diferenciar maiúsculas** e contando os desativados: o service checa antes e, se o nome já existe desativado, responde "Já existe 'X' (desativada). Reative em vez de criar outra.". O unique do banco continua como rede; P2002 vira o mesmo erro de campo. Sem migration de índice. *(Decisão do Claude.)*
- Forma de pagamento: nome (2–40), ativa. Mesma regra de unicidade, por empresa.
- Desativar em vez de excluir. Item desativado some dos formulários novos, mas continua nos lançamentos antigos e nos filtros.
- Lista mostra quantos lançamentos usam cada item.
- Eventos de auditoria: `category.create/update`, `payment_method.create/update` (ativar/desativar são `update`).

### Auditoria — eventos

| action | quando |
|---|---|
| `transaction.create` | novo lançamento (after com tipo, valor, data, categoria, forma, descrição e se tem comprovante; a descrição entra inteira, como no exemplo da spec base "Maria editou a saída 'Tinta branca'") |
| `transaction.update` | edição, incluindo troca de comprovante (diff) |
| `transaction.delete` | exclusão lógica (before) |
| `transaction.receipt_issue` | geração do PDF do recibo |
| `category.create` / `category.update` | Admin |
| `payment_method.create` / `payment_method.update` | Admin |
| ação negada | DENIED com a action tentada |

Todos na cadeia da empresa, na mesma transação da escrita.

## Testes

- **Unit:** `valorPorExtenso` (1 centavo, R$ 1,00, R$ 21,50, R$ 100,00, R$ 1.001,10, R$ 1.000.000,00); `financialMonthRange`/`currentFinancialMonth` (d = 1, d = 5, virada de ano, fevereiro, fuso America/Fortaleza perto da meia-noite UTC); schemas Zod (valor, data futura, descrição, categoria do tipo errado); parser de valor BRL ("1.234,56" → 123456).
- **Integração (Neon):**
  - recibo: gera PDF (content-type application/pdf, contém valor e por extenso) para entrada da empresa; nega para saída, para outra empresa, para excluído e sem sessão; audita `transaction.receipt_issue`; pagador em saída é recusado;
  - comprovante: rota devolve o arquivo para usuário da empresa; nega para outra empresa, para lançamento excluído e sem sessão;
  - criar/editar/excluir lançamento com auditoria; excluído some da lista e dos totais;
  - Funcionário cria e edita, mas excluir é negado e auditado; Funcionário não recebe Sobrou nos totais;
  - categoria de outro tipo ou de outra empresa é recusada;
  - totais do mês respeitam o dia de início e ignoram excluídos;
  - categoria desativada não aparece para novo lançamento, mas o antigo continua válido;
  - nome de categoria duplicado vira erro de campo;
  - empresa A não lê nem edita lançamento da empresa B.
- **Navegador:** fluxo no desktop (1280px) e conferência no celular (390px): lançar saída pelo Início → card atualiza → filtrar na lista → editar → anexar comprovante → excluir como Admin; Funcionário sem Sobrou e sem botão excluir.

## Decisões do Claude (revisar)

- Categorias e formas de pagamento entram nesta fase; tipos de produto na Fase 4.
- "A receber" e "Próximas entregas" ficam para a Fase 4.
- Categoria precisa ser do mesmo tipo do lançamento.
- "Salvar e lançar outro" no formulário.
- Limite de valor R$ 1.000.000,00 e comprovante até 3 MB (limite da Vercel).
- `CHECK amountCents > 0` em migration.
- Upload do comprovante na mesma action do lançamento, com id gerado antes; arquivo antigo apagado após commit; mantido na exclusão lógica.
- Unicidade de nome sem diferenciar maiúsculas, contando desativados, checada no service.
- Negação auditada com a permissão existente (`settings.manage`), sem permissões novas.
- Funcionário em tela de Admin vê aviso no lugar, sem redirect.
- Descrição inteira na auditoria.
- Recibo em PDF gerado no servidor, com número curto derivado do lançamento e geração auditada; documento do pagador mascarado na auditoria.

## Deixado para o builder

Paginação vs. "carregar mais", estrutura interna dos componentes, layout exato da faixa de totais, ícones, texto exato das mensagens (mantendo o tom do projeto), índices extras se a consulta pedir.

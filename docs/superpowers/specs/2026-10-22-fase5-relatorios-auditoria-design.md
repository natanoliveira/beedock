# Fase 5 — Relatórios, auditoria, histórico e exportação LGPD — design

Data: 2026-10-22 · Status: escrito sem rodada de perguntas (usuário pediu "pule as perguntas"). Segue `prompt-beedock.md` e as decisões já tomadas pelo usuário; escolhas do Claude marcadas **[Claude]**.

Contexto obrigatório: `docs/CODEBASE_MAP.md`, `lib/audit.ts` (cadeia HMAC, `sanitize`), `scripts/audit-verify.ts`, specs das Fases 3 e 4 (eventos e `entityType` que esta fase lê).

## Perguntas para o usuário

1. **Eventos legados SHA-256 no dev** (5 eventos que hoje quebram `audit:verify`): a tela de verificação vai mostrá-los como "quebrados". Ok deixar assim no dev (produção começa limpa) ou quer marcá-los como legado conhecido?
2. **Histórico para o Funcionário**: proposta = aba "Histórico" só para Admin/MASTER (a spec base diz que Funcionário não vê auditoria). Quer que o Funcionário veja o histórico dos registros que ele pode editar?
3. **Comprovantes na exportação da empresa**: proposta = o JSON lista os lançamentos com "tem comprovante", sem os arquivos (eles continuam acessíveis um a um). Precisa de um pacote com os arquivos (ZIP)?

## Intenção

Com lançamentos e pedidos registrados, o dono precisa **ver o mês** (quanto entrou, saiu, sobrou, onde gastou, quanto falta receber) e **entregar ao contador** um arquivo. Tudo o que acontece já é gravado numa auditoria imutável em cadeia — mas ninguém consegue ler. E a LGPD exige que a empresa consiga entregar os dados de um titular e os seus próprios dados (portabilidade). Esta fase transforma o que já está no banco em telas e arquivos; quase não cria dado novo.

Sucesso: o Admin abre Relatórios, escolhe outubro, vê Entrou/Saiu/Sobrou, saídas por categoria e os pedidos do mês, baixa o PDF com a logo e o CSV para o contador. Num pedido, abre "Histórico" e lê "Maria registrou recebimento de R$ 200,00 (Pix) — ontem, 14:32". Em Auditoria, filtra por Maria em outubro e clica "Verificar integridade": "Cadeia íntegra (1.284 eventos)".

## Objetivos

1. **Relatório mensal** `/relatorios` (ADMIN/MASTER): mês financeiro, totais, entradas e saídas por categoria, últimos 6 meses, a receber, pedidos do mês; **PDF** e **CSV**.
2. **Auditoria da empresa** `/configuracoes/auditoria` (ADMIN/MASTER): linha do tempo em linguagem humana, filtros, detalhe com before/after, verificação da cadeia da empresa, exportação CSV.
3. **Auditoria global** `/plataforma/auditoria` (MASTER): mesma tela, todas as empresas + cadeia da plataforma, filtro por empresa, verificação de todas as cadeias.
4. **Histórico por registro**: pedido, cliente e lançamento, a partir do `AuditLog`.
5. **Exportação LGPD**: dados de um cliente (JSON), dados de um membro da equipe (JSON), dados completos da empresa (JSON) pelo Admin e pelo MASTER.
6. Toda exportação auditada.

## Não-objetivos

- Gráficos com biblioteca **[Claude]**: sem Recharts (não está instalado); barras horizontais em CSS com valores escritos ao lado. Entra se o usuário pedir gráfico interativo.
- PDF da exportação de titular **[Claude]**: só JSON (formato estruturado atende portabilidade; o recibo/relatório já cobrem leitura humana). PDF entra se pedido.
- Relatórios customizáveis, comparativo anual, DRE, fluxo de caixa projetado, conciliação bancária.
- Exportação agendada ou por e-mail.
- Encerramento de empresa (exportar → anonimizar → suspender definitivo): fase própria.
- Editar/apagar evento de auditoria (impossível por desenho).
- "A receber" histórico (posição no fim de cada mês passado) **[Claude]**: o relatório mostra a posição de hoje, com rótulo claro.

## Anti-objetivos (falha mesmo funcionando)

- Funcionário recebendo número de lucro, relatório ou evento de auditoria por qualquer caminho (page, action, route handler, histórico).
- Exportação ou relatório sem evento de auditoria.
- Leitura de auditoria fora de `withScope` (RLS devolve vazio silenciosamente) ou Admin lendo eventos de outra empresa / da plataforma.
- Detalhe do evento mostrando segredo ou dado pessoal sem máscara (o que está gravado já passou por `sanitize`; a tela não pode "desmascarar" buscando o valor atual).
- Relatório com totais diferentes do Início/Lançamentos para o mesmo mês (mesma função de período e mesma soma).
- CSV que abre quebrado no Excel pt-BR (acentos, separador, vírgula decimal).
- Verificação de cadeia que dá "íntegra" sem ter lido todos os eventos daquela cadeia.

## Decisões

### Dados

**Nenhuma migration** **[Claude]**. Índices existentes cobrem: `AuditLog(organizationId, occurredAt)`, `(entityType, entityId)`, `(userId)`; `Transaction(organizationId, occurredOn)`. Paginação da auditoria por cursor `seq` (único) dentro do filtro. Se a consulta por `action` ficar lenta, o builder cria `(organizationId, action, occurredAt)`.

Permissões: adicionar à matriz `"company.export": ADMIN` (o resto já existe: `report.view`, `report.export`, `audit.view`, `customer.export`, `member.manage`, `profit.view`). MASTER na empresa = ADMIN efetivo; no painel, `assertMaster`.

### Relatório mensal

- `/relatorios?mes=YYYY-MM` (padrão: mês financeiro atual), seletor anterior/próximo reutilizando o da Fase 3. Funcionário: `AdminOnlyNotice`; service `authorize("report.view")`.
- Service `monthlyReport(ctx, ym)` em `features/reports/service.ts`, **reusando** `financialMonthRange`/`getFinancialSettings` e a mesma soma de `monthSummary` (extrair se preciso — uma fonte só). Retorna:
  - Entrou, Saiu, Sobrou.
  - Entradas por categoria e saídas por categoria (nome, total, % do total) — inclui "Pedidos" e "Estorno".
  - Últimos 6 meses financeiros: entrou × saiu × sobrou (uma query `groupBy` por faixa de datas; 6 faixas calculadas em TS).
  - A receber **hoje** (função da Fase 4).
  - Pedidos do mês: criados (qtd, soma dos totais), entregues (`deliveredOn` no mês: qtd, soma), cancelados (`canceledAt` no mês, no fuso da empresa: qtd, soma dos estornos).
- Tela: KPIs, duas listas de barras CSS (entradas/saídas por categoria), tabela de 6 meses com mini-barras, bloco de pedidos. Desktop em duas colunas; celular empilha.
- **PDF** `app/(app)/relatorios/[mes]/relatorio.pdf/route.ts`: `pdf-lib`, cabeçalho da empresa com logo (helpers extraídos na Fase 4), mês e intervalo, os mesmos blocos em tabelas (sem gráfico), rodapé "Gerado pelo BeeDock em … por {nome}". `authorize("report.export")`.
- **CSV** `…/[mes]/lancamentos.csv/route.ts`: uma linha por lançamento não excluído do mês — `Data;Tipo;Categoria;Forma de pagamento;Descrição;Pedido;Valor` — UTF-8 com BOM, `;` como separador, valor `1234,56` (saída negativa `-1234,56`), data `dd/mm/aaaa`, campos com aspas escapadas. Sem `payerName`/`payerDocument` **[Claude]** (minimização; o contador não precisa).
- Auditoria: `report.export` com `after: { month, format: "pdf"|"csv" }`. Ver o relatório na tela não é auditado.

### Linguagem humana dos eventos

- Função pura `describeEvent(e, { entityLabel? })` em `features/audit/describe.ts`: mapa `action → frase` usando `userName`, papel e campos de `before/after` (ex.: `transaction.update` com `amountCents` → "Maria editou a saída 'Tinta branca': valor de R$ 80,00 para R$ 95,00"). Ação desconhecida → "Maria executou {action}". `DENIED` → "Acesso negado: {ação}" em tom de alerta. Ator MASTER → sufixo "(MASTER)".
- Tempo relativo ("hoje, 14:32", "ontem", "12/10, 09:10") no fuso da empresa (`lib/format-date.ts`).
- Sem tabela de tradução no banco; o mapa cobre todos os eventos das Fases 1–5 (lista viva nas specs).

### Auditoria da empresa — `/configuracoes/auditoria`

- Substitui o placeholder. `authorize("audit.view")`; Funcionário → `AdminOnlyNotice` (hoje redireciona; trocar para o padrão das outras telas).
- Filtros na URL: período (de/até, padrão últimos 30 dias), pessoa (membros + "MASTER" + "Sistema/sem usuário"), grupo de ação (Lançamentos, Pedidos, Clientes, Equipe, Configurações, Acesso, Exportações, Negados — mapeado por prefixo de `action`), resultado, registro (`entityType`+`entityId`, preenchido ao vir do Histórico).
- Lista: 50 por página, `occurredAt desc, seq desc`, "Carregar mais" por cursor. Linha = frase + quando + dispositivo.
- **Detalhe** (Sheet lateral no desktop / Drawer no celular): tabela campo | antes | depois (só os campos gravados, já mascarados), motivo, IP, user agent, `requestId`, resultado, `seq`, hash curto. Link "Abrir registro" quando o `entityType` tem tela.
- **Verificar integridade**: action `verifyOrgChain(ctx)` lê a cadeia **inteira** da empresa por `seq asc` em lotes de 1.000 (dentro de `withScope`), recalcula com `computeHash` e compara `prevHash`/`hash` — **extrair o laço de `scripts/audit-verify.ts` para `lib/audit-verify.ts`** e usar nos dois (script e telas). Resultado: "Cadeia íntegra (N eventos)" ou "N eventos com problema" + primeiros `seq` quebrados. Não audita (leitura) **[Claude]**. Ponytail: síncrono; se passar de ~100k eventos por empresa, mover para job.
- **Exportar CSV** do filtro atual (até 50.000 linhas; acima disso pede para reduzir o período): colunas data/hora, pessoa, papel, ação, frase, registro, resultado, motivo, IP. Auditoria `audit.export` com o filtro em `after`.
- MASTER dentro da empresa vê a mesma tela; os eventos dele aparecem para o Admin (transparência intencional).

### Auditoria global — `/plataforma/auditoria`

- `requireMaster` + `assertMaster`; leitura em `withScope({ platform: true })` (policy `audit_read` já libera tudo para a plataforma).
- Mesmo organism da tela da empresa (`AuditTimeline` + filtros), com filtro extra **Empresa** (todas | "Plataforma" = `organizationId null` | empresa específica) e coluna Empresa.
- Verificar: da empresa filtrada, da plataforma, ou "todas as cadeias" (mesmo helper, agrupando por `organizationId` como o script).
- Exportar CSV: `platform.audit_export` na cadeia da plataforma.
- Link no `PlatformNav`.

### Histórico por registro

- Seção/aba "Histórico" em `/pedidos/[id]`, `/clientes/[id]` e no modal de edição do lançamento (link "Ver histórico" que abre Sheet/Drawer). Só para quem tem `audit.view` (pergunta 2).
- Service `recordHistory(ctx, { type, id })`, sempre em `withScope` da empresa:
  - **Lançamento**: `entityType = 'Transaction' AND entityId = id`.
  - **Pedido**: eventos do `Order`, dos `OrderPayment` do pedido e dos `Transaction` com `orderId` (ids lidos antes, inclusive excluídos).
  - **Cliente**: eventos do `Customer` + `order.create`/`order.cancel` dos pedidos dele.
- Linha do tempo cronológica (antigo → recente), mesma `describeEvent`, mesmo detalhe; "Ver tudo na auditoria" leva ao filtro por registro. Até 200 eventos por registro (ponytail: sem paginação).

### Exportação LGPD

- **Cliente** (`customer.export`, Admin): botão "Exportar dados" em `/clientes/[id]` → route handler `…/clientes/[id]/dados.json`, `Content-Disposition: attachment; filename="cliente-{id}.json"`. Conteúdo: dados cadastrais **sem máscara** (é o titular/controlador pedindo), pedidos (número, descrição, tipo, total, status, datas), recebimentos (data, forma, valor), empresa controladora (nome, CNPJ) e DPO da empresa (`OrganizationSettings.dpo*`), `exportedAt`. Anonimizado → exporta o que restou (vazio de PII). Auditoria `customer.export` (sem conteúdo em `after`, só `{ format: "json" }`).
- **Membro da equipe** (`member.manage`, Admin): "Exportar dados" na linha de `/configuracoes/equipe` → JSON com nome, e-mail, telefone, papel, ativo, datas do vínculo, último acesso e aceites de termos. Sem eventos de auditoria do membro (são registros da empresa) **[Claude]**. Auditoria `member.export`.
- **Empresa** (`company.export`, Admin; MASTER pelo painel em `/plataforma/empresas/[id]`): route handler `…/configuracoes/exportar/empresa.json` (e equivalente na plataforma). Um JSON com `organization`, `settings`, `categories`, `paymentMethods`, `productTypes`, `customers` (inclusive anonimizados), `orders`, `orderPayments`, `transactions` (com `hasReceipt`, sem arquivos — pergunta 3), `members` (nome, e-mail, papel, ativo), `exportedAt`, `schemaVersion: 1`. Sem `passwordHash`, tokens, hashes de convite, sessões ou auditoria (auditoria tem export próprio). Lido numa transação `withScope` única (snapshot consistente). Ponytail: monta em memória; streaming se uma empresa passar de dezenas de MB. Auditoria `organization.export` (empresa) / `platform.organization_export` (MASTER, cadeia da empresa, ator MASTER).
- Card "Exportar dados da empresa" em `/configuracoes` (Admin) com aviso "Contém dados pessoais de clientes e equipe. Guarde com cuidado."

### Auditoria — eventos novos

| action | cadeia | quando |
|---|---|---|
| `report.export` | empresa | PDF ou CSV do relatório |
| `audit.export` | empresa | CSV da auditoria |
| `platform.audit_export` | plataforma | CSV da auditoria global |
| `customer.export` | empresa | JSON do cliente |
| `member.export` | empresa | JSON do membro |
| `organization.export` | empresa | JSON da empresa pelo Admin |
| `platform.organization_export` | empresa | JSON da empresa pelo MASTER |
| DENIED | empresa/plataforma | tentativa negada |

Route handlers de exportação auditam **antes** de enviar o corpo (se a auditoria falhar, nada é entregue), na mesma tx de leitura quando possível.

## Testes

- **Unit**: `describeEvent` (cada action conhecida, desconhecida, DENIED, MASTER, valores em centavos → BRL); gerador de CSV (BOM, `;`, aspas, vírgula decimal, negativo); faixas dos 6 meses com `monthStartDay = 5` e virada de ano; helper de verificação de cadeia com cadeia válida, `prevHash` errado, hash adulterado e evento faltando no meio.
- **Integração (Neon)** — ids escalares de limpeza iniciados com `""`; eventos de auditoria criados pelos testes não podem ser apagados (append-only): usar empresas de teste próprias e filtrar por elas:
  - relatório: totais iguais aos de `monthSummary` para o mesmo mês; por categoria soma o total; estorno aparece em saídas; pedidos criados/entregues/cancelados no mês; Funcionário negado + DENIED (`report.view`/`report.export`);
  - PDF/CSV: content-type correto, contém os totais, auditados; sem sessão → 401/redirect; outra empresa não vaza;
  - auditoria da empresa: Admin vê só a própria cadeia (nenhum evento de outra empresa ou da plataforma); Funcionário negado; filtros por pessoa/período/registro; paginação por cursor sem repetir;
  - verificação: cadeia de empresa de teste íntegra → ok; (adulteração simulada só em unidade — o banco impede UPDATE);
  - global: MASTER vê todas e filtra por empresa e "Plataforma"; não-MASTER negado;
  - histórico do pedido inclui eventos do pedido, recebimentos e lançamentos ligados; de outra empresa vazio;
  - exportações: cliente (dados sem máscara, sem pedidos de outro cliente), membro, empresa (sem `passwordHash`/`tokenHash`; contagens batem com o banco), todas auditadas; Funcionário negado;
  - exportação da empresa pelo MASTER audita com `userRole = MASTER` na cadeia da empresa.
- **Navegador**: Admin baixa PDF e CSV (abrir o CSV num leitor e conferir acentos), filtra auditoria, abre detalhe, verifica cadeia, abre histórico de um pedido; Funcionário sem Relatórios/Auditoria/Histórico; MASTER na auditoria global.

## Validação UI

`/frontend-design` e `/ui-ux-pro-max` (relatório e auditoria são telas novas densas) antes de implementar. Validar com agent-browser no dev (porta 3004), 1280px e 390px, ou previews em `previews/`. Os 5 eventos legados do dev aparecem como quebrados na verificação (pergunta 1) — não é bug desta fase.

## Deixado para o builder

- Divisão em `features/reports/`, `features/audit/`, `features/exports/` (sugestão); nomes de rotas de arquivo (manter `.pdf`/`.csv`/`.json` no path como o recibo).
- Layout das barras CSS, do Sheet de detalhe e da linha do tempo (organism `AuditTimeline` compartilhado por empresa, plataforma e histórico).
- Frases exatas de `describeEvent` (tom das specs: "Maria editou a saída 'Tinta branca'…").
- Índice extra em `AuditLog` só se a consulta pedir.
- Atualizar `docs/CODEBASE_MAP.md` e README (funcionalidades, scripts) ao final.

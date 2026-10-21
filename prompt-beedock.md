# PAPEL
Você é um desenvolvedor Full Stack Sênior especialista em Next.js, TypeScript, PostgreSQL, segurança de aplicações e PWAs mobile-first. Vai construir do zero um sistema de gestão financeira simples, multi-empresa, auditável e aderente à LGPD. Priorize simplicidade, código limpo e segurança. Não adicione funcionalidades além das descritas. Se algo estiver ambíguo, pergunte antes de implementar.

---

# CONTEXTO
**BeeDock** é uma plataforma de gestão para pequenas empresas de personalização (serigrafia, sublimação, DTF, canecas, bolsas e bonés).

Conceito da marca: **Dock**, a estação de organização, encaixe e recebimento de cargas e pedidos. O sistema organiza o fluxo de entrada de encomendas e de saída de entregas da estamparia, como uma doca onde tudo chega, é organizado e sai no horário. O "Bee" traz a ideia de colmeia: trabalho organizado, cada coisa no seu lugar. Tom organizado, confiável e ágil.

O sistema atenderá **três empresas desde o início**, sendo a primeira a **Prime Studio - Uniformes**. As empresas são cadastradas pelo administrador da plataforma; não haverá cadastro público agora. A arquitetura deve estar pronta para virar SaaS no futuro, sem reescrita.

Cada empresa precisa:
- Registrar pedidos dos clientes e quanto recebeu de cada um
- Controlar os gastos
- Ver um relatório mensal de entradas, saídas e lucro
- Cadastrar os dados da empresa, a logo e os funcionários que usam o sistema

Os usuários só têm celular, sem computador. O sistema deve ser **mobile-first e instalável como PWA**.

---

# STACK
- **Next.js** (última versão estável, App Router), frontend e backend no mesmo projeto
  - Backend via Server Actions; Route Handlers só quando necessário
- **TypeScript** strict, zero `any`
- **PostgreSQL no Neon** + **Prisma**
- **Zod** para validação (formulários, Server Actions e variáveis de ambiente)
- **Auth.js** com login por e-mail e senha
- **Tailwind CSS** + componentes de três fontes, todas instaladas via CLI do shadcn (registry), com o código copiado para o projeto:
  - **shadcn/ui**: base de tudo (Button, Input, Card, Sheet, Drawer, Dialog, Select, Tabs, Sonner, Skeleton, Chart)
  - **Kibo UI**: componentes mais ricos que o shadcn não tem (ex.: Dropzone, Status, Pill). Consulte a documentação do Kibo UI para confirmar os disponíveis.
  - **Rare UI**: só para microinterações e animações pontuais. Usar com moderação.
- **Serwist** para PWA
- **Recharts** (via Chart do shadcn) para gráficos
- **@react-pdf/renderer** para exportação em PDF
- **Vercel Blob** para logos e fotos de comprovante
- **Vitest** (services, regras, isolamento de tenant) e **Playwright** (fluxos críticos em viewport mobile)
- **ESLint + Prettier** + `eslint-plugin-boundaries`
- Hospedagem na **Vercel**; sem Docker (desenvolvimento local usa uma branch de desenvolvimento do Neon)

---

# ESTRUTURA
```
beedock/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── convite/[token]/
│   ├── (app)/                       # área logada da empresa
│   │   ├── inicio/
│   │   ├── pedidos/
│   │   ├── lancamentos/
│   │   ├── clientes/
│   │   ├── relatorios/
│   │   └── configuracoes/
│   │       ├── empresa/
│   │       ├── funcionarios/
│   │       ├── categorias/
│   │       ├── preferencias/
│   │       └── auditoria/
│   ├── (plataforma)/plataforma/     # empresas, convites, suporte
│   └── (public)/
│       ├── privacidade/
│       └── termos/
├── components/
│   ├── ui/                          # componentes instalados (shadcn, Kibo UI, Rare UI)
│   ├── atoms/
│   ├── molecules/
│   ├── organisms/
│   └── templates/
├── features/                        # actions, services e hooks por domínio
├── lib/                             # db, auth, env, permissions, audit, tenant, logger
├── prisma/                          # schema, migrations, seed, SQL de RLS
└── scripts/                         # create-org, create-admin, audit-verify
```
Fluxo de uma ação: **Página → Organismo → Server Action (valida com Zod, checa sessão) → Service (regras, permissão, auditoria) → Prisma → Neon**. Nenhuma regra de negócio dentro de componente React.

---

# DESIGN SYSTEM — ATOMIC DESIGN
Organize todos os componentes pela metodologia Atomic Design (Brad Frost).

| Camada | O que é | Pode importar | Exemplos |
|---|---|---|---|
| **ui/** | Componentes crus instalados das bibliotecas | — | `button`, `input`, `drawer`, `dropzone` |
| **Átomos** | Wrappers dos componentes `ui/` com o padrão visual do projeto. Sem regra de negócio | `ui/` | `AppButton`, `MoneyText` (centavos → BRL), `CategoryPill`, `StatusBadge`, `Icon` |
| **Moléculas** | Combinação pequena de átomos com um propósito único | átomos | `MoneyInput` (label + input numérico + máscara + erro), `DateField`, `KpiCard`, `TransactionRow`, `EmptyState` |
| **Organismos** | Blocos completos de interface; recebem dados e callbacks | átomos, moléculas | `TransactionForm`, `OrderForm`, `PaymentList`, `BottomNav`, `MonthSelector`, `ExpensesByCategoryChart`, `AuditTimeline` |
| **Templates** | Esqueleto da tela, sem dados reais | organismos | `AppShellTemplate` (header + conteúdo + barra inferior + FAB), `ListPageTemplate`, `FormPageTemplate` |
| **Páginas** | Rotas em `app/`. Buscam dados e montam o template | templates, organismos, `features/` | `inicio/page.tsx` |

## Regras
- Importação só de cima para baixo; `eslint-plugin-boundaries` garante isso.
- Átomos e moléculas são puros e apresentacionais: não acessam banco, sessão nem Server Actions.
- Nenhuma página usa componente de `ui/` diretamente; sempre passa por um átomo.
- Cada componente em pasta própria (`MoneyInput/index.tsx`, `MoneyInput.types.ts`, teste quando houver lógica).
- Variantes com `class-variance-authority` (cva). Cores, raio e espaçamento só via tokens CSS do tema (`--primary`, `--radius` etc.).
- Kibo UI e Rare UI usam os mesmos tokens do shadcn.
- Animações (Rare UI): respeitar `prefers-reduced-motion`; nada de animação em listas longas ou formulários; carregar com `next/dynamic`.

---

# MULTI-EMPRESA

## Modelo
- Banco compartilhado com isolamento por linha: toda tabela de negócio tem `organizationId` (obrigatório, indexado).
- Constraints únicas sempre compostas com `organizationId`.
- Usuário ligado a empresas via `Membership` (User ↔ Organization + papel). A sessão guarda a `activeOrganizationId`; se o usuário tiver mais de uma empresa, mostrar um seletor.

## Isolamento em duas camadas (obrigatório)
1. **Aplicação**: Prisma Client Extension que injeta `organizationId` em toda leitura e escrita a partir do `TenantContext` (`organizationId`, `userId`, `role`) da sessão. Services recebem o `TenantContext`, nunca o buscam sozinhos.
2. **Banco**: **Row Level Security (RLS)** do PostgreSQL em todas as tabelas de negócio. Cada transação executa `set_config('app.current_org', <id>, true)` e as policies filtram por ele.
- Testes automatizados provando que a empresa A não lê, altera nem exclui dados da empresa B.
- Uploads no Vercel Blob com prefixo `org/{organizationId}/`.

## Futuro SaaS (preparado, desligado)
- `ENABLE_SIGNUP=false`, campo `plan` na Organization (`FREE` por padrão), helper `canUse(feature)` e `slug` único por empresa (para subdomínio futuro). Sem billing.

---

# FUNCIONALIDADES

## 1. Painel da plataforma (`/plataforma`)
Acessível só ao papel global `PLATFORM_ADMIN` (definido no `User`, não na Membership).
- Cadastrar empresa (dados básicos + slug) e convidar o **Dono** por link com validade de 48h.
- Listar empresas com status (ativa/suspensa), quantidade de usuários e último acesso.
- Suspender e reativar empresa (usuários de empresa suspensa não entram).
- Exportar todos os dados de uma empresa (portabilidade).
- O administrador da plataforma **não acessa dados financeiros das empresas pela interface**. Para suporte, usa o modo "acesso de suporte": exige justificativa escrita, dura no máximo 1 hora, mostra aviso visível ao Dono da empresa e é registrado na auditoria.

## 2. Configurações da empresa
**Dados da empresa**
- Nome fantasia, razão social (opcional), CPF ou CNPJ (validado), telefone/WhatsApp, e-mail, endereço (busca por CEP via ViaCEP), chave Pix (opcional).
- **Logo**: upload pela câmera ou galeria, recorte quadrado no celular e compressão no client antes de enviar ao Vercel Blob.
- **Cor principal** (seletor de cor), aplicada ao tema via `--primary` carregada do banco.
- Logo e dados aparecem no cabeçalho do app e no PDF do relatório.

**Cadastros auxiliares**
- Categorias de entrada e saída, formas de pagamento e tipos de produto (criar, editar, desativar; nunca apagar se estiverem em uso).
- Valores padrão semeados ao criar a empresa:
  - Entradas: Pedidos, Outras entradas
  - Saídas: Peças lisas, Insumos, Energia, Aluguel, Transporte, Manutenção, Impostos, Outros
  - Formas de pagamento: Pix, Dinheiro, Cartão
  - Tipos de produto: Camisa, Caneca, Bolsa, Boné, Outros

**Preferências**
- Dia de início do mês financeiro (padrão 1), fuso horário (padrão `America/Fortaleza`), moeda (padrão BRL), tempo de expiração de sessão por inatividade, prazo de retenção para revisão de clientes inativos, contato do encarregado (DPO).

## 3. Funcionários e permissões
- O Dono cadastra funcionários com nome, WhatsApp, e-mail e papel.
- Convite por **link com validade de 48h**, compartilhável pelo WhatsApp; o funcionário cria a própria senha.
- Desativar funcionário sem apagar o histórico; o Dono pode encerrar sessões ativas de um funcionário.
- Papéis:

| Papel | Pode |
|---|---|
| **Dono** | Tudo, inclusive configurações, funcionários, auditoria e excluir lançamentos |
| **Gerente** | Tudo, exceto gerenciar funcionários e dados da empresa |
| **Funcionário** | Cadastrar e ver pedidos e clientes, lançar entradas e saídas. Não vê relatórios, lucro nem auditoria; não exclui |

- Permissões checadas no **service**, não só escondendo botões. Matriz papel × ação centralizada em `lib/permissions.ts`.

## 4. Clientes
- Nome e WhatsApp obrigatórios; e-mail, CPF e endereço opcionais; observação.
- Botão "Chamar no WhatsApp" (link `wa.me`).
- Histórico de pedidos e saldo devedor do cliente.
- Ações LGPD: exportar, corrigir e anonimizar (ver seção LGPD).

## 5. Pedidos
- Cliente, descrição (ex.: "20 camisas time Unidos"), tipo de produto, valor total, data de entrega e status (**Aberto → Pronto → Entregue**, ou Cancelado).
- **Recebimentos**: registrar sinal e pagamentos parciais. O pedido mostra valor pago e saldo a receber.
- Cada recebimento gera automaticamente um lançamento de entrada.

## 6. Lançamentos (entradas e saídas)
- Tipo, valor, data, categoria, forma de pagamento e descrição.
- Foto do comprovante opcional (câmera do celular).
- Lista filtrável por mês, tipo e categoria. Editar e excluir conforme permissão.

## 7. Início (dashboard)
- Cards do mês: **Entrou, Saiu, Sobrou** (lucro) e **A receber** (saldos de pedidos em aberto). Funcionário não vê "Sobrou".
- Próximos pedidos a entregar.
- Atalhos grandes: "+ Entrada", "+ Saída", "+ Pedido".

## 8. Relatório mensal
- Seletor de mês.
- Total de entradas, saídas e lucro; gastos por categoria (barras ou pizza); entradas × saídas dos últimos 6 meses.
- Exportar em PDF (com logo e dados da empresa) e CSV para o contador.

---

# LGPD
Papéis: cada empresa cliente é **controladora** dos dados dos seus clientes e funcionários; o operador da plataforma é **operador**. O sistema deve permitir que cada empresa cumpra a LGPD.

## Minimização
- Coletar só o necessário (ver campos obrigatórios de Clientes).
- Nunca registrar dados pessoais em logs de aplicação. Usar um logger em `lib/logger.ts` que mascara CPF, telefone e e-mail.

## Direitos dos titulares
Na tela de cada cliente e funcionário, o Dono pode:
- **Exportar** os dados da pessoa em JSON e PDF.
- **Corrigir** os dados.
- **Anonimizar**: substitui nome, telefone, e-mail, CPF e endereço por valores irreversíveis (ex.: "Cliente removido #a1b2"), mantendo os valores financeiros. Exige justificativa. Exclusão física não é usada porque registros financeiros precisam ser guardados por obrigação legal e contábil.

## Consentimento e transparência
- Termos de Uso e Política de Privacidade versionados no banco. Todo usuário aceita no primeiro acesso e a cada nova versão; guardar versão, data, IP e user agent.
- Páginas públicas `/privacidade` e `/termos`, com contato do encarregado.

## Retenção
- Dados financeiros mantidos por no mínimo 5 anos.
- Clientes sem movimentação além do prazo configurado aparecem numa lista para revisão de anonimização.
- Logs de auditoria mantidos por 5 anos.

## Segurança
- HTTPS (Vercel); cookies de sessão `httpOnly`, `secure`, `sameSite=lax`.
- Senhas com Argon2id (ou bcrypt). Bloqueio temporário após 5 tentativas de login falhas.
- Sessão expira por inatividade (configurável).
- Rate limit no login e nos links de convite.
- Headers de segurança (CSP, HSTS, X-Frame-Options) no `next.config`.
- Neon e Vercel Blob na região mais próxima do Brasil disponível; documentar no README e na Política de Privacidade onde os dados ficam armazenados.
- Backups via point-in-time restore do Neon, com procedimento de restauração documentado.
- Upload: validar tipo MIME e tamanho.

## Encerramento de empresa
- Exportação completa entregue ao Dono, depois anonimização dos dados pessoais e suspensão definitiva, tudo auditado.

---

# AUDITORIA
Registro completo e imutável de toda ação relevante.

## Campos de cada evento
| Campo | Exemplo |
|---|---|
| Quando | `occurredAt` (UTC, milissegundos) |
| Quem | `userId`, nome e papel no momento da ação |
| Empresa | `organizationId` (nulo para ações da plataforma) |
| O quê | `action` (ex.: `transaction.create`, `customer.anonymize`, `auth.login_failed`) |
| Registro | `entityType` e `entityId` |
| Mudança | `before` e `after` em JSON, só com os campos alterados |
| Origem | IP, user agent e dispositivo |
| Resultado | `SUCCESS`, `DENIED` ou `FAILED` |
| Rastreio | `requestId` |
| Motivo | Justificativa, quando exigida |

## Eventos obrigatórios
- **Autenticação**: login, logout, login falho, bloqueio, troca e redefinição de senha, aceite de termos.
- **Negócio**: criar, editar e excluir pedidos, recebimentos, lançamentos e clientes.
- **Administração**: convites, ativação, mudança de papel e desativação de funcionários; alterações de dados da empresa, logo, categorias e preferências; ações do painel da plataforma.
- **LGPD**: exportações (relatórios, dados de titular, empresa, auditoria), anonimizações, acesso de suporte.
- **Segurança**: toda tentativa negada por permissão ou por tenant.

## Regras técnicas
- Evento gravado **na mesma transação** da alteração, via helper `withAudit()` no service. Se a auditoria falhar, a alteração não acontece.
- Tabela **append-only**: o usuário de banco da aplicação não tem `UPDATE` nem `DELETE` nela; trigger reforça o bloqueio.
- **Encadeamento por hash**: cada registro guarda o SHA-256 do registro anterior da mesma empresa. Script `pnpm audit:verify` valida a cadeia.
- Senhas, tokens e hashes nunca entram em `before`/`after`. Dados pessoais aparecem mascarados (ex.: `(86) 9****-1234`).
- Índices em `organizationId + occurredAt`, `entityType + entityId` e `userId`.

## Telas (Dono e PLATFORM_ADMIN)
- Linha do tempo em linguagem humana: "Maria editou a saída 'Tinta branca': valor de R$ 80,00 para R$ 95,00 — hoje, 14:32".
- Filtros por período, funcionário, tipo de ação e registro.
- Aba "Histórico" na tela de cada pedido, lançamento e cliente.
- Exportação em CSV (também auditada).

---

# REGRAS GERAIS
- Valores monetários como inteiro em centavos; formatação BRL só na interface.
- Datas em UTC no banco, exibidas no fuso da empresa.
- Tabelas de negócio com `organizationId`, `createdAt`, `updatedAt`, `createdById`, `updatedById` e `deletedAt` (soft delete).
- Linguagem simples na interface: "Entrou", "Saiu", "Sobrou".
- Mensagens de erro em português, claras para o usuário.

---

# UX MOBILE-FIRST
- Projetar para telas de 360–430px; desktop é bônus.
- Barra inferior: Início, Pedidos, Lançamentos, Relatórios, Mais (clientes, configurações, auditoria).
- Formulários abrem em **Drawer** (de baixo para cima), não em Dialog.
- Alvos de toque com no mínimo 44px; teclado numérico nos campos de valor, com máscara de moeda; `inputmode="tel"` no WhatsApp.
- Cadastrar uma saída deve levar menos de 15 segundos.
- Skeletons no carregamento, toast de feedback e confirmação antes de excluir ou anonimizar.
- Tema claro/escuro; contraste AA; labels em todos os campos.

---

# PWA
- Manifest com nome "BeeDock", ícones 192/512 (maskable), `display: standalone`, orientação retrato.
- Instalável no Android e no iOS, com prompt de instalação customizado e instruções para iPhone.
- Cache do app shell para abrir rápido; página de fallback offline amigável.

---

# INFRAESTRUTURA E DEPLOY

## Neon
- Integração oficial Neon + Vercel (Vercel Marketplace).
- Branches: `main` → produção; `dev` → desenvolvimento local; branch automática por Pull Request para os previews.
- `DATABASE_URL` com conexão **pooled** (host `-pooler`) para a aplicação; conexão direta para migrations, conforme a versão atual do Prisma.
- Avaliar o driver adapter `@prisma/adapter-neon` para serverless. Prisma Client como singleton em `lib/db.ts`.
- RLS e trigger da auditoria versionados em migrations SQL.

## Vercel
- Push na `main` → produção; Pull Request → preview.
- `prisma migrate deploy` no script `vercel-build`; nunca `migrate dev` em produção.
- Região das functions próxima à do banco.

## Variáveis de ambiente
- Validadas com Zod em `lib/env.ts`; a aplicação falha com mensagem clara se faltar alguma.
- Mínimo: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, `BLOB_READ_WRITE_TOKEN`, `ENABLE_SIGNUP`.
- Administrador da plataforma criado por `pnpm create-admin` e empresas por `pnpm create-org`; nenhuma senha no seed ou no código.

---

# REPOSITÓRIO PÚBLICO NO GITHUB

## Sem assinatura de IA
- Nenhum commit, PR, comentário de código, README ou arquivo pode conter assinatura ou menção a ferramenta de IA: sem `Co-Authored-By`, sem "Generated with...", sem rodapés automáticos.
- Commits em **Conventional Commits**, idioma consistente (ex.: `feat(lancamentos): adiciona filtro por categoria`).
- `CLAUDE.md`, `.claude/`, `.cursor/` e similares no `.gitignore`.

## Segurança do repositório
- Nenhum segredo versionado; `.env*` no `.gitignore`, exceto `.env.example` só com nomes e comentários.
- Seed só com dados fictícios.
- Ativar secret scanning, push protection e Dependabot.
- `main` protegida: merge só via PR com CI verde.

## CI (GitHub Actions)
- Em todo PR: install, lint, typecheck, testes (incluindo isolamento de tenant) e build.

## Arquivos
- `README.md`, `LICENSE`, `.env.example`, `.gitignore`, `.editorconfig`, `.nvmrc`, `CONTRIBUTING.md` curto e `.github/pull_request_template.md`.

## README.md
Em português, nesta ordem:
1. Título e descrição curta (2–3 linhas)
2. Badges: CI, licença, Next.js, TypeScript
3. Screenshots das telas no celular, lado a lado
4. Funcionalidades
5. Stack (tabela tecnologia × uso)
6. Arquitetura: estrutura de pastas, Atomic Design, multi-empresa com RLS e auditoria, com diagrama Mermaid do fluxo Página → Organismo → Server Action → Service → Prisma → Neon
7. Segurança e LGPD: resumo das medidas e onde os dados ficam armazenados
8. Como rodar localmente: pré-requisitos e passo a passo do clone ao `pnpm dev`
9. Variáveis de ambiente (tabela: nome, descrição, onde obter)
10. Scripts disponíveis (`dev`, `build`, `lint`, `test`, `db:migrate`, `db:seed`, `create-admin`, `create-org`, `audit:verify`)
11. Deploy: Vercel + Neon
12. Backup e restauração
13. Instalando como app no celular (Android e iPhone)
14. Roadmap
15. Licença

Sem texto genérico ou de marketing; tudo verificável no projeto.

---

# MODELO DE DADOS
Organization, User (com `platformRole`), Membership, Invitation, Session, OrganizationSettings, LegalDocument, LegalAcceptance, SupportAccessGrant, Customer, Order, OrderPayment, Transaction, Category, PaymentMethod, ProductType, AuditLog.

---

# ENTREGA
Trabalhe em fases e pare ao fim de cada uma para validação:

1. **Fase 1 — Fundação**: setup, Neon, Prisma, RLS + extension de tenant, auth com bloqueio por tentativas, `withAudit()` e auditoria imutável com hash, design system base (átomos e templates), layout mobile com barra inferior, PWA, CI, primeiro deploy na Vercel e README inicial.
2. **Fase 2 — Empresas e pessoas**: painel da plataforma (empresas, convite de Dono, acesso de suporte), configurações da empresa (dados, logo, cor, cadastros auxiliares, preferências), funcionários com convite e permissões, aceite de termos.
3. **Fase 3 — Lançamentos**: entradas e saídas com comprovante e filtros.
4. **Fase 4 — Clientes e pedidos**: clientes com exportação e anonimização LGPD; pedidos com recebimentos gerando lançamentos.
5. **Fase 5 — Visão**: Início, relatório mensal com PDF/CSV e telas de auditoria.

Em cada fase entregue: código, migrations, seed com dados fictícios de três empresas, testes e README atualizado.

---

# CRITÉRIOS DE QUALIDADE
- Zero `any`; erros tratados com mensagens em português.
- Nenhuma regra de negócio em componente React.
- Toda ação de escrita passa por service com checagem de permissão, tenant e auditoria.
- Testes de isolamento entre empresas obrigatórios no CI.
- Lighthouse mobile ≥ 90 em Performance, Acessibilidade e Boas Práticas.
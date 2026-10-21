# Fase 2a — Seed MASTER + módulo de empresas (painel /plataforma)

Data: 2026-10-21 · Status: design aprovado em chat; perguntas do revisor respondidas; spec aguardando revisão do usuário

## Intenção

Hoje uma empresa só nasce pelo terminal (`pnpm create-org`) e o Admin recebe senha digitada por quem roda o script. O MASTER (o dev, dono da plataforma) precisa cadastrar e administrar empresas pelo navegador e entregar o acesso ao Admin sem nunca conhecer a senha dele. Este módulo transforma `/plataforma` (hoje um placeholder) no painel de empresas e cria o fluxo de convite.

Sucesso: o MASTER cria uma empresa completa pelo celular ou desktop e manda o link de convite pelo WhatsApp. O Admin define a própria senha, entra pelo login e cai em `/inicio` com a marca da empresa aplicada. Tudo auditado na cadeia HMAC.

## Objetivos

1. **Seed do MASTER** a partir do `.env`, idempotente e auditado.
2. **Cadastrar empresa** com todos os dados (o MASTER preenche tudo; o Admin poderá editar depois, quando existir a tela de configurações).
3. **Editar empresa** (mesmo formulário).
4. **Listar empresas** com status, nº de usuários ativos e último acesso.
5. **Convite do Admin** por link de 48h: gerar, copiar, enviar por WhatsApp, reenviar (revoga o anterior).
6. **Aceitar convite** em `/convite/[token]`: Admin cria a própria senha.
7. **Suspender / reativar** empresa; suspender derruba as sessões ativas.
8. Toda escrita e toda negação auditadas.

## Fora do escopo (não fazer)

Acesso de suporte (dropdown de empresa no header), segundo Admin/recuperação de acesso, exportação, auditoria global, aceite de termos, Playwright/E2E, edição pelo Admin, convite de funcionários, envio de e-mail, status `CLOSED` (encerramento), exclusão de empresa.

## Anti-objetivos

- MASTER **nunca** vê, define ou recebe a senha do Admin.
- Token de convite **nunca** armazenado em claro (só hash) nem logado/auditado.
- Nenhuma escrita fora de `withScope` / sem auditoria na mesma transação.
- Formulário não pode ficar inutilizável sem `BLOB_READ_WRITE_TOKEN`.

## Restrições do projeto (já existentes — seguir)

- Next 16.4 (ler `node_modules/next/dist/docs/` antes de usar APIs), `cacheComponents` desligado. Prisma 7 + adapter Neon. Auth.js v5 com `sessionId` validado na tabela `Session`.
- RLS: `DATABASE_URL` usa papel `beedock_app`; transações via `withScope({ organizationId })` ou `withScope({ platform: true })` (`lib/db.ts`). `Invitation` e `OrganizationSettings` estão sob RLS e recebem `organizationId` pelo default `app.current_org`.
- Auditoria: `appendAudit` / `withAudit` / `recordAudit` (`lib/audit.ts`). Eventos da plataforma sem empresa vão para a cadeia da plataforma.
- Autorização *(decisão do Claude)*: páginas continuam com `requireMaster()` (redirect, sem mudança). As funções do service do painel recebem um `actor` (`Actor` + `isMaster`) e começam com `assertMaster(actor, action)`: se não for MASTER → `recordAudit(actor, { action, result: "DENIED" })` + `ForbiddenError`. As actions montam o ator a partir de `getCurrentSession()` + `requestMeta`. É isso que o teste "não-MASTER negado e auditado" exercita.
- Design system "Colmeia & Doca" (`previews/design-system.html`), componentes atomic em `components/{atoms,molecules,organisms,templates}`, shadcn em `components/ui`. Mobile-first: `<md` cards + barra inferior/Drawer; `≥md` tabela + sidebar/Sheet/Dialog.
- Validação com Zod 4. Textos em pt-BR.
- Commits sem menção a IA. Usuário executa todo git.

## Decisões do usuário

### 1. Seed MASTER (opção A)

- Variáveis `SEED_MASTER_NAME`, `SEED_MASTER_EMAIL`, `SEED_MASTER_PASSWORD` no `.env` (e documentadas em `.env.example`, sem valor real).
- Roda dentro de `pnpm db:seed` (`prisma/seed.ts`), antes das empresas demo. Se as três variáveis faltarem, pula com aviso (não falha).
- Idempotente: se já existe usuário com o e-mail → garante `platformRole = MASTER` e **não** troca a senha, para não resetá-la a cada seed. Só define a senha quando cria o usuário. *(Decisão do Claude.)*
- Audita `platform.master_seed` (sem a senha) na cadeia da plataforma.
- Senha: em `NODE_ENV=production` recusa com erro se < 10 caracteres; em dev aceita com aviso no console. (Valor dev atual fica só no `.env`.)
- `pnpm create-admin` continua existindo (recuperação manual).

### 2. Dados da empresa (opção B)

MASTER cadastra tudo. Seções do formulário:

| Seção | Campos | Regras |
|---|---|---|
| Identificação | Nome fantasia*, razão social, CPF/CNPJ, slug* | CPF ou CNPJ com dígito verificador validado, salvo só dígitos; slug gerado do nome (minúsculas, sem acento, hífen), editável, `^[a-z0-9-]{3,40}$`, único |
| Contato | Telefone, e-mail | telefone BR (10–11 dígitos), salvo só dígitos |
| Endereço | CEP, rua, número, complemento, bairro, cidade, UF | CEP preenche rua/bairro/cidade/UF via ViaCEP no client; falha do ViaCEP não bloqueia (preenche à mão) |
| Pix | Chave Pix | texto livre (CPF/CNPJ/e-mail/telefone/aleatória) |
| Marca | Logo, cor primária | cor hex validada (reusar `lib/color.ts` para contraste se aplicável) |
| Preferências | Dia de início do mês (1–28), fuso, ociosidade da sessão (min), retenção de clientes (meses), DPO (nome, e-mail, telefone) | gravadas em `OrganizationSettings`; defaults do schema |
| Admin (só na criação) | Nome*, e-mail*, telefone | gera o convite |

`*` obrigatório.

### 3. Acesso do Admin (opção A — convite)

- Token aleatório de 32 bytes (`crypto.randomBytes`, base64url) vai no link `/convite/<token>`; banco guarda só `sha256(token)` em `Invitation.tokenHash`.
- Validade 48h (`expiresAt`). Gerar um convite novo revoga (`revokedAt`) **todos** os convites ADMIN pendentes da empresa, qualquer que seja o e-mail.
- Reenviar (decisão do usuário): o botão abre um mini-formulário (nome*, e-mail*, telefone) preenchido com os dados do último convite e editável, para corrigir um e-mail errado. Mesmo schema da seção Admin da criação e mesma regra de e-mail já existente.
- Admin já ativo (decisão do usuário): se a empresa já tem um Membership ADMIN ativo, o card mostra só "Admin ativo: nome · e-mail", sem botão de convite, e o service recusa `createInvitation`. Segundo Admin e recuperação de acesso ficam fora deste módulo.
- O link em claro é mostrado **uma vez** ao MASTER logo após gerar (card com botão Copiar e botão WhatsApp `https://wa.me/55<telefone>?text=...` se houver telefone). Depois disso só dá para gerar um novo.
- Aceite: página pública mostra nome da empresa e do convidado, pede senha + confirmação (mesmas regras de senha do login/`hashPassword`). Ao aceitar, numa transação: cria `User` (sem `platformRole`), cria `Membership` ADMIN ativa, marca `acceptedAt`, audita `invitation.accept` e `member.create`. Depois redireciona para `/login?convite=aceito` com a mensagem "Conta criada. Entre com seu e-mail e senha." e o e-mail preenchido. Não cria sessão: o login normal cuida disso (decisão do usuário).
- Convite expirado, revogado, já usado ou inexistente → mesma mensagem genérica ("Convite inválido ou expirado. Peça um novo ao suporte.") e auditoria `invitation.invalid` (FAILED) com IP.
- Rate limit: igual ao login — contar `invitation.invalid` por IP na janela de 15 min na auditoria; acima do limite responde a mesma mensagem genérica sem auditar cada tentativa.

### 4. Escopo das ações (opção A)

Cadastrar, editar, listar, gerar/reenviar convite, suspender/reativar. Todas auditadas.

## Design (abordagem aprovada: páginas dedicadas)

### Rotas

| Rota | Acesso | Conteúdo |
|---|---|---|
| `/plataforma` | MASTER | Lista de empresas. Mobile: cards; desktop: tabela. Colunas: nome + slug, status (`StatusBadge`), nº usuários ativos, último acesso (maior `Session.lastSeenAt` da empresa, "nunca" se nenhum), convite pendente (sim/expira em). Botão "Nova empresa". Busca por nome/slug no client se lista pequena (decisão do builder). |
| `/plataforma/empresas/nova` | MASTER | Formulário completo, inclui seção Admin. Ao salvar → redireciona para `/plataforma/empresas/[id]` exibindo o card do convite com o link recém-gerado. |
| `/plataforma/empresas/[id]` | MASTER | Mesmo formulário sem a seção Admin + card "Acesso do Admin" (status do convite / Admin já ativo, botão gerar/reenviar convite, link exibido uma vez) + ação Suspender/Reativar com confirmação (Dialog no desktop, Drawer no mobile). |
| `/convite/[token]` | Público | Aceite do convite. Usa `AuthTemplate`. |

O `(plataforma)` route group ganha um layout próprio do MASTER (header com nome + sair). Reusar `AppShellTemplate` se couber; senão layout simples — decisão do builder.

### Código

```
features/platform/
  schemas.ts      # Zod: organizationSchema, adminInviteSchema, acceptInviteSchema; validadores CPF/CNPJ em lib/ ou aqui
  service.ts      # createOrganization, updateOrganization, listOrganizations, createInvitation,
                  # setOrganizationStatus, acceptInvitation, findInvitationByToken
  actions.ts      # Server Actions: chamam requireMaster (exceto aceite), validam com Zod, chamam service
lib/document.ts   # isValidCpf / isValidCnpj (+ testes)
```

`scripts/create-org.ts` passa a reusar `createOrganization` do service onde fizer sentido, ou permanece como está (decisão do builder; não pode divergir das regras de auditoria).

### Criação da empresa (uma transação)

1. Gerar `id` (cuid) antes.
2. `withScope({ organizationId: novoId }, tx => ...)`:
   - cria `Organization` com o id pré-gerado;
   - `seedOrganizationDefaults(tx, novoId, preferencias)` — a função ganha um 3º parâmetro opcional com os campos de `OrganizationSettings` (ela já cria o settings; `organizationId` é único, então não criar de novo). `create-org` e `prisma/seed.ts` continuam chamando sem o parâmetro. *(Decisão do Claude.)*
   - cria `Invitation` (role ADMIN);
   - `appendAudit` `platform.organization_create` (after = dados sem token) e `invitation.create` (sem token).
3. Ator da auditoria = MASTER logado com `organizationId: novoId` (o evento cai na cadeia da nova empresa, como hoje no `create-org`).
4. Retorna `{ organizationId, inviteUrl }`; a URL só existe na resposta.

Slug duplicado → erro de campo "Este endereço já está em uso." (checar antes + tratar unique violation).
E-mail do Admin que já existe como `User` → erro de campo nesta fase ("Este e-mail já tem conta na plataforma."); checar de novo no aceite. Vincular usuário existente fica para depois. *(Decisão do Claude.)*

### Edição

`updateOrganization` em `withScope({ organizationId })`, audita `platform.organization_update` com `diff(before, after)`. Slug editável com mesma checagem de unicidade.

### Suspensão / reativação

- Suspender: `status = SUSPENDED` e `Session.revokedAt = now()` para todas as sessões ativas com `organizationId` da empresa, na mesma transação; audita `platform.organization_suspend` (motivo opcional em `reason`). `getCurrentSession` já trata empresa não-ACTIVE como sem sessão; a revogação garante que nada sobreviva a uma reativação rápida.
- Reativar: `status = ACTIVE`; audita `platform.organization_reactivate`.
- Login já filtra memberships de empresa ACTIVE.
- Aceitar convite de empresa suspensa → convite inválido (mensagem genérica).

### Logo

- Componente Kibo UI Dropzone (instalar via shadcn registry do Kibo). Recorte quadrado + conversão para WebP no client (canvas), saída ≤ 1MB.
- Server Action valida MIME (`image/png`, `image/jpeg`, `image/webp`) e tamanho ≤ 1MB, envia para Vercel Blob em `org/{organizationId}/logo-<timestamp>.webp`, grava `logoUrl`, audita como parte do update.
- Na criação: o upload acontece depois que a empresa existe (o id é necessário) — o builder decide entre upload no mesmo submit após a transação ou campo habilitado só na edição.
- `BLOB_READ_WRITE_TOKEN` passa a ser **opcional** em `lib/env.ts`. Sem ele, o campo mostra "Upload de logo indisponível neste ambiente" e o resto do formulário funciona.

## Auditoria — eventos novos

| action | cadeia | result |
|---|---|---|
| `platform.master_seed` | plataforma | SUCCESS |
| `platform.organization_create` | empresa nova | SUCCESS |
| `platform.organization_update` | empresa | SUCCESS |
| `platform.organization_suspend` / `_reactivate` | empresa | SUCCESS |
| `invitation.create` | empresa | SUCCESS |
| `invitation.accept`, `member.create` | empresa | SUCCESS |
| `invitation.invalid` | plataforma | FAILED |
| ação do painel por não-MASTER | plataforma | DENIED |

Nenhum evento contém token ou senha (`sanitize` já cobre senha; garantir token fora do `after`).

## Testes

- **Unit (Vitest):** `isValidCpf`/`isValidCnpj` (válidos, inválidos, repetidos tipo 111…, com máscara); schemas Zod (slug, cor, telefone, CEP, dia 1–28); geração de slug.
- **Integração (Neon, `TEST_DATABASE_URL`):**
  - criação completa: org + settings + defaults + convite + 2 eventos de auditoria, tudo ou nada;
  - não-MASTER chamando o service é negado e auditado DENIED;
  - convite expirado, revogado e já usado são recusados; reenviar revoga o anterior;
  - aceite cria user + membership ADMIN e não deixa reaceitar;
  - com Admin ativo, `createInvitation` é recusado;
  - suspensão revoga sessões da empresa e `getCurrentSession`/login deixam de aceitar;
  - `pnpm audit:verify` continua íntegro após os fluxos (desconsiderando os 5 eventos legados SHA-256 já conhecidos).

## Validação de UI

Seguir regra do projeto: `/frontend-design` antes de implementar e validar com `agent-browser` (via `pnpm dlx agent-browser@0.39.1`) no dev server em largura mobile e desktop: lista, criação, card de convite, aceite, suspensão.

## Decisões do Claude (revisar)

- `seedOrganizationDefaults` ganha parâmetro opcional de preferências.
- `assertMaster(actor)` no service com negação auditada; páginas seguem com `requireMaster()`.
- Seed não troca a senha de um MASTER que já existe.
- E-mail de Admin já cadastrado é recusado nesta fase.
- Convite novo revoga todos os pendentes da empresa.

## Deixado para o builder

Estrutura interna dos componentes do formulário, paginação/busca da lista, layout do route group `(plataforma)`, momento do upload do logo na criação, se `create-org` reusa o service, texto exato das mensagens (mantendo tom do projeto).

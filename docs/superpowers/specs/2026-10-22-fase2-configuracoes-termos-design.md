# Fase 2 (restante) — Configurações da empresa e aceite de termos — design

Data: 2026-10-22 · Status: escrito sem rodada de perguntas (usuário pediu "pule as perguntas"). Segue `prompt-beedock.md` e as decisões já tomadas pelo usuário; escolhas do Claude marcadas **[Claude]**.

Contexto obrigatório: `docs/CODEBASE_MAP.md` (withScope/withAudit, RLS, TENANT_MODELS, boundaries, FormState, gotchas de testes).

## Perguntas para o usuário

1. **Textos legais**: quem redige os Termos de Uso e a Política de Privacidade v1? Sem texto publicado, o aceite fica desligado (ver Decisões). O Claude não escreve texto jurídico de produção.
2. **MASTER aceita termos?** Proposta: não (é o operador da plataforma). Se quiser que aceite também, é uma linha a mais na regra.
3. **Fuso horário**: lista fechada com os fusos do Brasil (proposta) ou qualquer fuso IANA (como o painel do MASTER aceita hoje)?

## Intenção

Hoje só o MASTER edita os dados da empresa (painel `/plataforma/empresas/[id]`). O Admin, que é quem conhece o CNPJ, o Pix e o endereço, não consegue corrigir nada, e as preferências (dia de início do mês, fuso, sessão, retenção, DPO) só existem no formulário do MASTER. Além disso, a spec base exige que todo usuário aceite os Termos e a Política de Privacidade no primeiro acesso e a cada nova versão — os models `LegalDocument`/`LegalAcceptance` existem, mas nada os usa.

Sucesso: o Admin abre Configurações ▸ Empresa, troca a cor e o dia de início do mês, salva, e o shell e o Início refletem na hora; a mudança aparece na auditoria. Quando o MASTER publica a versão 2 dos Termos, todo usuário de empresa vê a tela de aceite na próxima navegação e só segue depois de aceitar.

## Objetivos

1. **`/configuracoes/empresa`** (ADMIN, `settings.manage`): dados da empresa, endereço, Pix, logo, cor principal e preferências (dia de início do mês, fuso, minutos de inatividade da sessão, retenção de clientes, DPO).
2. **Logo pelo Admin**: mesmo upload/recorte WebP do MASTER, agora com permissão de tenant; opção "Remover logo".
3. **Termos versionados**: MASTER publica nova versão de Termos de Uso ou Política de Privacidade em `/plataforma/termos`.
4. **Aceite obrigatório**: usuário de empresa com versão pendente é levado a `/aceite` e não usa o app até aceitar. Aceite grava versão, data, IP e user agent.
5. **Páginas públicas** `/termos` e `/privacidade` com a versão vigente.
6. Toda escrita auditada; negação auditada.

## Não-objetivos

- Slug, status (suspender/reativar) e plano continuam só com o MASTER.
- Moeda: fixa em BRL, sem campo na tela (o model mantém `currency`).
- Busca de CEP por ViaCEP **[Claude]**: fora. É um `fetch` externo a mais no client com CSP para ajustar; o Admin digita o endereço uma vez. Entra se o usuário pedir.
- Editor rico/markdown para os termos: texto simples com quebras de linha.
- Termos por empresa (cada empresa com seus próprios termos para clientes finais).
- Envio de e-mail avisando nova versão.
- Recusar os termos com consequência (encerrar conta). Quem não aceita simplesmente não entra; "Sair" fica disponível.

## Anti-objetivos (falha mesmo funcionando)

- Funcionário conseguir alterar qualquer dado da empresa (botão escondido não basta: service com `authorize`).
- Admin alterar slug/status da empresa por formulário forjado (o schema do tenant nem aceita esses campos).
- Usuário com termo pendente executar uma Server Action (o bloqueio tem de estar no guard que as actions usam, não só no layout).
- Versão publicada ser editada ou apagada depois. Versões são imutáveis; corrigir = publicar nova.
- Loop de redirect: a tela de aceite e o logout não podem passar pelo guard que exige aceite.
- Mudança de fuso/dia de início sem aviso de que ela recalcula os meses já exibidos.

## Decisões

### Configurações da empresa

- Rota `app/(app)/configuracoes/empresa/page.tsx` + `loading.tsx`, card novo no topo da lista de `/configuracoes` ("Empresa — Dados, logo, cor e preferências."). Funcionário vê `AdminOnlyNotice` (padrão das outras telas).
- **Reusar `OrganizationForm`** com `mode="tenant"` **[Claude]**: esconde slug e o bloco de convite do Admin; o resto (dados, endereço, Pix, marca, preferências) já existe e já é testado (`values.ts`). Sem formulário novo.
- Schema: `companySettingsSchema = organizationSchema.omit({ slug: true })` em `features/organizations/schemas.ts` (mover/exportar o que for preciso de `features/platform/schemas.ts`; não duplicar regras).
- Service `features/organizations/service.ts`:
  - `getCompanySettings(ctx)` — leitura em `withScope`.
  - `updateCompanySettings(ctx, input)` — `authorize(ctx, "settings.manage")` → `withAudit(ctx, { action: "organization.update", entityType: "Organization", entityId: orgId, ...diff })`. Atualiza `Organization` (global, sem RLS — escrever pelo `tx` da mesma transação) e `OrganizationSettings` (`updatedById`). Reaproveitar `orgData`/`settingsData` do service da plataforma (exportar, não copiar).
  - Se `sessionIdleMinutes` mudou: `updateMany` em `Session` ativas da empresa (`organizationId = org, revokedAt null`) com o novo valor, na mesma tx **[Claude]**. Hoje o valor é copiado só no login/troca de empresa; sem isso a mudança só valeria após novo login.
- Fuso: `AppSelect` com os fusos do Brasil **[Claude]** (`America/Noronha`, `Belem`, `Fortaleza`, `Recife`, `Araguaina`, `Maceio`, `Bahia`, `Sao_Paulo`, `Campo_Grande`, `Cuiaba`, `Santarem`, `Porto_Velho`, `Boa_Vista`, `Manaus`, `Eirunepe`, `Rio_Branco`), rótulo com cidade + UTC. O schema continua validando IANA (o MASTER não muda).
- Aviso inline abaixo de "Dia de início do mês" e "Fuso": "Muda como os meses são calculados em Início, Lançamentos e Relatórios, inclusive meses passados." Sem confirmação extra.
- Após salvar: `revalidatePath("/", "layout")` (cor e logo no shell), toast "Dados salvos".

### Logo

- Extrair o miolo de `features/platform/logo-actions.ts` para `features/organizations/logo.ts` (`uploadLogo(orgId, file)` com validação de tipo/tamanho e `put`), usado por duas actions: a do MASTER (inalterada) e `uploadCompanyLogoAction` (tenant: `requireTenant` → `authorize("settings.manage")`).
- Auditoria: `organization.update` com `before/after.logoUrl` (nome do arquivo, não a URL inteira).
- "Remover logo": `logoUrl = null`, auditado; o blob antigo é apagado depois do commit (falha só loga — mesmo padrão do comprovante).
- Sem `BLOB_READ_WRITE_TOKEN`: dropzone mostra "Upload indisponível neste ambiente" (comportamento atual).

### Termos e política — modelo (já existe, sem migration)

- `LegalDocument(type TERMS|PRIVACY, version, content, publishedAt)`, `@@unique([type, version])`. Vigente = maior `version` por tipo.
- `LegalAcceptance(userId, documentId, acceptedAt, ip, userAgent)`, `@@unique([userId, documentId])`.
- Ambos globais (sem RLS), fora de `TENANT_MODELS`. Nada muda no schema.

### Quem aceita e quando

- **Quem**: todo usuário com vínculo de empresa (ADMIN e FUNCIONARIO). MASTER isento **[Claude]** (é o operador; também quando entra numa empresa como MASTER).
- **Quando**: se existe documento publicado de um tipo e o usuário não aceitou a versão vigente desse tipo. Nenhum documento publicado = nada pendente (ambiente novo e produção limpa funcionam sem texto).
- **Onde trava**: `loadSession` calcula `pendingTerms: boolean` (uma consulta: vigentes sem aceite do usuário; pula para MASTER). `requireTenant` redireciona para `/aceite` quando `pendingTerms`. Como pages, actions e route handlers da empresa passam por `requireTenant`, o bloqueio cobre tudo. **[Claude]** ponytail: uma consulta pequena por request (já cacheada por `React.cache`); guardar na `Session` só se aparecer no perfil de latência.
- **Convite**: `/convite/[token]` ganha a caixa obrigatória "Li e aceito os Termos de Uso e a Política de Privacidade" (links abrem as páginas públicas) quando houver documento publicado; o aceite é gravado na mesma transação do aceite do convite. Assim o usuário novo não vê duas telas seguidas.

### Tela de aceite

- `app/(auth)/aceite/page.tsx` (AuthTemplate): usa `getCurrentSession` (não `requireTenant`); sem sessão → `/login`; nada pendente → `/inicio`.
- Mostra só os documentos pendentes, cada um num bloco rolável (texto com `whitespace-pre-line`), "Versão N · publicada em dd/mm/aaaa" e, se o usuário já aceitou uma versão anterior, o selo "Atualizado".
- Uma caixa "Li e aceito" + botão "Aceitar e continuar"; link "Sair" (LogoutButton). 
- Action `acceptTermsAction(documentIds)` → service `acceptLegalDocuments(actor, ids)`: valida que cada id é a versão **vigente** do seu tipo (aceite de versão antiga é recusado), cria `LegalAcceptance` com `ip`/`userAgent` de `requestMeta` (`createMany` + `skipDuplicates` para clique duplo) e audita `auth.terms_accept` na **cadeia da plataforma** **[Claude]** (o aceite é entre usuário e plataforma, não da empresa), `after: { documents: [{ type, version }] }`.

### Publicação pelo MASTER

- `/plataforma/termos` (requireMaster, link no `PlatformNav`): duas seções (Termos de Uso, Política de Privacidade) com versão vigente, data, nº de aceites da vigente / nº de usuários de empresa ativos, e histórico de versões (somente leitura).
- "Publicar nova versão": Dialog (desktop) / Drawer (mobile) com textarea (10–100.000 caracteres), pré-preenchida com o texto vigente; confirmação "Todos os usuários de empresas precisarão aceitar de novo no próximo acesso."
- Service `publishLegalDocument(actor, { type, content })`: `assertMaster`, `version = max + 1` dentro de `withScope({ platform: true })` com `pg_advisory_xact_lock(hashtext('legal:'||type))`; P2002 → "Outra publicação aconteceu agora. Recarregue." Auditoria `platform.legal_publish` (cadeia da plataforma; `after: { type, version, length }` — não o texto inteiro).
- Sem editar, sem excluir, sem agendar.

### Páginas públicas

- `app/(public)/termos/page.tsx` e `app/(public)/privacidade/page.tsx`, sem sessão, versão vigente, "Versão N, vigente desde dd/mm/aaaa". Sem documento: "Documento ainda não publicado." O contato do encarregado da plataforma e a região dos dados vão **no próprio texto** (sem env nova).
- Links no rodapé do `AuthTemplate` (login/convite) e no menu da conta do app.

### Permissões

| Ação | Admin | Funcionário | MASTER |
|---|---|---|---|
| Ver/editar `/configuracoes/empresa` e logo | sim | não | sim (via empresa ou painel) |
| Publicar termos | — | — | sim |
| Aceitar termos | obrigatório | obrigatório | isento |

Sem chave nova na matriz: `settings.manage` cobre a empresa; publicação usa `assertMaster`.

### Auditoria — eventos

| action | cadeia | quando |
|---|---|---|
| `organization.update` | empresa | Admin/MASTER-na-empresa salva dados, preferências ou logo (diff; campos pessoais mascarados pelo `sanitize`) |
| `auth.terms_accept` | plataforma | aceite (tela ou convite) |
| `platform.legal_publish` | plataforma | nova versão |
| DENIED `settings.manage` | empresa | Funcionário tenta salvar |

`platform.organization_update` (MASTER pelo painel) continua como está.

## Testes (integração Neon, padrão de `tests/`)

Ids escalares nas limpezas (`afterAll`) começam como `""`, nunca `undefined`.

**Cuidado — banco compartilhado:** os testes rodam no banco do dev; publicar um `LegalDocument` de teste deixaria **todos** os usuários do dev pendentes. **[Claude]** separar a regra numa função pura `pendingDocuments(current: {id,type,version}[], acceptedIds: Set<string>)` (testada em unidade) e, na integração, só testar publicação dentro de uma transação revertida (`withScope` + throw no fim) ou apagar via owner no `afterAll` as versões criadas (com o `id` guardado, iniciado `""`).

- Admin atualiza dados + preferências: grava, audita `organization.update` com diff; `slug`/`status` enviados no FormData são ignorados.
- Funcionário: negado + DENIED auditado; nada muda.
- Empresa A não altera empresa B (orgId do contexto, nunca do input).
- `sessionIdleMinutes` alterado atualiza `Session.idleMinutes` das sessões ativas daquela empresa e não de outra.
- MASTER na empresa (actingAsMaster) salva → auditoria com `userRole = MASTER`.
- Termos (função pura + integração conforme acima): sem documento → nada pendente; publica v1 → usuário de empresa pendente, MASTER não; aceita v1 → não pendente; publica v2 → pendente de novo; aceitar versão não vigente é recusado; aceite duplo não duplica linha; auditoria na cadeia da plataforma.
- `requireTenant` com pendência redireciona para `/aceite` (teste de unidade do guard com `loadSession` mockado, se o padrão atual permitir; senão, validação no navegador).
- Convite com caixa de termos: sem marcar → erro de campo; marcado → `LegalAcceptance` criado na mesma tx do vínculo.
- Publicação concorrente da mesma versão: uma falha com mensagem amigável.

## Validação UI

`/frontend-design` antes de implementar. Validar com agent-browser no dev (porta 3004), 1280px e 390px: Admin edita cor → shell muda; Funcionário vê aviso; MASTER publica v1 → Admin é levado a `/aceite`, aceita, volta ao Início; `/termos` público sem login. Alternativa: previews em `previews/`.

## Deixado para o builder

- Nome exato dos arquivos/actions; onde mora `pendingLegalDocuments` (sugestão `features/legal/`).
- Layout da tela de aceite e do histórico de versões (Colmeia & Doca, desktop-first, responsivo).
- Texto exato de avisos e toasts.
- Atualizar `docs/CODEBASE_MAP.md` ao final.

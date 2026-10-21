# Contribuindo

1. Crie uma branch a partir da `main` e abra um Pull Request; a `main` só recebe merge com CI verde.
2. Commits em [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português: `feat(lancamentos): adiciona filtro por categoria`.
3. Rode `pnpm lint && pnpm typecheck && pnpm test && pnpm build` antes de abrir o PR.
4. Regras do projeto:
   - Fluxo: Página → Organismo → Server Action (Zod + sessão) → Service (permissão + `withAudit()`) → Prisma.
   - Componentes seguem Atomic Design; o ESLint (`eslint-plugin-boundaries`) bloqueia imports fora de ordem.
   - Valores em centavos (inteiro); datas em UTC no banco.
   - Nunca versione `.env`, segredos ou dados reais.

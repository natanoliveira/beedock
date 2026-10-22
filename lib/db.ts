import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { scopeArgs, TENANT_MODELS, type Scope } from "@/lib/tenant";

const g = globalThis as unknown as { scopeStore?: AsyncLocalStorage<Scope>; db?: PrismaClient };
g.scopeStore ??= new AsyncLocalStorage<Scope>();
const scopeStore = g.scopeStore;

function createClient(): PrismaClient {
  const base = new PrismaClient({ adapter: new PrismaNeon({ connectionString: env.DATABASE_URL }) });
  return base.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const scope = scopeStore.getStore();
          if (!scope) throw new Error(`Acesso a ${model} fora de withScope()`);
          if ("platform" in scope) return query(args);
          return query(scopeArgs(model, operation, args, scope.organizationId));
        },
      },
    },
  }) as unknown as PrismaClient; // extension só de query: a API pública do cliente não muda
}

export const db = g.db ?? createClient();
if (process.env.NODE_ENV !== "production") g.db = db;

export type Tx = Prisma.TransactionClient;

/**
 * Abre uma transação com o contexto de RLS (app.current_org ou app.platform)
 * e a injeção de organizationId da extension. Toda leitura/escrita de tabela
 * de empresa passa por aqui.
 */
let roleChecked: Promise<void> | undefined;

/** Falha fechada: se DATABASE_URL usar um papel que ignora RLS (dono/superuser/bypass), a aplicação não roda. */
async function assertRlsRole() {
  const [r] = await db.$queryRaw<{ bypass: boolean }[]>`
    SELECT (rolsuper OR rolbypassrls OR pg_has_role(current_user, (SELECT tableowner FROM pg_tables WHERE tablename = 'Customer'), 'MEMBER')) AS bypass
    FROM pg_roles WHERE rolname = current_user`;
  if (r?.bypass) {
    throw new Error("DATABASE_URL usa um papel que ignora RLS. Use o papel beedock_app (veja README).");
  }
}

// Neon pode acordar de suspensão (>2s) e o advisory lock da auditoria espera na fila: timeouts folgados
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

export async function withScope<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  roleChecked ??= assertRlsRole().catch((e: unknown) => {
    roleChecked = undefined;
    throw e;
  });
  await roleChecked;
  return scopeStore.run(scope, () =>
    db.$transaction(async (tx) => {
      if ("platform" in scope) {
        await tx.$executeRaw`SELECT set_config('app.platform', 'on', true)`;
      } else {
        await tx.$executeRaw`SELECT set_config('app.current_org', ${scope.organizationId}, true)`;
      }
      return fn(tx);
    }, TX_OPTIONS),
  );
}

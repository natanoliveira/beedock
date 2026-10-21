// Tabelas com organizationId protegidas por RLS (mesma lista da migration rls_audit + Invitation).
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  "OrganizationSettings",
  "Invitation",
  "Customer",
  "ProductType",
  "Category",
  "PaymentMethod",
  "Order",
  "OrderPayment",
  "Transaction",
]);

export type Scope = { organizationId: string } | { platform: true };

type Args = { where?: object; data?: unknown; create?: unknown };

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert",
]);

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

export class TenantViolationError extends Error {
  constructor(model: string) {
    super(`Tentativa de gravar ${model} em outra empresa`);
  }
}

function assertSameOrg(model: string, data: unknown, organizationId: string) {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (row && typeof row === "object" && "organizationId" in row && row.organizationId !== organizationId) {
      throw new TenantViolationError(model);
    }
  }
}

/**
 * Camada de aplicação do isolamento: força organizationId em todo filtro e
 * recusa gravação com organizationId de outra empresa. Na criação o banco
 * preenche organizationId pelo default (app.current_org) e a RLS confere.
 */
export function scopeArgs<T>(model: string, operation: string, args: T, organizationId: string): T {
  const a = { ...(args as Args) };
  if (WHERE_OPS.has(operation)) a.where = { ...a.where, organizationId };
  if (CREATE_OPS.has(operation)) assertSameOrg(model, operation === "upsert" ? a.create : a.data, organizationId);
  if (operation.startsWith("update") && a.data) assertSameOrg(model, a.data, organizationId);
  if (operation === "upsert") assertSameOrg(model, (args as { update?: unknown }).update, organizationId);
  return a as T;
}

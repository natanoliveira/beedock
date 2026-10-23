import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";

export const DEFAULT_CATEGORIES = {
  INCOME: ["Pedidos", "Outras entradas"],
  EXPENSE: ["Peças lisas", "Insumos", "Energia", "Aluguel", "Transporte", "Manutenção", "Impostos", "Estorno", "Outros"],
} as const;
/** Categorias que o sistema usa nos lançamentos de pedido; localizadas por systemKey, nunca pelo nome. */
export const SYSTEM_CATEGORY = { ORDER_PAYMENT: "ORDER_PAYMENT", ORDER_REFUND: "ORDER_REFUND" } as const;
const SYSTEM_KEY_BY_NAME: Record<string, string> = {
  Pedidos: SYSTEM_CATEGORY.ORDER_PAYMENT,
  Estorno: SYSTEM_CATEGORY.ORDER_REFUND,
};
export const DEFAULT_PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão"];
export const DEFAULT_PRODUCT_TYPES = ["Camisa", "Caneca", "Bolsa", "Boné", "Outros"];

export type OrganizationSettingsData = Omit<
  Prisma.OrganizationSettingsUncheckedCreateInput,
  "id" | "organizationId" | "createdAt" | "updatedAt" | "createdById" | "updatedById"
>;

type SeedTx = Pick<Tx, "organizationSettings" | "category" | "paymentMethod" | "productType">;

/** Cadastros padrão da empresa. Rodar dentro de uma transação com app.current_org = organizationId. */
export async function seedOrganizationDefaults(
  tx: SeedTx,
  organizationId: string,
  settings: Partial<OrganizationSettingsData> = {},
) {
  await tx.organizationSettings.create({ data: { ...settings, organizationId } });
  await tx.category.createMany({
    data: [
      ...DEFAULT_CATEGORIES.INCOME.map((name) => ({
        organizationId,
        type: "INCOME" as const,
        name,
        systemKey: SYSTEM_KEY_BY_NAME[name] ?? null,
      })),
      ...DEFAULT_CATEGORIES.EXPENSE.map((name) => ({
        organizationId,
        type: "EXPENSE" as const,
        name,
        systemKey: SYSTEM_KEY_BY_NAME[name] ?? null,
      })),
    ],
  });
  await tx.paymentMethod.createMany({ data: DEFAULT_PAYMENT_METHODS.map((name) => ({ organizationId, name })) });
  await tx.productType.createMany({ data: DEFAULT_PRODUCT_TYPES.map((name) => ({ organizationId, name })) });
}

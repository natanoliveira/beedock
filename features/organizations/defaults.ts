import type { Tx } from "@/lib/db";

export const DEFAULT_CATEGORIES = {
  INCOME: ["Pedidos", "Outras entradas"],
  EXPENSE: ["Peças lisas", "Insumos", "Energia", "Aluguel", "Transporte", "Manutenção", "Impostos", "Outros"],
} as const;
export const DEFAULT_PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão"];
export const DEFAULT_PRODUCT_TYPES = ["Camisa", "Caneca", "Bolsa", "Boné", "Outros"];

type SeedTx = Pick<Tx, "organizationSettings" | "category" | "paymentMethod" | "productType">;

/** Cadastros padrão da empresa. Rodar dentro de uma transação com app.current_org = organizationId. */
export async function seedOrganizationDefaults(tx: SeedTx, organizationId: string) {
  await tx.organizationSettings.create({ data: { organizationId } });
  await tx.category.createMany({
    data: [
      ...DEFAULT_CATEGORIES.INCOME.map((name) => ({ organizationId, type: "INCOME" as const, name })),
      ...DEFAULT_CATEGORIES.EXPENSE.map((name) => ({ organizationId, type: "EXPENSE" as const, name })),
    ],
  });
  await tx.paymentMethod.createMany({ data: DEFAULT_PAYMENT_METHODS.map((name) => ({ organizationId, name })) });
  await tx.productType.createMany({ data: DEFAULT_PRODUCT_TYPES.map((name) => ({ organizationId, name })) });
}

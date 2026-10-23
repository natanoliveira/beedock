export type CatalogItem = { id: string; name: string; active: boolean; usage: number; type?: "INCOME" | "EXPENSE" };

export type CatalogFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, unknown>;
};

export type CatalogTableProps = {
  /** "category" mostra o tipo (Entrada/Saída) e pede o tipo ao criar. */
  kind: "category" | "method" | "productType";
  items: CatalogItem[];
  /** save*Action: o id (ou null para criar) é vinculado aqui. */
  saveAction: (id: string | null, prev: CatalogFormState, fd: FormData) => Promise<CatalogFormState>;
  /** set*ActiveAction(id, active). */
  setActiveAction: (id: string, active: boolean) => Promise<CatalogFormState>;
};

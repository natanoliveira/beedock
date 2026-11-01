export type AuditFiltersProps = {
  values: { de?: string; ate?: string; pessoa?: string; grupo?: string; resultado?: string; empresa?: string };
  people: { id: string; name: string }[];
  groups: { value: string; label: string }[];
  /** Só na visão da plataforma. */
  companies?: { id: string; name: string }[];
  /** Mantidos ao filtrar (ex.: registro vindo do histórico). */
  hidden?: Record<string, string | undefined>;
  csvHref: string;
};

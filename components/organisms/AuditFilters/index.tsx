import { AppButton } from "@/components/atoms/AppButton";
import { AppInput } from "@/components/atoms/AppInput";
import { AppSelect } from "@/components/atoms/AppSelect";
import type { AuditFiltersProps } from "./AuditFilters.types";

const label = "grid gap-1 text-xs font-bold";

export function AuditFilters({ values, people, groups, companies, hidden = {}, csvHref }: AuditFiltersProps) {
  return (
    <form method="get" className="bg-card grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6">
      {Object.entries(hidden).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <label className={label}>
        De
        <AppInput type="date" name="de" defaultValue={values.de} />
      </label>
      <label className={label}>
        Até
        <AppInput type="date" name="ate" defaultValue={values.ate} />
      </label>
      <label className={label}>
        Pessoa
        <AppSelect name="pessoa" defaultValue={values.pessoa ?? ""}>
          <option value="">Todas</option>
          <option value="master">MASTER</option>
          <option value="system">Sistema</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </AppSelect>
      </label>
      <label className={label}>
        Tipo
        <AppSelect name="grupo" defaultValue={values.grupo ?? ""}>
          <option value="">Todos</option>
          {groups.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </AppSelect>
      </label>
      <label className={label}>
        Resultado
        <AppSelect name="resultado" defaultValue={values.resultado ?? ""}>
          <option value="">Todos</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="DENIED">Negado</option>
        </AppSelect>
      </label>
      {companies && (
        <label className={label}>
          Empresa
          <AppSelect name="empresa" defaultValue={values.empresa ?? ""}>
            <option value="">Todas</option>
            <option value="platform">Plataforma</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </AppSelect>
        </label>
      )}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
        <AppButton type="submit">Filtrar</AppButton>
        <a className="hover:bg-muted inline-flex h-12 items-center rounded-lg border px-4 text-sm font-bold" href={csvHref}>
          Baixar CSV
        </a>
      </div>
    </form>
  );
}

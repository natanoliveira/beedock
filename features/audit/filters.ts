import { ACTION_GROUPS, type ActionGroup } from "./describe";
import type { AuditFilters } from "./queries";

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Querystring → filtros; valores inválidos são descartados (nunca chegam à consulta). */
export function parseAuditFilters(raw: Raw): { filters: AuditFilters; cursor?: string } {
  const get = (k: string): string | undefined => {
    const v = raw instanceof URLSearchParams ? raw.get(k) : raw[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s ? s : undefined;
  };
  const day = (k: string) => {
    const v = get(k);
    return v && ISO_DAY.test(v) ? v : undefined;
  };
  const group = get("grupo");
  const result = get("resultado");
  const cursor = get("cursor");
  return {
    filters: {
      from: day("de"),
      to: day("ate"),
      userId: get("pessoa"),
      group: group && group in ACTION_GROUPS ? (group as ActionGroup) : undefined,
      result: result === "SUCCESS" || result === "DENIED" ? result : undefined,
      entityType: get("entityType"),
      entityId: get("entityId"),
      organizationId: get("empresa"),
    },
    cursor: cursor && /^\d+$/.test(cursor) ? cursor : undefined,
  };
}

export const filtersToQuery = (raw: Raw, extra: Record<string, string | undefined> = {}): string => {
  const { filters } = parseAuditFilters(raw);
  const map: Record<string, string | undefined> = {
    de: filters.from, ate: filters.to, pessoa: filters.userId, grupo: filters.group, resultado: filters.result,
    entityType: filters.entityType, entityId: filters.entityId, empresa: filters.organizationId, ...extra,
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(map)) if (v) p.set(k, v);
  return p.toString();
};

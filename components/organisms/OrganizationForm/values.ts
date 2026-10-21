/** Achata `settings` aninhado nas chaves do FormData ("settings.x"). Aceita valores já planos. */
export function toFormValues(o: Record<string, unknown>): Record<string, unknown> {
  const { settings, ...rest } = o;
  const nested = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  return { ...rest, ...Object.fromEntries(Object.entries(nested).map(([k, v]) => [`settings.${k}`, v])) };
}

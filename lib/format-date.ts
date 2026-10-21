const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" });

/** Fuso fixo para o servidor e o cliente renderizarem o mesmo texto. */
export const formatDateTime = (d: Date | string) => fmt.format(new Date(d));

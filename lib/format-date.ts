const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" });

/** Fuso fixo para o servidor e o cliente renderizarem o mesmo texto. */
export const formatDateTime = (d: Date | string) => fmt.format(new Date(d));

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Fortaleza" });

export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));

/** "2026-10-22" → "22/10/2026" sem passar por Date (sem deslocar o dia por fuso). */
export const formatIsoDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

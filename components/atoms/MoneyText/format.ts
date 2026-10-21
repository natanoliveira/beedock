const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number, signed = false): string {
  const text = brl.format(Math.abs(cents) / 100);
  if (!signed || cents === 0) return cents < 0 ? `−${text}` : text;
  return `${cents < 0 ? "−" : "+"}${text}`;
}

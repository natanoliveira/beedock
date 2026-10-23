/** "85988887777" → "(85) 98888-7777"; fixo de 10 dígitos → "(85) 3333-4444". Outros tamanhos voltam como vieram. */
export function formatPhone(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

/** Link do WhatsApp para número brasileiro só com dígitos (DDD + número). */
export const whatsappUrl = (digits: string) => `https://wa.me/55${digits}`;

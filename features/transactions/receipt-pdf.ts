import { valorPorExtenso } from "./money";
import { beginDocument, brl, formatDocument, headingLines, longDate, safeText, wrap, type ReceiptOrg } from "./pdf-kit";

export type { ReceiptOrg };

export type ReceiptData = {
  org: ReceiptOrg;
  tx: {
    id: string;
    occurredOn: string;
    amountCents: number;
    description: string;
    payerName: string | null;
    payerDocument: string | null;
    paymentMethod: string | null;
  };
  issuedAt: Date;
};

export function receiptNumber(tx: { id: string; occurredOn: string }): string {
  const code = tx.id
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();
  return `R-${tx.occurredOn.slice(0, 4)}-${tx.occurredOn.slice(5, 7)}-${code}`;
}

export function receiptLines(data: ReceiptData) {
  const { org, tx } = data;
  const heading = headingLines(org);

  const amount = brl(tx.amountCents);
  const amountWords = valorPorExtenso(tx.amountCents);
  const payer = tx.payerName?.trim()
    ? `${tx.payerName.trim()}${tx.payerDocument ? `, ${formatDocument(tx.payerDocument)}` : ""}`
    : "____________________";
  const via = tx.paymentMethod ? `, pago via ${tx.paymentMethod}` : "";
  const body = `Recebi(emos) de ${payer}, a importância de ${amount} (${amountWords}), referente a ${tx.description.trim()}${via}.`;
  const stamp = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: org.timezone,
  }).format(data.issuedAt);

  return {
    heading,
    title: "RECIBO",
    number: receiptNumber(tx),
    amount,
    amountWords,
    body,
    place: [org.city, longDate(tx.occurredOn)].filter(Boolean).join(", "),
    signature: org.name,
    footer: `Gerado pelo BeeDock em ${stamp}`,
  };
}

/** `logo`: PNG já pronto; `undefined` busca `org.logoUrl`; `null` desenha sem logo. */
export async function buildReceiptPdf(data: ReceiptData, logo?: Uint8Array | null): Promise<Uint8Array> {
  const L = receiptLines(data);
  const doc = await beginDocument(`Recibo ${L.number}`, data.org, logo);
  const { pdf, regular, bold, M, W, text, centered, ink, muted, page } = doc;
  let y = doc.y;

  y -= 48;
  centered(L.title, y, 26, bold);
  y -= 20;
  centered(`Nº ${L.number}`, y, 11, regular, muted);

  y -= 56;
  centered(L.amount, y, 34, bold);
  y -= 20;
  centered(`(${L.amountWords})`, y, 10, regular, muted);

  y -= 48;
  for (const line of wrap(regular, safeText(regular, L.body), 13, W)) {
    text(line, M, y, 13);
    y -= 21;
  }

  y -= 24;
  text(L.place, M, y, 12);

  y -= 80;
  const sigW = 260;
  const sx = (595.28 - sigW) / 2;
  page.drawLine({ start: { x: sx, y }, end: { x: sx + sigW, y }, thickness: 0.8, color: ink });
  const sig = safeText(regular, L.signature);
  text(sig, (595.28 - regular.widthOfTextAtSize(sig, 11)) / 2, y - 15, 11);

  centered(L.footer, M - 10, 8, regular, muted);
  return pdf.save();
}

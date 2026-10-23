import type { OrderStatus } from "@/generated/prisma/enums";
import { beginDocument, brl, headingLines, safeText, wrap, type ReceiptOrg } from "@/features/transactions/pdf-kit";
import { formatIsoDate } from "@/lib/format-date";
import { formatPhone } from "@/lib/phone";

export type OrderReceiptData = {
  org: ReceiptOrg;
  order: {
    number: number;
    description: string;
    productType: string;
    dueDate: string;
    status: OrderStatus;
    totalCents: number;
    paidCents: number;
    balanceCents: number;
  };
  /** `phone` nulo quando o cliente foi anonimizado. */
  customer: { name: string; phone: string | null };
  payments: { paidAt: string; method: string; amountCents: number }[];
  refund: { amountCents: number; occurredOn: string } | null;
  issuedAt: Date;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  OPEN: "Aberto",
  READY: "Pronto",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

export function orderReceiptLines(data: OrderReceiptData) {
  const { org, order, customer } = data;
  const stamp = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: org.timezone }).format(
    data.issuedAt,
  );
  return {
    heading: headingLines(org),
    title: `PEDIDO #${order.number}`,
    info: [
      `Cliente: ${customer.name}${customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}`,
      `Pedido: ${order.description.trim()}`,
      `Tipo: ${order.productType}`,
      `Entrega: ${formatIsoDate(order.dueDate)}`,
      `Situação: ${STATUS_LABEL[order.status]}`,
    ],
    payments: data.payments.length
      ? data.payments.map((p) => `${formatIsoDate(p.paidAt)} · ${p.method} · ${brl(p.amountCents)}`)
      : ["Nenhum recebimento registrado."],
    totals: { total: brl(order.totalCents), paid: brl(order.paidCents), balance: brl(order.balanceCents) },
    badge: order.status === "CANCELED" ? ("CANCELADO" as const) : order.balanceCents === 0 ? ("QUITADO" as const) : null,
    refund: data.refund ? `Estorno de ${brl(data.refund.amountCents)} em ${formatIsoDate(data.refund.occurredOn)}` : null,
    footer: `Gerado pelo BeeDock em ${stamp}`,
  };
}

const A4_H = 841.89;

/** `logo`: PNG pronto; `undefined` busca `org.logoUrl`; `null` desenha sem logo. Recebimentos longos continuam em nova página. */
export async function buildOrderReceiptPdf(data: OrderReceiptData, logo?: Uint8Array | null): Promise<Uint8Array> {
  const L = orderReceiptLines(data);
  const doc = await beginDocument(`Pedido #${data.order.number}`, data.org, logo);
  const { pdf, regular, bold, M, W, ink, muted } = doc;
  let page = doc.page;
  let y = doc.y;
  const put = (s: string, x: number, yy: number, size: number, f = regular, color = ink) =>
    page.drawText(safeText(f, s), { x, y: yy, size, font: f, color });
  const center = (s: string, yy: number, size: number, f = regular, color = ink) => {
    const t = safeText(f, s);
    put(t, (595.28 - f.widthOfTextAtSize(t, size)) / 2, yy, size, f, color);
  };
  const room = (need: number) => {
    if (y - need >= 80) return;
    page = pdf.addPage([595.28, A4_H]);
    y = A4_H - M;
  };

  y -= 44;
  center(L.title, y, 24, bold);
  if (L.badge) {
    y -= 26;
    center(L.badge, y, 14, bold, muted);
  }

  y -= 34;
  for (const info of L.info) {
    for (const part of wrap(regular, safeText(regular, info), 12, W)) {
      room(18);
      put(part, M, y, 12);
      y -= 18;
    }
  }

  y -= 14;
  room(40);
  put("Recebimentos", M, y, 13, bold);
  y -= 20;
  for (const row of L.payments) {
    for (const part of wrap(regular, safeText(regular, row), 11, W)) {
      room(16);
      put(part, M, y, 11);
      y -= 16;
    }
  }
  if (L.refund) {
    y -= 6;
    room(18);
    put(L.refund, M, y, 11, bold);
    y -= 16;
  }

  y -= 22;
  room(80);
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.8, color: muted });
  for (const [label, value, f] of [
    ["Total", L.totals.total, regular],
    ["Recebido", L.totals.paid, regular],
    ["Saldo", L.totals.balance, bold],
  ] as const) {
    y -= 20;
    put(label, M + W - 240, y, 12, f);
    put(value, M + W - f.widthOfTextAtSize(safeText(f, value), 12), y, 12, f);
  }

  center(L.footer, M - 10, 8, regular, muted);
  return pdf.save();
}

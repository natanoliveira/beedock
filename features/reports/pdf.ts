import { beginDocument, brl, safeText, type ReceiptOrg } from "@/features/transactions/pdf-kit";
import { formatYearMonth, monthLabel, type YearMonth } from "@/features/transactions/period";
import { formatIsoDate } from "@/lib/format-date";
import type { CategoryTotal, MonthlyReport } from "./service";

const A4_H = 841.89;
const ym = (m: YearMonth) => `${String(m.month).padStart(2, "0")}/${m.year}`;

export async function buildReportPdf(
  org: ReceiptOrg,
  r: MonthlyReport,
  startDay: number,
  generatedBy: string,
  generatedAt: Date,
  logo?: Uint8Array | null,
): Promise<Uint8Array> {
  const label = monthLabel(r.month, startDay);
  const doc = await beginDocument(`Relatório ${formatYearMonth(r.month)}`, org, logo);
  const { pdf, regular, bold, M, W, ink, muted } = doc;
  let page = doc.page;
  let y = doc.y - 30;
  const put = (s: string, x: number, size: number, f = regular, color = ink) =>
    page.drawText(safeText(f, s), { x, y, size, font: f, color });
  const right = (s: string, xEnd: number, size: number, f = regular) =>
    put(s, xEnd - f.widthOfTextAtSize(safeText(f, s), size), size, f);
  const room = (need: number) => {
    if (y - need >= 60) return;
    page = pdf.addPage([595.28, A4_H]);
    y = A4_H - M;
  };
  const row = (left: string, value: string, f = regular) => {
    room(16);
    put(left, M, 10, f);
    right(value, M + W, 10, f);
    y -= 16;
  };
  const section = (title: string) => {
    room(40);
    y -= 10;
    put(title, M, 12, bold);
    y -= 18;
  };
  const cats = (list: CategoryTotal[]) =>
    list.length ? list.forEach((c) => row(`${c.name} (${c.pct}%)`, brl(c.totalCents))) : row("Nenhum lançamento.", "");

  put(`RELATÓRIO · ${label.title.toUpperCase()}`, M, 16, bold);
  y -= 16;
  put(`Período: ${formatIsoDate(r.range.from)} a ${formatIsoDate(r.range.to)}`, M, 9, regular, muted);
  y -= 8;

  section("Resumo");
  row("Entradas", brl(r.incomeCents));
  row("Saídas", brl(r.expenseCents));
  row("Lucro", brl(r.profitCents), bold);
  section("Entradas por categoria");
  cats(r.incomeByCategory);
  section("Saídas por categoria");
  cats(r.expenseByCategory);
  section("Últimos 6 meses (entradas / saídas / lucro)");
  for (const m of r.last6) row(ym(m.month), `${brl(m.incomeCents)}  /  ${brl(m.expenseCents)}  /  ${brl(m.profitCents)}`);
  section("Pedidos do período");
  row("Criados", `${r.orders.created.count} · ${brl(r.orders.created.totalCents)}`);
  row("Entregues", `${r.orders.delivered.count} · ${brl(r.orders.delivered.totalCents)}`);
  row("Cancelados", `${r.orders.canceled.count} · estornado ${brl(r.orders.canceled.refundedCents)}`);
  row("A receber (posição de hoje)", brl(r.toReceiveCents), bold);

  const stamp = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: org.timezone }).format(
    generatedAt,
  );
  y = 40;
  put(`Gerado pelo BeeDock em ${stamp} por ${generatedBy}`, M, 8, regular, muted);
  return pdf.save();
}

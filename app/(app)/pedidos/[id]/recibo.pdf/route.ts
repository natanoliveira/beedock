import { buildOrderReceiptPdf, loadOrderReceiptData } from "@/features/orders/receipt";
import { ForbiddenError } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const data = await loadOrderReceiptData(ctx, id);
    if (!data) return new Response("Pedido não encontrado.", { status: 404, headers });
    const pdf = await buildOrderReceiptPdf(data);
    return new Response(Buffer.from(pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pedido-${data.order.number}.pdf"`,
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Sem permissão.", { status: 403, headers });
    throw e;
  }
}

import { loadReceiptFile, ReceiptUnavailableError } from "@/features/transactions/receipt";
import { ForbiddenError } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  try {
    const file = await loadReceiptFile(ctx, id);
    if (!file) return text("Comprovante não encontrado.", 404);
    return new Response(file.stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return text("Sem permissão.", 403);
    if (e instanceof ReceiptUnavailableError) return text("Não foi possível abrir o comprovante agora. Tente de novo.", 502);
    throw e;
  }
}

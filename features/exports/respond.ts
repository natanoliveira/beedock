import { ForbiddenError } from "@/lib/permissions";

const headers = { "Cache-Control": "private, no-store" };

/** Corpo já auditado pelo service; `null` = 404, sem permissão = 403. */
export async function jsonDownload(load: () => Promise<object | null>, filename: (data: object) => string): Promise<Response> {
  try {
    const data = await load();
    if (!data) return new Response("Não encontrado.", { status: 404, headers });
    return new Response(JSON.stringify(data, null, 2), {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${filename(data)}"` },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Sem permissão.", { status: 403, headers });
    throw e;
  }
}

export const orgSlug = (data: object) => (data as { organization?: { slug?: string } }).organization?.slug ?? "dados";

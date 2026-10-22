import type { RequestMeta } from "@/lib/audit";

export function requestMeta(headers: Headers): RequestMeta {
  return {
    // na Vercel x-real-ip é o IP do cliente; o 1º hop do x-forwarded-for pode ser forjado
    ip: headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: headers.get("user-agent"),
    requestId: headers.get("x-vercel-id") ?? crypto.randomUUID(),
  };
}

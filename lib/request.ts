import type { RequestMeta } from "@/lib/audit";

export function requestMeta(headers: Headers): RequestMeta {
  return {
    ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip"),
    userAgent: headers.get("user-agent"),
    requestId: headers.get("x-vercel-id") ?? crypto.randomUUID(),
  };
}

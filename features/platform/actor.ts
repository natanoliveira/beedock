import { headers } from "next/headers";
import { requestMeta } from "@/lib/request";
import { requireAcceptedSession } from "@/lib/session";
import type { PlatformActor } from "./service";

export async function platformActor(): Promise<PlatformActor> {
  const session = await requireAcceptedSession();
  return {
    userId: session.user.id,
    userName: session.user.name,
    isMaster: session.user.isMaster,
    role: session.user.isMaster ? "MASTER" : session.role,
    // MASTER: ações da plataforma passam a empresa explicitamente
    organizationId: session.user.isMaster ? null : (session.organization?.id ?? null),
    meta: requestMeta(await headers()),
  };
}

"use server";

import { requireTenant } from "@/lib/session";
import { toFormState } from "@/lib/form-state";
import { type ChainCheck, verifyOrgChain } from "./queries";

export type VerifyChainState = ({ ok: true } & ChainCheck) | { ok: false; error: string };

export async function verifyChainAction(): Promise<VerifyChainState> {
  try {
    const ctx = await requireTenant();
    return { ok: true, ...(await verifyOrgChain(ctx)) };
  } catch (e) {
    return { ok: false, error: toFormState(e, "").error ?? "Não foi possível verificar agora." };
  }
}

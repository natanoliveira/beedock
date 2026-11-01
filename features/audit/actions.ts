"use server";

import { requireTenant } from "@/lib/session";
import { toFormState } from "@/lib/form-state";
import { platformActor } from "@/features/platform/actor";
import { requireMaster } from "@/lib/session";
import { type ChainCheck, verifyOrgChain, verifyPlatformChains } from "./queries";

export type VerifyChainState = ({ ok: true } & ChainCheck) | { ok: false; error: string };

export async function verifyChainAction(): Promise<VerifyChainState> {
  try {
    const ctx = await requireTenant();
    return { ok: true, ...(await verifyOrgChain(ctx)) };
  } catch (e) {
    return { ok: false, error: toFormState(e, "").error ?? "Não foi possível verificar agora." };
  }
}

/** `target`: "all", "platform" ou id da empresa (vem do filtro da tela). */
export async function verifyPlatformChainsAction(target: string): Promise<VerifyChainState> {
  try {
    await requireMaster();
    return { ok: true, ...(await verifyPlatformChains(await platformActor(), target || "all")) };
  } catch (e) {
    return { ok: false, error: toFormState(e, "").error ?? "Não foi possível verificar agora." };
  }
}

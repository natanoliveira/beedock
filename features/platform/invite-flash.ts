import "server-only";
import { cookies } from "next/headers";

export const INVITE_FLASH = "invite-flash";

/** Somente leitura (render). O cookie é restrito por path à página da empresa, então não precisa do id. */
export async function readInviteFlash(): Promise<string | null> {
  return (await cookies()).get(INVITE_FLASH)?.value ?? null;
}

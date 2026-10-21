import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/audit";

/** Cliente com o papel dono (DIRECT_URL): scripts administrativos, fora da RLS. */
export function ownerClient() {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL ausente no .env");
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
}

export const scriptActor = (name: string): Actor => ({
  userId: null,
  userName: `script:${name}`,
  role: "SCRIPT",
  organizationId: null,
  meta: { ip: null, userAgent: `scripts/${name}`, requestId: crypto.randomUUID() },
});

export async function ask(question: string, { secret = false } = {}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (secret) spawnSync("stty", ["-echo"], { stdio: "inherit" });
  try {
    const answer = (await rl.question(question)).trim();
    if (secret) process.stdout.write("\n");
    return answer;
  } finally {
    if (secret) spawnSync("stty", ["echo"], { stdio: "inherit" });
    rl.close();
  }
}

export async function askPassword(): Promise<string> {
  const password = await ask("Senha (mín. 10 caracteres): ", { secret: true });
  if (password.length < 10) throw new Error("Senha muito curta.");
  if ((await ask("Confirme a senha: ", { secret: true })) !== password) throw new Error("As senhas não conferem.");
  return password;
}

// LGPD: nada de dado pessoal em log. Tudo que sai daqui passa por maskPii.

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE = /(\(?\d{2}\)?\s?)(9?\d{4})-?(\d{4})\b/g;

export function maskPii(text: string): string {
  return text
    .replace(EMAIL, "$1***@$2")
    .replace(CNPJ, "**.***.***/****-**")
    .replace(CPF, "***.***.***-**")
    .replace(PHONE, (_, ddd: string, first: string, last: string) => `${ddd}${first[0]}****-${last}`);
}

type Level = "info" | "warn" | "error";

function write(level: Level, message: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, message, ...data, at: new Date().toISOString() });
  console[level](maskPii(line));
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => write("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => write("warn", message, data),
  error: (message: string, error?: unknown, data?: Record<string, unknown>) =>
    write("error", message, { ...data, error: error instanceof Error ? error.message : String(error) }),
};

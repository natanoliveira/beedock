import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { FieldError, NotFoundError } from "@/features/platform/errors";

export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, unknown>;
};

/** Converte erros esperados em estado de formulário; redirect/notFound são relançados; o resto vira erro genérico. */
export function toFormState(e: unknown, notFound: string, values?: Record<string, unknown>): FormState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { fieldErrors, values };
  }
  if (e instanceof FieldError) return { fieldErrors: { [e.field]: e.message }, values };
  if (e instanceof NotFoundError) return { error: notFound, values };
  if (e instanceof ForbiddenError) return { error: e.message, values };
  unstable_rethrow(e);
  logger.error("action.failed", e);
  return { error: "Não foi possível salvar agora. Tente de novo.", values };
}

/** Campos de texto do FormData; Files ficam de fora. */
export function plainValues(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION") || typeof v !== "string") continue;
    out[k] = v;
  }
  return out;
}
